import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";

// Perfis OFX nativos para os principais bancos brasileiros.
// Todos usam o mesmo parser OFX — só diferem em nome/conta/inverterSinal.
const BUILTIN_OFX_PERFIS = [
  { builtin: "itau-corrente-ofx",    nome: "Itaú — Conta Corrente",    conta: "Itaú Corrente",    inverterSinal: false },
  { builtin: "itau-poupanca-ofx",    nome: "Itaú — Poupança",          conta: "Itaú Poupança",    inverterSinal: false },
  { builtin: "bradesco-corrente-ofx",nome: "Bradesco — Conta Corrente", conta: "Bradesco Corrente",inverterSinal: false },
  { builtin: "santander-corrente-ofx",nome:"Santander — Conta Corrente",conta: "Santander Corrente",inverterSinal: false },
  { builtin: "bb-corrente-ofx",      nome: "Banco do Brasil — Corrente",conta: "BB Corrente",      inverterSinal: false },
  { builtin: "caixa-corrente-ofx",   nome: "Caixa — Conta Corrente",   conta: "Caixa Corrente",   inverterSinal: false },
  { builtin: "nubank-corrente-ofx",  nome: "Nubank — Conta",           conta: "Nubank Conta",     inverterSinal: false },
  { builtin: "inter-corrente-ofx",   nome: "Inter — Conta Corrente",   conta: "Inter Corrente",   inverterSinal: false },
  { builtin: "sicoob-corrente-ofx",  nome: "Sicoob — Conta Corrente",  conta: "Sicoob Corrente",  inverterSinal: false },
  { builtin: "sicredi-corrente-ofx", nome: "Sicredi — Conta Corrente", conta: "Sicredi Corrente", inverterSinal: false },
];

const OFX_DEFAULTS = {
  formato: "ofx" as const,
  delimitador: ",",
  linhasPular: 0,
  formatoData: "DD/MM/AAAA",
  modoValor: "unica" as const,
  colData: null, colDescricao: null, colValor: null,
  colEntrada: null, colSaida: null,
  usaMesReferencia: false,
};

async function ensureBuiltinOFXPerfis(userId: string) {
  const existing = await prisma.perfilImportacao.findMany({
    where: { userId, builtin: { in: BUILTIN_OFX_PERFIS.map((p) => p.builtin) } },
    select: { builtin: true },
  });
  const existingSet = new Set(existing.map((p) => p.builtin));
  const missing = BUILTIN_OFX_PERFIS.filter((p) => !existingSet.has(p.builtin));
  if (missing.length === 0) return;
  await prisma.perfilImportacao.createMany({
    data: missing.map((p) => ({ ...OFX_DEFAULTS, ...p, userId })),
  });
}

export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  await ensureBuiltinOFXPerfis(userId);

  // ?todos=true devolve todos (incluindo inativos) — usado pela tela de Configurações
  const todos = new URL(req.url).searchParams.get("todos") === "true";

  const perfis = await prisma.perfilImportacao.findMany({
    where: { userId, ...(todos ? {} : { ativo: true }) },
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

export async function PATCH(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id, ativo } = await req.json();
  if (id == null) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.perfilImportacao.updateMany({
    where: { id: parseInt(id), userId },
    data: { ativo: Boolean(ativo) },
  });
  return NextResponse.json({ ok: true });
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
