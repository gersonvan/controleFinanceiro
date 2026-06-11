import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const memoria = await prisma.memoriaIA.findMany({
    where: { userId },
    orderBy: { descricao: "asc" },
  });
  return NextResponse.json(memoria);
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { descricao, categoriaCorreta } = await req.json();
  if (!descricao || !categoriaCorreta) {
    return NextResponse.json({ error: "Campos obrigatórios" }, { status: 400 });
  }
  const regra = await prisma.memoriaIA.upsert({
    where: { descricao_userId: { descricao, userId } },
    update: { categoriaCorreta },
    create: { descricao, categoriaCorreta, userId },
  });
  return NextResponse.json(regra);
}

export async function DELETE(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.memoriaIA.deleteMany({ where: { id: parseInt(id), userId } });
  return NextResponse.json({ ok: true });
}
