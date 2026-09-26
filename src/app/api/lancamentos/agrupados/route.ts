import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { escopoDoUsuario } from "@/lib/tenant";
import { lerQuery, validar } from "@/lib/validacao";

export interface GrupoDescricao {
  descricao: string;
  quantidade: number;
  total: number;        // soma dos valores (negativo = saída)
  ultimaData: string;   // AAAA-MM-DD
  contas: string[];
}

const filtroSchema = z.object({
  // "__sem__" = sem categoria; qualquer outro valor filtra pela categoria atual
  categoria: z.string().trim().min(1).max(100),
  // com descricao: devolve os lançamentos desse grupo ("Ver os N")
  descricao: z.string().min(1).max(500).optional(),
});

export interface ItemGrupo { id: number; data: string; valor: number; conta: string }

// Lançamentos agrupados pela descrição exata — base da tela "Revisar categorias":
// o mesmo Pix/fornecedor recorrente é categorizado de uma vez só.
export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const v = validar(filtroSchema, lerQuery(req));
  if (!v.ok) return v.resposta;
  const { categoria, descricao } = v.dados;

  if (descricao) {
    const itens = await prisma.lancamento.findMany({
      where: escopoDoUsuario(userId, { categoria: categoria === "__sem__" ? null : categoria, descricao }),
      select: { id: true, data: true, valor: true, conta: true },
      orderBy: { data: "desc" },
      take: 500,
    });
    return NextResponse.json({ itens: itens.map((i) => ({ ...i, data: i.data.toISOString().slice(0, 10) })) });
  }

  const lancamentos = await prisma.lancamento.findMany({
    where: escopoDoUsuario(userId, { categoria: categoria === "__sem__" ? null : categoria }),
    select: { descricao: true, valor: true, data: true, conta: true },
  });

  const grupos = new Map<string, GrupoDescricao>();
  for (const l of lancamentos) {
    const g = grupos.get(l.descricao) ?? {
      descricao: l.descricao, quantidade: 0, total: 0, ultimaData: "", contas: [],
    };
    g.quantidade++;
    g.total += l.valor;
    const dia = l.data.toISOString().slice(0, 10);
    if (dia > g.ultimaData) g.ultimaData = dia;
    if (!g.contas.includes(l.conta)) g.contas.push(l.conta);
    grupos.set(l.descricao, g);
  }

  const lista = [...grupos.values()]
    .map((g) => ({ ...g, total: Math.round(g.total * 100) / 100 }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

  return NextResponse.json({ totalLancamentos: lancamentos.length, grupos: lista.slice(0, 200) });
}
