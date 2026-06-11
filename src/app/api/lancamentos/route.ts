import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";

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

  const where: Record<string, unknown> = { userId };
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

  const body = await req.json();
  const lancamento = await prisma.lancamento.create({ data: { ...body, userId } });
  return NextResponse.json(lancamento, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.lancamento.deleteMany({ where: { id: parseInt(id), userId } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { id, ...data } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const lancamento = await prisma.lancamento.updateMany({
    where: { id, userId },
    data,
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

  const where: Record<string, unknown> = { userId };
  if (ids?.length)     where.id       = { in: ids };
  if (descricaoContem) where.descricao = { contains: descricaoContem, mode: "insensitive" };
  if (categoriaErrada) where.categoria = categoriaErrada;

  const result = await prisma.lancamento.updateMany({
    where,
    data: { categoria: categoriaCorreta },
  });

  return NextResponse.json({ corrigidos: result.count });
}
