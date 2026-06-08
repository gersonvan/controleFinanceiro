import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");
  const conta = searchParams.get("conta");
  const categoria = searchParams.get("categoria");
  const tipo = searchParams.get("tipo");
  const busca = searchParams.get("busca");
  const dataInicio = searchParams.get("dataInicio");
  const dataFim = searchParams.get("dataFim");

  const where: Record<string, unknown> = {};
  if (conta) where.conta = conta;
  if (categoria === "__sem__") where.categoria = null;
  else if (categoria) where.categoria = categoria;
  if (tipo) where.tipo = tipo;
  if (busca) where.descricao = { contains: busca, mode: "insensitive" };
  if (dataInicio || dataFim) {
    where.data = {};
    if (dataInicio) (where.data as Record<string, Date>).gte = new Date(dataInicio);
    if (dataFim) (where.data as Record<string, Date>).lte = new Date(dataFim);
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
  const body = await req.json();
  const lancamento = await prisma.lancamento.create({ data: body });
  return NextResponse.json(lancamento, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.lancamento.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, ...data } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const lancamento = await prisma.lancamento.update({
    where: { id },
    data,
  });
  return NextResponse.json(lancamento);
}
