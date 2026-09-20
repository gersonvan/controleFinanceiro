import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { CATEGORIAS_NEUTRAS } from "@/lib/categorias";
import { filtrosLancamentoSchema, montarWhereLancamentos } from "@/lib/filtros";
import { lerQuery, validar } from "@/lib/validacao";


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
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const v = validar(filtrosLancamentoSchema, lerQuery(req));
  if (!v.ok) return v.resposta;
  const where = montarWhereLancamentos(userId, v.dados);

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
