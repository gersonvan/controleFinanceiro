import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { CATEGORIAS_NEUTRAS } from "@/lib/categorias";
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

  // Limites em UTC: mesReferencia é gravado à meia-noite UTC do dia 1; com o
  // servidor em outro fuso (dev local, UTC-3) `new Date(ano, mes-1, 1)` começaria
  // às 03:00Z e deixaria o mês inteiro de fora.
  const dataInicio = mes
    ? new Date(Date.UTC(ano, mes - 1, 1))
    : new Date(Date.UTC(ano, 0, 1));
  const dataFim = mes
    ? new Date(Date.UTC(ano, mes, 0, 23, 59, 59, 999))
    : new Date(Date.UTC(ano, 11, 31, 23, 59, 59, 999));

  // Filtra por mesReferencia quando preenchido, senão por data
  const dateFilter = { gte: dataInicio, lte: dataFim };
  const lancamentos = await prisma.lancamento.findMany({
    where: escopoDoUsuario(userId, {
      OR: [
        { mesReferencia: { not: null, ...dateFilter } },
        { mesReferencia: null, data: dateFilter },
      ],
    }),
    select: { data: true, valor: true, tipo: true, categoria: true, conta: true },
  });

  // Filtra movimentações internas (não representam receita/despesa real)
  const reais = lancamentos.filter((l) => !CATEGORIAS_NEUTRAS.has(l.categoria ?? ""));

  // Totais gerais
  const totalEntradas = reais
    .filter((l) => l.tipo === "Entrada")
    .reduce((acc, l) => acc + l.valor, 0);
  const totalSaidas = Math.abs(
    reais
      .filter((l) => l.tipo === "Saída")
      .reduce((acc, l) => acc + l.valor, 0)
  );
  const saldo = totalEntradas - totalSaidas;

  // Por categoria (saídas)
  const porCategoria: Record<string, number> = {};
  for (const l of reais) {
    if (l.tipo === "Saída" && l.categoria) {
      porCategoria[l.categoria] = (porCategoria[l.categoria] || 0) + Math.abs(l.valor);
    }
  }

  // Por mês (quando período é um ano)
  const porMes: Record<string, { entradas: number; saidas: number }> = {};
  if (!mes) {
    for (const l of reais) {
      const key = `${l.data.getUTCFullYear()}-${String(l.data.getUTCMonth() + 1).padStart(2, "0")}`;
      if (!porMes[key]) porMes[key] = { entradas: 0, saidas: 0 };
      if (l.tipo === "Entrada") porMes[key].entradas += l.valor;
      else porMes[key].saidas += Math.abs(l.valor);
    }
  }

  // Por conta
  const porConta: Record<string, number> = {};
  for (const l of reais) {
    if (l.tipo === "Saída") {
      porConta[l.conta] = (porConta[l.conta] || 0) + Math.abs(l.valor);
    }
  }

  return NextResponse.json({
    totalEntradas,
    totalSaidas,
    saldo,
    porCategoria: Object.entries(porCategoria)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15),
    porMes: Object.entries(porMes).sort((a, b) => a[0].localeCompare(b[0])),
    porConta: Object.entries(porConta),
  });
}
