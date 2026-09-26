// Carregamento dos lançamentos para os painéis de /api/financas.
import { z } from "zod";
import { prisma } from "./db";
import { comValorLiquido } from "./reembolso";
import { escopoDoUsuario } from "./tenant";
import { filtroPeriodo } from "./filtros";
import { opcional } from "./validacao";
import type { LancamentoFinancas } from "./financas";

/** ano/mes da consulta; padrão = mês corrente. */
export const periodoSchema = z.object({
  ano: opcional(z.coerce.number().int().min(2000).max(2100)).default(() => new Date().getFullYear()),
  mes: opcional(z.coerce.number().int().min(1).max(12)).default(() => new Date().getMonth() + 1),
});

/** Lançamentos com competência (mesReferencia, senão data) entre os meses, em UTC. */
export async function carregarLancamentos(userId: string, primeiroMes: string, ultimoMes: string): Promise<LancamentoFinancas[]> {
  const [a0, m0] = primeiroMes.split("-").map(Number);
  const [a1, m1] = ultimoMes.split("-").map(Number);
  const inicio = new Date(Date.UTC(a0, m0 - 1, 1));
  const fim = new Date(Date.UTC(a1, m1, 0, 23, 59, 59, 999));
  return prisma.lancamento.findMany({
    where: escopoDoUsuario(userId, { OR: filtroPeriodo(inicio, fim) }),
    select: { data: true, mesReferencia: true, valor: true, categoria: true, descricao: true, conta: true, valorReembolsado: true },
  }).then((ls) => ls.map(comValorLiquido)); // gastos já descontados dos reembolsos
}

/** Dia de hoje se ano/mes é o mês corrente; null para meses fechados. */
export function diaAtualSeMesCorrente(ano: number, mes: number): number | null {
  const hoje = new Date();
  return hoje.getFullYear() === ano && hoje.getMonth() + 1 === mes ? hoje.getDate() : null;
}
