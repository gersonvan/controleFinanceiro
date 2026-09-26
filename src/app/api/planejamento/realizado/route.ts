import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { comValorLiquido } from "@/lib/reembolso";
import { CATEGORIA_INVESTIMENTO } from "@/lib/financas";
import { getSessionUserId } from "@/lib/session";
import { escopoDoUsuario } from "@/lib/tenant";
import { CATEGORIAS_NEUTRAS } from "@/lib/categorias";
import { filtroPeriodo } from "@/lib/filtros";
import { lerQuery, opcional, validar } from "@/lib/validacao";
import { valorMensal, type Grupo, type ItemPlanejado } from "@/lib/planejamento";

const periodoSchema = z.object({
  ano: opcional(z.coerce.number().int().min(2000).max(2100)).default(() => new Date().getFullYear()),
  mes: opcional(z.coerce.number().int().min(1).max(12)).default(() => new Date().getMonth() + 1),
});

export interface LinhaComparacao {
  categoria: string;
  grupos: Grupo[];
  planejado: number;
  realizado: number;
}

export interface Comparacao {
  ano: number;
  mes: number;
  temFotografia: boolean;
  totalLancamentos: number;
  entradas: { planejado: number; realizado: number };
  saidas: { planejado: number; realizado: number };
  margem: number;
  linhas: LinhaComparacao[];        // categorias planejadas
  naoPlanejado: LinhaComparacao[];  // gasto sem item na fotografia
}

// Planejado × Realizado de um mês: o que a fotografia previu por categoria
// contra o que os lançamentos do mês mostram.
export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const v = validar(periodoSchema, lerQuery(req));
  if (!v.ok) return v.resposta;
  const { ano, mes } = v.dados;

  const hoje = new Date();
  const mesesAFrente = (ano - hoje.getFullYear()) * 12 + (mes - (hoje.getMonth() + 1));
  // Em UTC, como o dashboard: mesReferencia fica à meia-noite UTC do dia 1.
  const inicio = new Date(Date.UTC(ano, mes - 1, 1));
  const fim = new Date(Date.UTC(ano, mes, 0, 23, 59, 59, 999));

  const [perfil, itens, lancamentos] = await Promise.all([
    prisma.userProfile.findUnique({ where: escopoDoUsuario(userId) }),
    prisma.planejamentoItem.findMany({ where: escopoDoUsuario(userId) }),
    prisma.lancamento.findMany({
      where: escopoDoUsuario(userId, { OR: filtroPeriodo(inicio, fim) }),
      select: { categoria: true, valor: true, tipo: true, valorReembolsado: true },
    }).then((ls) => ls.map(comValorLiquido)),
  ]);

  // Planejado por categoria (saídas) e grupos em que cada categoria aparece
  const planejado: Record<string, { valor: number; grupos: Set<Grupo> }> = {};
  let entradasPlanejadas = 0;
  for (const item of itens as ItemPlanejado[]) {
    const valor = valorMensal(item, mesesAFrente);
    if (item.grupo === "entrada") { entradasPlanejadas += valor; continue; }
    if (valor <= 0) continue;
    planejado[item.categoria] ??= { valor: 0, grupos: new Set() };
    planejado[item.categoria].valor += valor;
    planejado[item.categoria].grupos.add(item.grupo);
  }

  // Realizado por categoria, sem movimentações internas
  const realizadoSaida: Record<string, number> = {};
  let entradasRealizadas = 0;
  for (const l of lancamentos) {
    const cat = l.categoria || "Sem categoria";
    if (CATEGORIAS_NEUTRAS.has(cat)) continue;
    if (l.tipo === "Entrada") { entradasRealizadas += l.valor; continue; }
    realizadoSaida[cat] = (realizadoSaida[cat] || 0) + Math.abs(l.valor);
  }

  const linhas: LinhaComparacao[] = Object.entries(planejado)
    .map(([categoria, p]) => ({
      categoria, grupos: [...p.grupos], planejado: p.valor, realizado: realizadoSaida[categoria] || 0,
    }))
    .sort((a, b) => b.planejado - a.planejado);

  // Aporte não é gasto: fica na linha própria (se planejado), fora dos totais e dos "não planejados"
  const naoPlanejado: LinhaComparacao[] = Object.entries(realizadoSaida)
    .filter(([categoria]) => !planejado[categoria] && categoria !== CATEGORIA_INVESTIMENTO)
    .map(([categoria, realizado]) => ({ categoria, grupos: [], planejado: 0, realizado }))
    .sort((a, b) => b.realizado - a.realizado);

  const saidasPlanejadas = linhas.filter((l) => l.categoria !== CATEGORIA_INVESTIMENTO).reduce((acc, l) => acc + l.planejado, 0);
  const saidasRealizadas = Object.entries(realizadoSaida)
    .filter(([categoria]) => categoria !== CATEGORIA_INVESTIMENTO)
    .reduce((acc, [, v]) => acc + v, 0);
  const margemPercentual = perfil?.margemPercentual ?? 20;

  return NextResponse.json({
    ano, mes,
    temFotografia: itens.length > 0,
    totalLancamentos: lancamentos.length,
    entradas: { planejado: entradasPlanejadas, realizado: entradasRealizadas },
    saidas: { planejado: saidasPlanejadas, realizado: saidasRealizadas },
    margem: entradasPlanejadas * (margemPercentual / 100),
    linhas,
    naoPlanejado,
  } satisfies Comparacao);
}
