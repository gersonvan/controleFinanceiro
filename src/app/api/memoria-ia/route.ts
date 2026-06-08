import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const memoria = await prisma.memoriaIA.findMany({
    orderBy: { descricao: "asc" },
  });
  return NextResponse.json(memoria);
}

export async function POST(req: NextRequest) {
  const { descricao, categoriaCorreta } = await req.json();
  if (!descricao || !categoriaCorreta) {
    return NextResponse.json({ error: "Campos obrigatórios" }, { status: 400 });
  }
  const regra = await prisma.memoriaIA.upsert({
    where: { descricao },
    update: { categoriaCorreta },
    create: { descricao, categoriaCorreta },
  });
  return NextResponse.json(regra);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.memoriaIA.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ ok: true });
}
