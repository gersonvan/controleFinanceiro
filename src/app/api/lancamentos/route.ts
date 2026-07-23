import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { dadosAtualizaveisDoUsuario, dadosDoUsuario, escopoDoUsuario } from "@/lib/tenant";

export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");
  const conta = searchParams.get("conta");
  const categoria = searchParams.get("categoria");
  const tipo = searchParams.get("tipo");
  const busca = searchParams.get("busca");
  const pessoa = searchParams.get("pessoa");
  const dataInicio = searchParams.get("dataInicio");
  const dataFim = searchParams.get("dataFim");

  const where = escopoDoUsuario(userId);
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

  const [total, lancamentos] = await Promise.all([
    prisma.lancamento.count({ where }),
    prisma.lancamento.findMany({
      where,
      orderBy: { data: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return NextResponse.json({ lancamentos, total, page, limit });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;
  const lancamento = await prisma.lancamento.create({
    data: dadosDoUsuario(userId, body) as Prisma.LancamentoUncheckedCreateInput,
  });
  return NextResponse.json(lancamento, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.lancamento.deleteMany({ where: escopoDoUsuario(userId, { id: parseInt(id) }) });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;
  const { id, ...data } = body;
  if (typeof id !== "number") return NextResponse.json({ error: "id required" }, { status: 400 });
  const lancamento = await prisma.lancamento.updateMany({
    where: escopoDoUsuario(userId, { id }),
    data: dadosAtualizaveisDoUsuario(userId, data),
  });
  return NextResponse.json(lancamento);
}

export async function PUT(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { ids, descricaoContem, categoriaErrada, categoriaCorreta } = await req.json() as {
    ids?: number[];
    descricaoContem?: string;
    categoriaErrada?: string;
    categoriaCorreta: string;
  };

  const where = escopoDoUsuario(userId);
  if (ids?.length)     where.id       = { in: ids };
  if (descricaoContem) where.descricao = { contains: descricaoContem, mode: "insensitive" };
  if (categoriaErrada) where.categoria = categoriaErrada;

  const result = await prisma.lancamento.updateMany({
    where,
    data: { categoria: categoriaCorreta },
  });

  return NextResponse.json({ corrigidos: result.count });
}
