import { interpretarNomeAntigo } from "./bancos";
// Cálculos dos painéis de finanças pessoais: meio de pagamento (crédito ×
// débito), custo de dívida e ritmo do mês. Funções puras sobre lançamentos já
// carregados — as rotas em /api/financas só buscam os dados e chamam estas.
import { CATEGORIAS_NEUTRAS, chaveMemoria } from "./categorias";

export type TipoConta = "corrente" | "cartao";
export type Meio = "cartao" | "pix" | "boleto" | "debito" | "encargos";
export const MEIOS: Meio[] = ["cartao", "pix", "boleto", "debito", "encargos"];

export interface LancamentoFinancas {
  data: Date;
  mesReferencia: Date | null;
  valor: number;
  categoria: string | null;
  descricao: string;
  conta: string;
}

/** Aportes não são gasto: o dinheiro continua do usuário. */
export const CATEGORIA_INVESTIMENTO = "Investimentos (Aportes)";

/** Tipo pelo nome, para conta que (ainda) não está no cadastro: "Nubank · Crédito" → cartão. */
export function tipoSugerido(nomeConta: string): TipoConta {
  return interpretarNomeAntigo(nomeConta).tipo; // a mesma leitura do cadastro de contas
}

const ENCARGOS = /(juros|\biof\b|multa|encargo)/i;

/** Juros, IOF, multa ou encargo cobrado pelo banco. IOF de compra no exterior ("internacional") não é dívida. */
export function ehEncargo(descricao: string): boolean {
  const d = descricao.trim();
  return ENCARGOS.test(d) && !/exterior|internacional/i.test(d);
}
const PIX = /\bpix\b/i;
// Compra no débito: Nubank escreve; no C6 a linha é a loja ("… FORTALEZA BRA"),
// TAG de estacionamento e corridas por app
const DEBITO = /(compra no d[eé]bito|\bbra$|c6tag|^99\*|\buber\b)/i;

export function classificarMeio(l: Pick<LancamentoFinancas, "descricao">, tipo: TipoConta): Meio {
  if (tipo === "cartao") return "cartao";
  const d = l.descricao.trim();
  if (ENCARGOS.test(d)) return "encargos";
  if (PIX.test(d)) return "pix";
  if (DEBITO.test(d)) return "debito";
  return "boleto";
}

/** É gasto do usuário: saída e fora das movimentações internas e aportes. */
export function ehGasto(l: Pick<LancamentoFinancas, "valor" | "categoria">): boolean {
  if (l.valor >= 0) return false;
  if (!l.categoria) return true;
  return !CATEGORIAS_NEUTRAS.has(l.categoria) && l.categoria !== CATEGORIA_INVESTIMENTO;
}

/** Mês de competência "AAAA-MM": fatura manda (mesReferencia), senão a data. Em UTC. */
export function mesCompetencia(l: Pick<LancamentoFinancas, "data" | "mesReferencia">): string {
  const d = l.mesReferencia ?? l.data;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function chaveMes(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

/** Os `n` meses terminando em ano/mes (inclusive), do mais antigo ao mais novo. */
export function mesesAte(ano: number, mes: number, n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(ano, mes - 1 - (n - 1 - i), 1));
    return chaveMes(d.getUTCFullYear(), d.getUTCMonth() + 1);
  });
}

const zerado = (): Record<Meio, number> => ({ cartao: 0, pix: 0, boleto: 0, debito: 0, encargos: 0 });
const soma = (r: Record<Meio, number>) => MEIOS.reduce((a, m) => a + r[m], 0);
const arred = (n: number) => Math.round(n * 100) / 100;

export interface MesPorMeio {
  mes: string;
  porMeio: Record<Meio, number>;
  total: number;
  investido: number;
}

/** Gastos por meio de pagamento em cada mês pedido, mais o investido. */
export function gastosPorMeio(
  lancamentos: LancamentoFinancas[],
  tipos: Map<string, TipoConta>,
  meses: string[],
): MesPorMeio[] {
  const porMes = new Map(meses.map((m) => [m, { porMeio: zerado(), investido: 0 }]));
  for (const l of lancamentos) {
    const alvo = porMes.get(mesCompetencia(l));
    if (!alvo) continue;
    // aplicado (−) soma, resgatado (+) abate: guardado líquido do mês
    if (l.categoria === CATEGORIA_INVESTIMENTO) { alvo.investido += -l.valor; continue; }
    if (!ehGasto(l)) continue;
    const tipo = tipos.get(l.conta) ?? tipoSugerido(l.conta);
    alvo.porMeio[classificarMeio(l, tipo)] += -l.valor;
  }
  return meses.map((mes) => {
    const { porMeio, investido } = porMes.get(mes)!;
    const r = Object.fromEntries(MEIOS.map((m) => [m, arred(porMeio[m])])) as Record<Meio, number>;
    return { mes, porMeio: r, total: arred(soma(r)), investido: arred(investido) };
  });
}

/** Média por meio dos meses que tiveram algum gasto (mês vazio não puxa a média para baixo). */
export function mediaPorMeio(meses: MesPorMeio[]): { porMeio: Record<Meio, number>; total: number; meses: number } {
  const comDados = meses.filter((m) => m.total > 0);
  const r = zerado();
  for (const m of comDados) for (const k of MEIOS) r[k] += m.porMeio[k];
  const n = comDados.length || 1;
  const porMeio = Object.fromEntries(MEIOS.map((k) => [k, arred(r[k] / n)])) as Record<Meio, number>;
  return { porMeio, total: arred(soma(porMeio)), meses: comDados.length };
}

export interface MesDivida { mes: string; juros: number; iof: number; multas: number; devolvido: number; total: number }

/** De onde veio o encargo — é isso que diz o que fazer para evitá-lo. */
export function origemEncargo(descricao: string): string {
  if (/ch(eque|q)\.? ?esp/i.test(descricao)) return "Cheque especial";
  if (/(atras|mora|multa)/i.test(descricao)) return "Atraso de fatura";
  if (/(rotativ|encargo|parcelamento)/i.test(descricao)) return "Rotativo do cartão";
  return "Outros encargos";
}

/**
 * Juros, IOF e multas por mês (devoluções do banco descontadas), maiores
 * lançamentos e a origem que mais pesa. IOF de compra no exterior não é dívida.
 */
export function custoDivida(lancamentos: LancamentoFinancas[], meses: string[]) {
  const porMes = new Map(meses.map((m) => [m, { juros: 0, iof: 0, multas: 0, devolvido: 0 }]));
  const causas = new Map<string, { descricao: string; vezes: number; total: number; meses: Set<string> }>();
  const origens = new Map<string, { origem: string; conta: string; total: number; meses: Set<string> }>();
  for (const l of lancamentos) {
    const d = l.descricao.trim();
    if (!ehEncargo(d)) continue;
    const mes = mesCompetencia(l);
    const alvo = porMes.get(mes);
    if (!alvo) continue;
    if (l.valor > 0) { alvo.devolvido += l.valor; continue; }
    const v = -l.valor;
    if (/juros/i.test(d)) alvo.juros += v;
    else if (/\biof\b/i.test(d)) alvo.iof += v;
    else alvo.multas += v;
    const chave = chaveMemoria(d);
    const c = causas.get(chave) ?? { descricao: d, vezes: 0, total: 0, meses: new Set<string>() };
    c.vezes++; c.total += v; c.meses.add(mes);
    causas.set(chave, c);
    const origem = origemEncargo(d);
    const o = origens.get(`${origem}|${l.conta}`) ?? { origem, conta: l.conta, total: 0, meses: new Set<string>() };
    o.total += v; o.meses.add(mes);
    origens.set(`${origem}|${l.conta}`, o);
  }
  const serie: MesDivida[] = meses.map((mes) => {
    const m = porMes.get(mes)!;
    return {
      mes, juros: arred(m.juros), iof: arred(m.iof), multas: arred(m.multas), devolvido: arred(m.devolvido),
      total: arred(Math.max(m.juros + m.iof + m.multas - m.devolvido, 0)),
    };
  });
  const total = arred(serie.reduce((a, m) => a + m.total, 0));
  const cobrado = serie.reduce((a, m) => a + m.juros + m.iof + m.multas, 0);
  const maiores = [...causas.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)
    .map((c) => ({ descricao: c.descricao, vezes: c.vezes, meses: c.meses.size, total: arred(c.total) }));
  const porOrigem = [...origens.values()]
    .sort((a, b) => b.total - a.total)
    .map((o) => ({ origem: o.origem, conta: o.conta, meses: o.meses.size, total: arred(o.total) }));
  const principal = porOrigem[0];
  return {
    serie,
    total,
    maiores,
    porOrigem,
    mesesComCusto: serie.filter((m) => m.total > 0).length,
    // participação sobre o cobrado (antes das devoluções), para não passar de 100%
    principal: principal && cobrado > 0 ? { ...principal, participacao: Math.round((principal.total / cobrado) * 100) } : null,
  };
}

const diasNoMes = (mes: string) => { const [a, m] = mes.split("-").map(Number); return new Date(Date.UTC(a, m, 0)).getUTCDate(); };

/** Gasto acumulado dia a dia das contas correntes (o cartão entra pela fatura). */
function acumuladoDiario(lancamentos: LancamentoFinancas[], tipos: Map<string, TipoConta>, mes: string): number[] {
  const n = diasNoMes(mes);
  const porDia = new Array(n).fill(0);
  for (const l of lancamentos) {
    if (!ehGasto(l)) continue;
    if ((tipos.get(l.conta) ?? tipoSugerido(l.conta)) === "cartao") continue;
    const chave = chaveMes(l.data.getUTCFullYear(), l.data.getUTCMonth() + 1);
    if (chave !== mes) continue;
    porDia[l.data.getUTCDate() - 1] += -l.valor;
  }
  let acc = 0;
  return porDia.map((v) => arred((acc += v)));
}

/**
 * Ritmo do mês: acumulado diário do mês pedido × média dos meses anteriores
 * (normalizada para 31 dias) e projeção de fim de mês = gasto até hoje +
 * o que a média costuma gastar nos dias que faltam.
 */
export function ritmoDoMes(
  lancamentos: LancamentoFinancas[],
  tipos: Map<string, TipoConta>,
  mes: string,
  anteriores: string[],
  diaAtual: number | null, // null = mês fechado
) {
  const dias = diasNoMes(mes);
  const atualCompleto = acumuladoDiario(lancamentos, tipos, mes);
  const ate = diaAtual ?? dias;
  const atual = atualCompleto.slice(0, ate);

  const series = anteriores.map((m) => acumuladoDiario(lancamentos, tipos, m)).filter((s) => s[s.length - 1] > 0);
  const media = Array.from({ length: dias }, (_, i) => {
    if (series.length === 0) return 0;
    // mês mais curto repete o último dia
    return arred(series.reduce((a, s) => a + s[Math.min(i, s.length - 1)], 0) / series.length);
  });
  const gastoAteHoje = atual[atual.length - 1] ?? 0;
  const restanteMedio = ate < dias && media.length ? media[dias - 1] - media[ate - 1] : 0;
  return {
    dias,
    atual,
    media,
    mediaFim: media[dias - 1] ?? 0,
    gastoAteHoje,
    projecao: diaAtual == null ? null : arred(gastoAteHoje + Math.max(restanteMedio, 0)),
    mesesNaMedia: series.length,
  };
}
