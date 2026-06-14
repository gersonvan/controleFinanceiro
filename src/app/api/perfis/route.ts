import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const perfis = await prisma.perfilImportacao.findMany({
    where: { userId },
    orderBy: [{ builtin: "asc" }, { nome: "asc" }],
  });
  return NextResponse.json(perfis);
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const {
    nome, conta, formato = "csv",
    delimitador = ",", linhasPular = 0, formatoData = "DD/MM/AAAA",
    modoValor = "unica", colData, colDescricao, colValor,
    colEntrada, colSaida, inverterSinal = false, usaMesReferencia = false,
  } = body;

  if (!nome || !conta) {
    return NextResponse.json({ error: "Nome e conta são obrigatórios" }, { status: 400 });
  }

  const perfil = await prisma.perfilImportacao.create({
    data: {
      userId, nome, conta, formato,
      delimitador, linhasPular, formatoData,
      modoValor, colData, colDescricao, colValor,
      colEntrada, colSaida, inverterSinal, usaMesReferencia,
      builtin: null,
    },
  });
  return NextResponse.json(perfil, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Não permite excluir perfis nativos (builtin)
  await prisma.perfilImportacao.deleteMany({
    where: { id: parseInt(id), userId, builtin: null },
  });
  return NextResponse.json({ ok: true });
}
