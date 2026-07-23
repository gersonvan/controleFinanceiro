import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { dadosDoUsuario, escopoDoUsuario } from "@/lib/tenant";

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

// Perfis PDF nativos — faturas de cartão de crédito (todos usaMesReferencia = true).
const BUILTIN_PDF_PERFIS = [
  { builtin: "nubank-cartao-pdf",   nome: "Nubank — Fatura Cartão",   conta: "Nubank Cartão",   inverterSinal: false },
  { builtin: "c6-cartao-pdf",       nome: "C6 — Fatura Cartão",       conta: "C6 Cartão",       inverterSinal: false },
  { builtin: "itau-cartao-pdf",     nome: "Itaú — Fatura Cartão",     conta: "Itaú Cartão",     inverterSinal: false },
  { builtin: "bradesco-cartao-pdf", nome: "Bradesco — Fatura Cartão", conta: "Bradesco Cartão", inverterSinal: false },
  { builtin: "inter-cartao-pdf",    nome: "Inter — Fatura Cartão",    conta: "Inter Cartão",    inverterSinal: false },
];

const PDF_DEFAULTS = {
  formato: "pdf" as const,
  delimitador: ",",
  linhasPular: 0,
  formatoData: "DD/MM/AAAA",
  modoValor: "unica" as const,
  colData: null, colDescricao: null, colValor: null,
  colEntrada: null, colSaida: null,
  usaMesReferencia: true,
};

async function ensureBuiltinPerfis(userId: string) {
  const allBuiltins = [
    ...BUILTIN_OFX_PERFIS.map((p) => p.builtin),
    ...BUILTIN_PDF_PERFIS.map((p) => p.builtin),
  ];
  const existing = await prisma.perfilImportacao.findMany({
    where: escopoDoUsuario(userId, { builtin: { in: allBuiltins } }),
    select: { builtin: true },
  });
  const existingSet = new Set(existing.map((p) => p.builtin));

  const missingOFX = BUILTIN_OFX_PERFIS.filter((p) => !existingSet.has(p.builtin));
  const missingPDF = BUILTIN_PDF_PERFIS.filter((p) => !existingSet.has(p.builtin));

  const toCreate = [
    ...missingOFX.map((p) => dadosDoUsuario(userId, { ...OFX_DEFAULTS, ...p })),
    ...missingPDF.map((p) => dadosDoUsuario(userId, { ...PDF_DEFAULTS, ...p })),
  ];
  if (toCreate.length > 0) {
    await prisma.perfilImportacao.createMany({ data: toCreate });
  }
}

export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  await ensureBuiltinPerfis(userId);

  // ?todos=true devolve todos (incluindo inativos) — usado pela tela de Configurações
  const todos = new URL(req.url).searchParams.get("todos") === "true";

  const perfis = await prisma.perfilImportacao.findMany({
    where: escopoDoUsuario(userId, todos ? {} : { ativo: true }),
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
    data: dadosDoUsuario(userId, {
      nome, conta, formato,
      delimitador, linhasPular, formatoData,
      modoValor, colData, colDescricao, colValor,
      colEntrada, colSaida, inverterSinal, usaMesReferencia,
      builtin: null,
    }),
  });
  return NextResponse.json(perfil, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id, ativo } = await req.json();
  if (id == null) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.perfilImportacao.updateMany({
    where: escopoDoUsuario(userId, { id: parseInt(id) }),
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
    where: escopoDoUsuario(userId, { id: parseInt(id), builtin: null }),
  });
  return NextResponse.json({ ok: true });
}
