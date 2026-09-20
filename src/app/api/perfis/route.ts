import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { dadosDoUsuario, escopoDoUsuario } from "@/lib/tenant";
import { z } from "zod";
import { idSchema, lerCorpo, lerQuery, validar } from "@/lib/validacao";

const nomeSchema = z.string().trim().min(1, "Nome e conta são obrigatórios").max(100);
const colunaSchema = z.number().int().min(0).max(200).nullable().optional();

// Mapeamento de leitura de um perfil personalizado (CSV/OFX/PDF).
const mapeamentoSchema = z.object({
  delimitador: z.string().min(1).max(2).default(","),
  linhasPular: z.number().int().min(0).max(100).default(0),
  formatoData: z.enum(["DD/MM/AAAA", "AAAA-MM-DD", "DD-MM-AAAA", "MM/DD/AAAA"]).default("DD/MM/AAAA"),
  modoValor: z.enum(["unica", "separadas"]).default("unica"),
  colData: colunaSchema,
  colDescricao: colunaSchema,
  colParcela: colunaSchema,
  colValor: colunaSchema,
  colEntrada: colunaSchema,
  colSaida: colunaSchema,
  inverterSinal: z.boolean().default(false),
  usaMesReferencia: z.boolean().default(false),
});

const criacaoSchema = mapeamentoSchema.extend({
  nome: nomeSchema,
  conta: nomeSchema,
  formato: z.enum(["csv", "ofx", "pdf"]).default("csv"),
  ativo: z.boolean().default(true),
});

// PATCH tem duas formas: só { id, ativo } (perfis nativos e personalizados)
// ou o mapeamento completo (apenas perfis personalizados).
const ativacaoSchema = z.object({ id: idSchema, ativo: z.boolean() });
const edicaoSchema = mapeamentoSchema.extend({ id: idSchema, nome: nomeSchema, conta: nomeSchema });

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
  colData: null, colDescricao: null, colParcela: null, colValor: null,
  colEntrada: null, colSaida: null,
  usaMesReferencia: true,
};

const BUILTIN_CSV_PERFIS = [
  {
    builtin: "c6-cartao-csv",
    nome: "C6 — Fatura Cartão (CSV)",
    conta: "C6 Crédito",
    delimitador: ";",
    linhasPular: 1,
    formatoData: "DD/MM/AAAA",
    modoValor: "unica" as const,
    colData: 0,
    colDescricao: 4,
    colParcela: 5,
    colValor: 8,
    colEntrada: null,
    colSaida: null,
    inverterSinal: true,
    usaMesReferencia: true,
  },
];

async function ensureBuiltinPerfis(userId: string) {
  const allBuiltins = [
    ...BUILTIN_OFX_PERFIS.map((p) => p.builtin),
    ...BUILTIN_PDF_PERFIS.map((p) => p.builtin),
    ...BUILTIN_CSV_PERFIS.map((p) => p.builtin),
  ];
  const existing = await prisma.perfilImportacao.findMany({
    where: escopoDoUsuario(userId, { builtin: { in: allBuiltins } }),
    select: { builtin: true },
  });
  const existingSet = new Set(existing.map((p) => p.builtin));

  const missingOFX = BUILTIN_OFX_PERFIS.filter((p) => !existingSet.has(p.builtin));
  const missingPDF = BUILTIN_PDF_PERFIS.filter((p) => !existingSet.has(p.builtin));
  const missingCSV = BUILTIN_CSV_PERFIS.filter((p) => !existingSet.has(p.builtin));

  const toCreate = [
    ...missingOFX.map((p) => dadosDoUsuario(userId, { ...OFX_DEFAULTS, ...p })),
    ...missingPDF.map((p) => dadosDoUsuario(userId, { ...PDF_DEFAULTS, ...p })),
    ...missingCSV.map((p) => dadosDoUsuario(userId, { formato: "csv" as const, ativo: true, ...p })),
  ];
  if (toCreate.length > 0) {
    // skipDuplicates: dois GETs concorrentes podem tentar criar o mesmo builtin;
    // o índice único (userId, builtin) resolve a corrida sem erro.
    await prisma.perfilImportacao.createMany({ data: toCreate, skipDuplicates: true });
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

  const v = validar(criacaoSchema, await lerCorpo(req));
  if (!v.ok) return v.resposta;

  const perfil = await prisma.perfilImportacao.create({
    data: dadosDoUsuario(userId, { ...v.dados, builtin: null }),
  });
  return NextResponse.json(perfil, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const corpo = await lerCorpo(req);

  // Perfis nativos só podem ser ativados ou desativados. As demais opções
  // pertencem ao mapeamento escolhido pelo usuário e só existem em perfis customizados.
  if (corpo && typeof corpo === "object" && !("nome" in corpo)) {
    const v = validar(ativacaoSchema, corpo);
    if (!v.ok) return v.resposta;
    await prisma.perfilImportacao.updateMany({
      where: escopoDoUsuario(userId, { id: v.dados.id }),
      data: { ativo: v.dados.ativo },
    });
    return NextResponse.json({ ok: true });
  }

  const v = validar(edicaoSchema, corpo);
  if (!v.ok) return v.resposta;
  const { id, ...data } = v.dados;

  const perfil = await prisma.perfilImportacao.updateManyAndReturn({
    where: escopoDoUsuario(userId, { id, builtin: null }),
    data,
  });

  if (perfil.length === 0) {
    return NextResponse.json({ error: "Perfil não encontrado ou não pode ser editado" }, { status: 404 });
  }
  return NextResponse.json(perfil[0]);
}

export async function DELETE(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const v = validar(idSchema, lerQuery(req).id);
  if (!v.ok) return v.resposta;

  // Não permite excluir perfis nativos (builtin)
  await prisma.perfilImportacao.deleteMany({
    where: escopoDoUsuario(userId, { id: v.dados, builtin: null }),
  });
  return NextResponse.json({ ok: true });
}
