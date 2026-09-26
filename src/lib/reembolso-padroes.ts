// Padrões de reembolso aprendidos com as divisões que o usuário já fez:
// "Pix de MARGARET de ~R$ 76,25 → TIM". Um Pix novo do mesmo pagador, com
// valor parecido, é ligado ao gasto desse tipo mais próximo na data que ainda
// tenha o que reembolsar. Funções puras; a leitura/gravação fica em reembolso-dados.ts.
import { chaveMemoria } from "./categorias";

/**
 * Quem está do outro lado do lançamento, sem o texto do banco: "Pix recebido de
 * JANAINA M", "PIX RECEBIDO · JANAINA M" → "janaina m"; "Pix enviado para TIM S A"
 * e "TIM SA" → "tim". Datas/horas e sufixos de empresa (S.A., LTDA…) saem.
 */
export function chaveContraparte(descricao: string): string {
  let d = descricao.replace(/^(.{22}) .{13} BRA\s*$/, "$1").trim();
  // "·" separa o nome (BB: "Pix - Enviado · 10/08 09:50 NOME") ou a mensagem (C6: "Pix enviado para NOME · msg")
  const [antes, ...depois] = d.split("·");
  const rotuloGenerico = /^(pix|pix - (enviado|recebido)|pix (enviado|recebido)|ted|doc)$/i.test(antes.trim());
  d = rotuloGenerico && depois.length ? depois.join(" ") : antes;
  d = d
    .replace(/^\s*(pix recebido de|pix enviado para|recorr[êe]ncia pix enviada para|transfer[êe]ncia (recebida|enviada)( pelo pix)?|pagamento de boleto efetuado|pix no cr[ée]dito|compra no d[ée]bito)\s*-?\s*/i, "")
    .replace(/\s+-\s+.*$/, ""); // "NOME - CPF - BANCO…"
  return chaveMemoria(d).replace(/\s+(s\.? ?a\.?|ltda\.?|me|eireli|epp)$/, "").trim();
}

export interface PadraoReembolso {
  chavePagador: string;  // chaveContraparte do Pix
  chaveGasto: string;    // chaveContraparte do gasto
  valorTipico: number;   // mediana dos Pix que ensinaram o padrão
  vezes: number;
}

/** Tolerância de valor: ±10% (mínimo R$ 1) — um Pix bem diferente é outra coisa. */
export function valorCompativel(valor: number, tipico: number): boolean {
  return Math.abs(valor - tipico) <= Math.max(tipico * 0.1, 1);
}

const mediana = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Aprende um padrão por pagador a partir dos Pix já divididos. Só entram Pix
 * ligados a um único gasto; se o pagador reembolsou gastos diferentes, vale o
 * mais frequente.
 */
export function aprenderPadroes(
  divisoes: { pix: { descricao: string; valor: number }; gastos: { descricao: string }[] }[],
): Map<string, PadraoReembolso> {
  const porPagador = new Map<string, Map<string, number[]>>();
  for (const d of divisoes) {
    if (d.gastos.length !== 1) continue;
    const pagador = chaveContraparte(d.pix.descricao);
    const gasto = chaveContraparte(d.gastos[0].descricao);
    if (!pagador || !gasto) continue;
    const porGasto = porPagador.get(pagador) ?? new Map<string, number[]>();
    porGasto.set(gasto, [...(porGasto.get(gasto) ?? []), d.pix.valor]);
    porPagador.set(pagador, porGasto);
  }
  const padroes = new Map<string, PadraoReembolso>();
  for (const [chavePagador, porGasto] of porPagador) {
    const [chaveGasto, valores] = [...porGasto.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    padroes.set(chavePagador, { chavePagador, chaveGasto, valorTipico: mediana(valores), vezes: valores.length });
  }
  return padroes;
}

export interface GastoCandidato {
  id: number;
  descricao: string;
  data: Date;
  valor: number;            // negativo
  valorReembolsado: number;
}

const DIA = 86_400_000;
/** Janela do gasto em relação ao Pix: o reembolso costuma vir depois, às vezes um pouco antes. */
export const JANELA = { antes: 45 * DIA, depois: 15 * DIA };

/**
 * Gasto para um Pix, se algum padrão se aplica: mesmo pagador, valor compatível,
 * gasto do tipo aprendido dentro da janela, com saldo a reembolsar; o de data
 * mais próxima.
 */
export function sugerirGasto(
  pix: { descricao: string; valor: number; data: Date },
  padroes: Map<string, PadraoReembolso>,
  gastos: GastoCandidato[],
): GastoCandidato | null {
  const padrao = padroes.get(chaveContraparte(pix.descricao));
  if (!padrao || !valorCompativel(pix.valor, padrao.valorTipico)) return null;
  const t = pix.data.getTime();
  const cabem = gastos.filter((g) =>
    chaveContraparte(g.descricao) === padrao.chaveGasto &&
    g.data.getTime() >= t - JANELA.antes && g.data.getTime() <= t + JANELA.depois &&
    -g.valor - g.valorReembolsado >= 0.01,
  );
  cabem.sort((a, b) => Math.abs(a.data.getTime() - t) - Math.abs(b.data.getTime() - t));
  return cabem[0] ?? null;
}

/**
 * Sugestões para vários Pix de uma vez, sem usar duas vezes o mesmo saldo:
 * Margaret e Janaina no mesmo mês dividem a mesma TIM até ela zerar.
 */
export function sugerirVarios(
  pixes: { id: number; descricao: string; valor: number; data: Date }[],
  padroes: Map<string, PadraoReembolso>,
  gastos: GastoCandidato[],
): { entradaId: number; saidaId: number }[] {
  const saldo = new Map(gastos.map((g) => [g.id, g.valorReembolsado]));
  const atuais = () => gastos.map((g) => ({ ...g, valorReembolsado: saldo.get(g.id)! }));
  const pares: { entradaId: number; saidaId: number }[] = [];
  for (const pix of [...pixes].sort((a, b) => a.data.getTime() - b.data.getTime())) {
    const g = sugerirGasto(pix, padroes, atuais());
    if (!g) continue;
    pares.push({ entradaId: pix.id, saidaId: g.id });
    saldo.set(g.id, Math.min(saldo.get(g.id)! + pix.valor, -g.valor));
  }
  return pares;
}
