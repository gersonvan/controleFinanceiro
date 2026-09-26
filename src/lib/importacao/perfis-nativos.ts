// Perfis de importação nativos, criados por usuário sob demanda (GET
// /api/perfis e análise de arquivos). Usados por builtinKey nos detectores.
import { prisma } from "@/lib/db";
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
  // Fatura de cartão exportada em OFX (CREDITCARDMSGSRSV1): compras já vêm
  // negativas; pede o mês de referência como as demais faturas.
  { builtin: "nubank-cartao-ofx",    nome: "Nubank — Fatura Cartão (OFX)", conta: "Nubank Crédito", inverterSinal: false, usaMesReferencia: true },
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
const BUILTIN_PDF_PERFIS: { builtin: string; nome: string; conta: string; inverterSinal: boolean; usaMesReferencia?: boolean }[] = [
  { builtin: "sofisa-extrato-pdf",  nome: "Sofisa — Extrato da Conta", conta: "Sofisa",         inverterSinal: false, usaMesReferencia: false },
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
    builtin: "bb-corrente-csv",
    nome: "Banco do Brasil — Corrente (CSV)",
    conta: "BB Corrente",
    delimitador: ",",
    linhasPular: 1,
    formatoData: "DD/MM/AAAA",
    modoValor: "unica" as const,
    colData: 0,
    colDescricao: 1,
    colParcela: null,
    colValor: 4,
    colEntrada: null,
    colSaida: null,
    inverterSinal: false,
    usaMesReferencia: false,
  },
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

export async function ensureBuiltinPerfis(userId: string) {
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
    // usaMesReferencia só vem no perfil quando difere do padrão (extrato de conta)
    ...missingPDF.map((p) => dadosDoUsuario(userId, { ...PDF_DEFAULTS, ...p, usaMesReferencia: p.usaMesReferencia ?? true })),
    ...missingCSV.map((p) => dadosDoUsuario(userId, { formato: "csv" as const, ativo: true, ...p })),
  ];
  if (toCreate.length > 0) {
    // skipDuplicates: dois GETs concorrentes podem tentar criar o mesmo builtin;
    // o índice único (userId, builtin) resolve a corrida sem erro.
    await prisma.perfilImportacao.createMany({ data: toCreate, skipDuplicates: true });
  }
}

