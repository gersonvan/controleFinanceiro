// Sugestões de valor para a Fotografia do mês a partir do histórico: quanto o
// usuário costuma receber/gastar em cada categoria e em que grupo (fixo,
// variável, sazonal) ela se encaixa. Funções puras — a rota só carrega os dados.
import { CATEGORIAS_NEUTRAS, chaveMemoria } from "./categorias";
import { CATEGORIA_INVESTIMENTO, mesCompetencia, type LancamentoFinancas } from "./financas";
import type { Grupo } from "./planejamento";
import { SUGESTOES } from "./planejamento-sugestoes";

// Não servem de base para valor planejado: movimentação interna, o coringa das
// regras, juros/tarifas (têm painel próprio) e dinheiro que só passa pela conta.
const IGNORAR = new Set([
  ...CATEGORIAS_NEUTRAS,
  "Transferência para Terceiros",
  "Transferência Recebida",
  "Taxas e Anuidades",
  "Estorno",
  "Empréstimo",
  "Recebimento de Empréstimo",
]);
const CATEGORIAS_ENTRADA = new Set(["Salário", "Outras Entradas", "Receita de Aluguel", "Rendimento Investimentos"]);

/** Abaixo disto (por mês) a categoria é ruído para a fotografia. */
export const VALOR_MINIMO_MENSAL = 20;
/** Com menos meses com lançamentos que isto, não há histórico para sugerir. */
export const MESES_MINIMOS = 2;

export interface HistoricoCategoria {
  categoria: string;
  entrada: boolean;
  grupo: Grupo;              // onde costuma se encaixar
  mesesComValor: number;     // dos 6 últimos
  mediana: number;           // dos 6 últimos (mês sem valor conta 0)
  media: number;             // dos 6 últimos
  anual: number;             // soma dos 12 últimos
  maiores: { descricao: string; media: number }[]; // até 3 estabelecimentos, média mensal nos 6
}

export interface HistoricoPlanejamento {
  meses: string[];           // os 6 meses usados nas médias
  mesesComDados: number;
  categorias: HistoricoCategoria[];
}

const arred = (n: number) => Math.round(n);
const mediana = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
/**
 * Nome do estabelecimento para exibir: sem cidade do C6, sem o texto do banco
 * ("Pagamento de boleto efetuado - ", "Pix enviado para "…), sem mensagem do Pix
 * e sem o que vem depois do nome ("- CPF - banco…").
 */
export function nomeCurto(d: string): string {
  const nome = d
    .replace(/^(.{22}) .{13} BRA\s*$/, "$1")
    .replace(/\s*·.*$/, "")
    .replace(/^(pagamento de boleto efetuado|transfer[êe]ncia enviada pelo pix|recorr[êe]ncia pix enviada para|pix enviado para|pix no cr[ée]dito|compra no d[ée]bito)\s*-?\s*/i, "")
    .replace(/\s+-\s+.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return nome.length > 28 ? nome.slice(0, 27).trimEnd() + "…" : nome;
}

/**
 * Etapa da fotografia onde a categoria se encaixa. Se ela aparece nas sugestões
 * de uma etapa só (Compras → variáveis), fica lá; se aparece em mais de uma
 * (Seguros: fixo ou sazonal), o comportamento decide entre elas.
 */
function grupoDaCategoria(categoria: string, valores6: number[]): Grupo {
  const candidatos = (["fixo", "variavel", "sazonal"] as const).filter((g) => SUGESTOES[g].some((s) => s.categoria === categoria));
  const comportamento = grupoPeloComportamento(valores6);
  if (candidatos.length === 0 || candidatos.includes(comportamento as never)) return comportamento;
  if (candidatos.length === 1) return candidatos[0];
  const frequente = valores6.filter((v) => v > 0).length >= 4;
  const preferido: Grupo = frequente ? "fixo" : "sazonal";
  return candidatos.includes(preferido as never) ? preferido : candidatos[0];
}

/** Grupo pelo comportamento: todo mês e estável = fixo; frequente = variável; raro = sazonal. */
function grupoPeloComportamento(valores6: number[]): Grupo {
  const presentes = valores6.filter((v) => v > 0);
  if (presentes.length >= 5) {
    const media = presentes.reduce((a, b) => a + b, 0) / presentes.length;
    const dp = Math.sqrt(presentes.reduce((a, b) => a + (b - media) ** 2, 0) / presentes.length);
    if (dp / media < 0.35) return "fixo";
  }
  return presentes.length >= 3 ? "variavel" : "sazonal";
}

/**
 * Resume os lançamentos dos 12 meses (`meses12`, do mais antigo ao mais novo;
 * os 6 últimos entram nas médias) por categoria.
 */
export function resumirHistorico(lancamentos: LancamentoFinancas[], meses12: string[]): HistoricoPlanejamento {
  const meses6 = meses12.slice(-6);
  const idx12 = new Map(meses12.map((m, i) => [m, i]));
  const comDados = new Set<string>();
  const porCategoria = new Map<string, { entrada: boolean; mensal: number[]; lojas: Map<string, { nome: string; total: number }> }>();

  for (const l of lancamentos) {
    const mes = mesCompetencia(l);
    const i = idx12.get(mes);
    if (i === undefined) continue;
    if (meses6.includes(mes)) comDados.add(mes);
    if (!l.categoria || IGNORAR.has(l.categoria)) continue;
    const entrada = CATEGORIAS_ENTRADA.has(l.categoria);
    // entradas contam o que entrou; saídas, o que saiu (estornos não abatem)
    const v = entrada ? l.valor : -l.valor;
    if (v <= 0) continue;
    const c = porCategoria.get(l.categoria) ?? { entrada, mensal: new Array(12).fill(0), lojas: new Map() };
    c.mensal[i] += v;
    if (meses6.includes(mes)) {
      const nome = nomeCurto(l.descricao);
      const chave = chaveMemoria(nome); // "EDIFICIO LIVORNO" e "Pagamento de boleto efetuado - EDIFICIO LIVORNO" juntos
      const loja = c.lojas.get(chave) ?? { nome, total: 0 };
      loja.total += v;
      c.lojas.set(chave, loja);
    }
    porCategoria.set(l.categoria, c);
  }

  const categorias: HistoricoCategoria[] = [];
  for (const [categoria, c] of porCategoria) {
    const valores6 = c.mensal.slice(-6);
    const media = valores6.reduce((a, b) => a + b, 0) / 6;
    const anual = c.mensal.reduce((a, b) => a + b, 0);
    if (Math.max(media, anual / 12) < VALOR_MINIMO_MENSAL) continue;
    categorias.push({
      categoria,
      entrada: c.entrada,
      grupo: c.entrada ? "entrada" : grupoDaCategoria(categoria, valores6),
      mesesComValor: valores6.filter((v) => v > 0).length,
      mediana: arred(mediana(valores6)),
      media: arred(media),
      anual: arred(anual),
      maiores: [...c.lojas.values()]
        .sort((a, b) => b.total - a.total)
        .slice(0, 3)
        .map((l) => ({ descricao: l.nome, media: arred(l.total / 6) })),
    });
  }
  categorias.sort((a, b) => b.media - a.media);
  return { meses: meses6, mesesComDados: comDados.size, categorias };
}

/** Valor a sugerir para a categoria num grupo (na unidade do grupo: sazonal = por ano). */
export function valorSugerido(h: HistoricoCategoria, grupo: Grupo): number {
  switch (grupo) {
    case "fixo":     return h.mediana || h.media; // mediana: um mês atípico não distorce
    case "sazonal":  return h.anual;
    case "parcela":  return 0;
    default:         return h.media;
  }
}

/** Aportes irregulares (ex.: uma aplicação grande) não viram "gasto encontrado". */
export const fazSentidoSugerirNovo = (h: HistoricoCategoria) => h.categoria !== CATEGORIA_INVESTIMENTO || h.grupo === "fixo";
