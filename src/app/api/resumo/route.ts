import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Categorias que representam movimentações internas (pagamento de fatura,
// transferências entre contas próprias) e não devem entrar nos totais de
// Entradas ou Saídas reais — independente do tipo registrado no extrato.
const CATEGORIAS_NEUTRAS = new Set([
  "Pagamento de Cartão de Crédito",
  "Transferência entre Contas",
  "Gastos de Terceiros",
]);

export interface ResumoFiltro {
  totalEntradas: number;
  totalSaidas: number;
  saldo: number;
  /** Categorias presentes no período, em ordem decrescente de valor total */
  categorias: string[];
  /** { [categoria]: valor } — apenas Entradas */
  entradas: Record<string, number>;
  /** { [categoria]: valor } — apenas Saídas (valores positivos) */
  saidas: Record<string, number>;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const conta      = searchParams.get("conta");
  const categoria  = searchParams.get("categoria");
  const tipo       = searchParams.get("tipo");
  const busca      = searchParams.get("busca");
  const pessoa     = searchParams.get("pessoa");
  const dataInicio = searchParams.get("dataInicio");
  const dataFim    = searchParams.get("dataFim");

  const where: Record<string, unknown> = {};
  if (conta) where.conta = conta;
  if (categoria === "__sem__") where.categoria = null;
  else if (categoria) where.categoria = categoria;
  if (tipo) where.tipo = tipo;
  if (pessoa) where.pessoa = { contains: pessoa, mode: "insensitive" };
  if (busca) where.descricao = { contains: busca, mode: "insensitive" };
  if (dataInicio || dataFim) {
    const dateFilter: Record<string, Date> = {};
    if (dataInicio) dateFilter.gte = new Date(dataInicio);
    if (dataFim)    dateFilter.lte = new Date(dataFim);
    where.OR = [
      { mesReferencia: { not: null, ...dateFilter } },
      { mesReferencia: null, data: dateFilter },
    ];
  }

  const lancamentos = await prisma.lancamento.findMany({
    where,
    select: { valor: true, tipo: true, categoria: true },
  });

  let totalEntradas = 0;
  let totalSaidas   = 0;
  const entradas: Record<string, number> = {};
  const saidas:   Record<string, number> = {};

  for (const l of lancamentos) {
    const cat = l.categoria || "Sem categoria";
    if (CATEGORIAS_NEUTRAS.has(cat)) continue; // pagamento de fatura / transferência interna
    if (l.tipo === "Entrada") {
      totalEntradas += l.valor;
      entradas[cat] = (entradas[cat] || 0) + l.valor;
    } else {
      totalSaidas += Math.abs(l.valor);
      saidas[cat]  = (saidas[cat]  || 0) + Math.abs(l.valor);
    }
  }

  // Todas as categorias presentes, ordenadas pelo maior valor total
  const todasCats = [...new Set([...Object.keys(entradas), ...Object.keys(saidas)])];
  todasCats.sort((a, b) => {
    const ta = (entradas[a] || 0) + (saidas[a] || 0);
    const tb = (entradas[b] || 0) + (saidas[b] || 0);
    return tb - ta;
  });

  return NextResponse.json({
    totalEntradas,
    totalSaidas,
    saldo: totalEntradas - totalSaidas,
    categorias: todasCats,
    entradas,
    saidas,
  } satisfies ResumoFiltro);
}
