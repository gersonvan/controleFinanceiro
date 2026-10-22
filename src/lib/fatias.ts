// Regra 50/30/20: a renda do mês dividida em necessidades (até 50%), desejos
// (até 30%) e futuro (pelo menos 20% — o que foi aplicado ou ficou na conta).
// Funções puras; a rota /api/financas/fatias só carrega os dados.
import { CATEGORIAS_NEUTRAS } from "./categorias";
import { CATEGORIA_INVESTIMENTO, type LancamentoFinancas } from "./financas";
import { grupoDaCategoria, type Catalogo } from "./catalogo-categorias";

export type Fatia = "necessidades" | "desejos" | "futuro";
export const FATIAS: Fatia[] = ["necessidades", "desejos", "futuro"];

export const INFO_FATIA: Record<Fatia, { nome: string; alvo: number; ajuda: string }> = {
  necessidades: { nome: "Necessidades", alvo: 50, ajuda: "o que você pagaria mesmo apertando o cinto" },
  desejos: { nome: "Desejos", alvo: 30, ajuda: "o que melhora a vida, mas dá para cortar" },
  futuro: { nome: "Futuro", alvo: 20, ajuda: "o que foi aplicado ou ficou na conta" },
};

export const ehFatia = (s: unknown): s is Fatia => FATIAS.includes(s as Fatia);

// Fatia de cada categoria nativa de gasto. As que não estão aqui ficam fora da
// conta (movimentação interna, dinheiro emprestado) ou sem fatia (o coringa do Pix).
const FATIA_NATIVA: Record<string, Fatia> = {
  "Aluguel": "necessidades", "Prestação de Imóvel": "necessidades", "Condomínio": "necessidades",
  "Contas de Consumo": "necessidades", "Casa: Manutenção e Móveis": "necessidades", "Serviços Domésticos": "necessidades",
  "Supermercado e Mercearia": "necessidades",
  "Transporte por App": "necessidades", "Automóvel": "necessidades", "Combustível": "necessidades", "Estacionamento": "necessidades",
  "Plano de Saúde": "necessidades", "Consultas e Terapias": "necessidades", "Farmácia": "necessidades",
  "Mensalidades e Cursos": "necessidades", "Pets": "necessidades",
  "Seguros": "necessidades", "Impostos e Tributos": "necessidades", "Taxas e Anuidades": "necessidades",
  "Pagamento de Empréstimos": "necessidades", // parcela é compromisso; quitar além dela é futuro
  "Restaurantes e Lanches": "desejos", "Delivery e iFood": "desejos", "Lazer e Entretenimento": "desejos",
  "Viagem": "desejos", "Compras": "desejos", "Assinaturas Digitais": "desejos", "Cuidados Pessoais": "desejos",
  "Presentes": "desejos", "Doações": "desejos", "Academia e Bem-estar": "desejos",
  [CATEGORIA_INVESTIMENTO]: "futuro",
};

/** Nem gasto nem renda do mês: movimentação interna e dinheiro emprestado a alguém (que volta). */
export const FORA_DA_DIVISAO = new Set<string>([...CATEGORIAS_NEUTRAS, "Empréstimo", "Recebimento de Empréstimo", "Estorno"]);

/** Fatia de uma categoria própria pelo grupo, enquanto o usuário não escolhe outra. */
export function fatiaDoGrupo(grupo: string): Fatia | null {
  if (grupo === "Entradas") return null;
  return grupo === "Pessoal e Lazer" || grupo === "Outras" ? "desejos" : "necessidades";
}

/** Fatia de uma categoria de gasto: nativa, ou própria (a escolhida, senão a do grupo). null = sem fatia. */
export function fatiaDaCategoria(c: Catalogo, nome: string): Fatia | null {
  if (FATIA_NATIVA[nome]) return FATIA_NATIVA[nome];
  const propria = c.personalizadas.find((p) => p.nome === nome);
  if (!propria) return null;
  return ehFatia(propria.fatia) ? propria.fatia : fatiaDoGrupo(grupoDaCategoria(c, nome) ?? "Outras");
}

export interface ParteDaFatia {
  valor: number;
  percentual: number | null; // da renda; null sem renda
  categorias: { categoria: string; valor: number }[];
}

export interface DivisaoMes {
  renda: number;
  necessidades: ParteDaFatia;
  desejos: ParteDaFatia;
  futuro: ParteDaFatia & { aplicado: number; naConta: number }; // naConta < 0 = faltou
  semFatia: { valor: number; categorias: { categoria: string; valor: number }[] };
}

const arred = (n: number) => Math.round(n * 100) / 100;
const SEM_CATEGORIA = "Sem categoria";

/**
 * Divide o mês: renda = entradas (sem movimentação interna, resgates, estornos e
 * empréstimos recebidos); gastos de cada fatia; futuro = aplicado + o que sobrou
 * da renda depois de todos os gastos (inclusive os sem fatia). Os lançamentos
 * já vêm com o valor líquido dos reembolsos (financas-dados.ts).
 */
export function dividirMes(lancamentos: Pick<LancamentoFinancas, "valor" | "categoria">[], c: Catalogo): DivisaoMes {
  let renda = 0;
  const porFatia: Record<Fatia, Map<string, number>> = { necessidades: new Map(), desejos: new Map(), futuro: new Map() };
  const semFatia = new Map<string, number>();
  const somar = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);

  for (const l of lancamentos) {
    const cat = l.categoria ?? "";
    if (FORA_DA_DIVISAO.has(cat)) continue;
    if (l.valor > 0) {
      // resgate de aplicação abate o aplicado; o resto que entra é renda
      if (cat === CATEGORIA_INVESTIMENTO) somar(porFatia.futuro, cat, -l.valor);
      else renda += l.valor;
      continue;
    }
    const fatia = cat ? fatiaDaCategoria(c, cat) : null;
    if (fatia) somar(porFatia[fatia], cat, -l.valor);
    else somar(semFatia, cat || SEM_CATEGORIA, -l.valor);
  }

  const lista = (m: Map<string, number>) => [...m]
    .map(([categoria, valor]) => ({ categoria, valor: arred(valor) }))
    .filter((x) => Math.abs(x.valor) >= 0.01)
    .sort((a, b) => b.valor - a.valor);
  const total = (m: Map<string, number>) => arred([...m.values()].reduce((a, v) => a + v, 0));
  const pct = (v: number) => (renda > 0 ? Math.round((v / renda) * 1000) / 10 : null);
  const parte = (f: Fatia): ParteDaFatia => ({ valor: total(porFatia[f]), percentual: pct(total(porFatia[f])), categorias: lista(porFatia[f]) });

  const necessidades = parte("necessidades");
  const desejos = parte("desejos");
  const aplicado = total(porFatia.futuro);
  const semFatiaTotal = total(semFatia);
  const naConta = arred(renda - necessidades.valor - desejos.valor - semFatiaTotal - aplicado);
  const futuro = arred(aplicado + naConta);
  return {
    renda: arred(renda),
    necessidades, desejos,
    futuro: { valor: futuro, percentual: pct(futuro), categorias: lista(porFatia.futuro), aplicado, naConta },
    semFatia: { valor: semFatiaTotal, categorias: lista(semFatia) },
  };
}
