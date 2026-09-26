// Reserva: quanto o usuário tem guardado e onde. Cada reserva tem um saldo
// informado numa data; depois dela, aplicações (−) e resgates (+) de
// Investimentos (Aportes) na conta da reserva atualizam a estimativa.
import { CATEGORIA_INVESTIMENTO } from "./financas";

export const TIPOS_RESERVA = ["investimento", "previdencia", "conta"] as const;
export type TipoReserva = (typeof TIPOS_RESERVA)[number];

export interface ReservaBase {
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
  return lancamentos.filter((l) =>
    l.categoria === CATEGORIA_INVESTIMENTO &&
    l.conta === r.conta &&
    l.data.getTime() > r.dataSaldo.getTime() &&
    (!filtro || l.descricao.toLowerCase().includes(filtro)),
  );
}

/** Saldo estimado hoje: informado + aplicado − resgatado desde a data do saldo. */
export function saldoEstimado(r: ReservaBase, lancamentos: MovimentoReserva[]): { saldo: number; aplicado: number; resgatado: number } {
  let aplicado = 0, resgatado = 0;
  for (const l of movimentosDaReserva(r, lancamentos)) {
    if (l.valor < 0) aplicado += -l.valor; else resgatado += l.valor;
  }
  const arred = (n: number) => Math.round(n * 100) / 100;
  return { saldo: arred(r.saldoInformado + aplicado - resgatado), aplicado: arred(aplicado), resgatado: arred(resgatado) };
}

/** Totais: disponível (pode usar) e bloqueado (ex.: previdência). */
export function totaisReserva(rs: { saldo: number; bloqueada: boolean }[]) {
  const disponivel = rs.filter((r) => !r.bloqueada).reduce((a, r) => a + r.saldo, 0);
  const bloqueado = rs.filter((r) => r.bloqueada).reduce((a, r) => a + r.saldo, 0);
  const arred = (n: number) => Math.round(n * 100) / 100;
  return { disponivel: arred(disponivel), bloqueado: arred(bloqueado), total: arred(disponivel + bloqueado) };
}
