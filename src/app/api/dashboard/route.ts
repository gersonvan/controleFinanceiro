import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Categorias de movimentação interna que não representam receita nem despesa real
const CATEGORIAS_NEUTRAS = new Set([
  "Pagamento de Cartão de Crédito",
  "Transferência entre Contas",
  "Gastos de Terceiros",
]);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ano = parseInt(searchParams.get("ano") || String(new Date().getFullYear()));
  const mes = searchParams.get("mes") ? parseInt(searchParams.get("mes")!) : null;

  const dataInicio = mes
    ? new Date(ano, mes - 1, 1)
    : new Date(ano, 0, 1);
  const dataFim = mes
    ? new Date(ano, mes, 0, 23, 59, 59)
    : new Date(ano, 11, 31, 23, 59, 59);

  // Filtra por mesReferencia quando preenchido, senão por data
  const dateFilter = { gte: dataInicio, lte: dataFim };
  const lancamentos = await prisma.lancamento.findMany({
    where: {
      OR: [
        { mesReferencia: { not: null, ...dateFilter } },
        { mesReferencia: null, data: dateFilter },
      ],
    },
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
      const key = `${l.data.getFullYear()}-${String(l.data.getMonth() + 1).padStart(2, "0")}`;
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
