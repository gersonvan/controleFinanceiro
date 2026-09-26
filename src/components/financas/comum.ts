// Tipos das respostas de /api/financas e formatação compartilhada pelos painéis.
import type { Meio, MesDivida, MesPorMeio } from "@/lib/financas";

export const MEIO_INFO: Record<Meio, { nome: string; cor: string }> = {
  pix: { nome: "Pix", cor: "#1C8C83" },
  boleto: { nome: "Boletos e contas", cor: "#D08A2E" },
  cartao: { nome: "Cartão de crédito", cor: "#2F3E8F" },
  debito: { nome: "Débito", cor: "#8FA5D8" },
  encargos: { nome: "Juros e encargos", cor: "#B3261E" },
};

/** O que evita cada origem de custo de dívida. */
export const DICA_ORIGEM: Record<string, string> = {
  "Cheque especial": "Evitar que a conta fique negativa zeraria quase todo esse custo.",
  "Atraso de fatura": "Débito automático da fatura evita multa, mora e IOF de atraso.",
  "Rotativo do cartão": "Pagar a fatura inteira evita o rotativo, o crédito mais caro do mercado.",
};

export const COR_DIVIDA = { juros: "#8E1F18", iof: "#E3A59E", multas: "#D08A2E" };

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "2026-09" → "set" */
export const mesCurto = (chave: string) => MESES_CURTOS[Number(chave.slice(5, 7)) - 1];
/** "2026-09" → "setembro" */
export const mesLongo = (chave: string) => MESES_LONGOS[Number(chave.slice(5, 7)) - 1];
/** Intervalo "abr–ago" de uma lista de meses. */
export const intervalo = (meses: string[]) =>
  meses.length === 0 ? "" : meses.length === 1 ? mesCurto(meses[0]) : `${mesCurto(meses[0])}–${mesCurto(meses[meses.length - 1])}`;

export const fmt = (v: number | undefined) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
/** Sem centavos, para cartões e eixos. */
export const fmtInteiro = (v: number | undefined) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export interface RespostaMeios {
  meses: MesPorMeio[];
  atual: MesPorMeio;
  media: { porMeio: Record<Meio, number>; total: number; meses: number };
}

export interface RespostaRitmo {
  dias: number;
  atual: number[];
  media: number[];
  mediaFim: number;
  gastoAteHoje: number;
  projecao: number | null;
  mesesNaMedia: number;
  cartaoNoMes: number;
}

export interface RespostaDivida {
  serie: MesDivida[];
  total: number;
  maiores: { descricao: string; vezes: number; meses: number; total: number }[];
  porOrigem: { origem: string; conta: string; meses: number; total: number }[];
  mesesComCusto: number;
  principal: { origem: string; conta: string; meses: number; total: number; participacao: number } | null;
  mes: MesDivida;
}

/** Busca JSON de uma rota de /api/financas; null em erro. */
export async function buscar<T>(rota: string, ano: number, mes: number): Promise<T | null> {
  try {
    const r = await fetch(`${rota}?ano=${ano}&mes=${mes}`);
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}
