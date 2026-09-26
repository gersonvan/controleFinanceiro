// Reserva: quanto o usuário tem guardado e onde. Cada reserva tem um saldo
// informado numa data; depois dela, os lançamentos atualizam a estimativa:
//  - investimento/previdência: aplicações (−) e resgates (+) de Investimentos na conta;
//  - conta corrente (tipo "conta"): todos os lançamentos da conta, entradas e saídas.
import { CATEGORIA_INVESTIMENTO } from "./financas";

export const TIPOS_RESERVA = ["investimento", "previdencia", "conta"] as const;
export type TipoReserva = (typeof TIPOS_RESERVA)[number];

export interface ReservaBase {
  tipo?: string;
  saldoInformado: number;
  dataSaldo: Date;
  conta: string | null;
  filtroDescricao: string | null;
}

export interface MovimentoReserva { data: Date; descricao: string; valor: number; conta: string; categoria: string | null }

/** Lançamentos que movimentam a reserva depois da data do saldo informado. */
export function movimentosDaReserva<T extends MovimentoReserva>(r: ReservaBase, lancamentos: T[]): T[] {
  if (!r.conta) return [];
  const filtro = r.filtroDescricao?.trim().toLowerCase();
  const ehConta = r.tipo === "conta";
  return lancamentos.filter((l) =>
    (ehConta || l.categoria === CATEGORIA_INVESTIMENTO) &&
    l.conta === r.conta &&
    l.data.getTime() > r.dataSaldo.getTime() &&
    (!filtro || l.descricao.toLowerCase().includes(filtro)),
  );
}

/**
 * Saldo estimado hoje: informado + o que entrou − o que saiu desde a data do saldo.
 * Investimento: entra a aplicação (saída da conta) e sai o resgate. Conta: o próprio lançamento.
 */
export function saldoEstimado(r: ReservaBase, lancamentos: MovimentoReserva[]): { saldo: number; aplicado: number; resgatado: number } {
  let aplicado = 0, resgatado = 0;
  const sinal = r.tipo === "conta" ? 1 : -1;
  for (const l of movimentosDaReserva(r, lancamentos)) {
    const v = sinal * l.valor;
    if (v > 0) aplicado += v; else resgatado += -v;
  }
  const arred = (n: number) => Math.round(n * 100) / 100;
  return { saldo: arred(r.saldoInformado + aplicado - resgatado), aplicado: arred(aplicado), resgatado: arred(resgatado) };
}

/** Totais: em conta corrente, aplicado disponível, bloqueado (ex.: previdência). */
export function totaisReserva(rs: { saldo: number; bloqueada: boolean; tipo?: string }[]) {
  const soma = (f: (r: { saldo: number; bloqueada: boolean; tipo?: string }) => boolean) => rs.filter(f).reduce((a, r) => a + r.saldo, 0);
  const emConta = soma((r) => r.tipo === "conta");
  const disponivel = soma((r) => r.tipo !== "conta" && !r.bloqueada);
  const bloqueado = soma((r) => r.tipo !== "conta" && r.bloqueada);
  const arred = (n: number) => Math.round(n * 100) / 100;
  return {
    emConta: arred(emConta), disponivel: arred(disponivel), bloqueado: arred(bloqueado),
    total: arred(disponivel + bloqueado),        // guardado (aplicações)
    geral: arred(emConta + disponivel + bloqueado),
  };
}
