// Dashboard: totais do período (um mês ou o ano), saídas por categoria e por conta,
// e entradas × saídas mês a mês (lib/dashboard.ts, agregarDashboard).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { comValorLiquido } from "@/lib/reembolso";
import { getSessionUserId } from "@/lib/session";
import { agregarDashboard } from "@/lib/dashboard";
import { filtroPeriodo } from "@/lib/filtros";
import { escopoDoUsuario } from "@/lib/tenant";
import { lerQuery, opcional, validar } from "@/lib/validacao";
import { z } from "zod";

const periodoSchema = z.object({
  ano: opcional(z.coerce.number().int().min(2000).max(2100)).default(() => new Date().getFullYear()),
  mes: opcional(z.coerce.number().int().min(1).max(12)),
});


export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const v = validar(periodoSchema, lerQuery(req));
  if (!v.ok) return v.resposta;
  const { ano, mes } = v.dados;

  // Do primeiro mês do gráfico (no mês: os 5 anteriores também) ao fim do período.
  // Limites em UTC: mesReferencia é gravado à meia-noite UTC do dia 1; com o
  // servidor em outro fuso (dev local, UTC-3) `new Date(ano, mes-1, 1)` começaria
  // às 03:00Z e deixaria o mês inteiro de fora.
  const inicio = mes ? new Date(Date.UTC(ano, mes - 6, 1)) : new Date(Date.UTC(ano, 0, 1));
  const fim = mes ? new Date(Date.UTC(ano, mes, 0, 23, 59, 59, 999)) : new Date(Date.UTC(ano, 11, 31, 23, 59, 59, 999));

  // mesReferencia manda no período quando preenchido (fatura), senão vale a data
  const lancamentos = await prisma.lancamento.findMany({
    where: escopoDoUsuario(userId, { OR: filtroPeriodo(inicio, fim) }),
    select: { data: true, mesReferencia: true, valor: true, tipo: true, categoria: true, conta: true, valorReembolsado: true },
  }).then((ls) => ls.map(comValorLiquido)); // gastos já descontados dos reembolsos

  return NextResponse.json(agregarDashboard(lancamentos, ano, mes));
}
