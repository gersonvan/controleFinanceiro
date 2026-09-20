// Fotografia do mês: itens planejados por grupo e sua conversão para valor
// mensal. Usado pelo wizard (resumo), por /api/planejamento, pelo
// Planejado × Realizado e pela Previsão.

export const GRUPOS = ["entrada", "fixo", "variavel", "sazonal", "parcela"] as const;
export type Grupo = (typeof GRUPOS)[number];

export const PERIODICIDADES = ["mensal", "semanal", "anual"] as const;
export type Periodicidade = (typeof PERIODICIDADES)[number];

export const ROTULO_GRUPO: Record<Grupo, string> = {
  entrada: "Entradas",
  fixo: "Gastos fixos",
  variavel: "Gastos variáveis",
  sazonal: "Gastos sazonais",
  parcela: "Parcelas em andamento",
};

export interface ItemPlanejado {
  grupo: Grupo;
  descricao: string;
  categoria: string;
  valor: number; // sempre positivo; a unidade é dada pela periodicidade
  periodicidade: Periodicidade;
  parcelaAtual?: number | null; // só grupo "parcela": parcela sendo paga neste mês
  parcelaTotal?: number | null;
}

const SEMANAS_POR_MES = 52 / 12;

/**
 * Quanto o item pesa num mês `mesesAFrente` meses depois do atual (0 = este mês).
 * Parcelas deixam de pesar quando passam da última.
 */
export function valorMensal(item: ItemPlanejado, mesesAFrente = 0): number {
  if (item.grupo === "parcela") {
    return parcelaDevida(item, mesesAFrente) ? item.valor : 0;
  }
  switch (item.periodicidade) {
    case "semanal": return item.valor * SEMANAS_POR_MES;
    case "anual":   return item.valor / 12;
    default:        return item.valor;
  }
}

export function parcelaDevida(item: ItemPlanejado, mesesAFrente = 0): boolean {
  if (item.parcelaAtual == null || item.parcelaTotal == null) return false;
  const n = item.parcelaAtual + mesesAFrente;
  return n >= 1 && n <= item.parcelaTotal; // mesesAFrente negativo = mês passado
}

/** Número da parcela que vence em `mesesAFrente` meses, ou null se já quitou. */
export function numeroParcela(item: ItemPlanejado, mesesAFrente = 0): number | null {
  if (!parcelaDevida(item, mesesAFrente)) return null;
  return item.parcelaAtual! + mesesAFrente;
}

export interface TotaisMensais {
  entradas: number;
  fixos: number;
  variaveis: number;
  sazonais: number;
  parcelas: number;
  saidas: number;   // fixos + variaveis + sazonais + parcelas
  margem: number;   // entradas × margemPercentual
  sobra: number;    // entradas − saidas − margem (negativo = falta)
}

export function totaisMensais(itens: ItemPlanejado[], margemPercentual: number): TotaisMensais {
  const soma = (grupo: Grupo) =>
    itens.filter((i) => i.grupo === grupo).reduce((acc, i) => acc + valorMensal(i), 0);

  const entradas = soma("entrada");
  const fixos = soma("fixo");
  const variaveis = soma("variavel");
  const sazonais = soma("sazonal");
  const parcelas = soma("parcela");
  const saidas = fixos + variaveis + sazonais + parcelas;
  const margem = entradas * (margemPercentual / 100);

  return { entradas, fixos, variaveis, sazonais, parcelas, saidas, margem, sobra: entradas - saidas - margem };
}

/** Planejado por categoria (mensalizado), só saídas — base do Planejado × Realizado. */
export function planejadoPorCategoria(itens: ItemPlanejado[], mesesAFrente = 0): Record<string, number> {
  const porCategoria: Record<string, number> = {};
  for (const item of itens) {
    if (item.grupo === "entrada") continue;
    const v = valorMensal(item, mesesAFrente);
    if (v <= 0) continue;
    porCategoria[item.categoria] = (porCategoria[item.categoria] || 0) + v;
  }
  return porCategoria;
}
