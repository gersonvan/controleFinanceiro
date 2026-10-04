import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { dadosDoUsuario, escopoDoUsuario } from "@/lib/tenant";
import { padronizarConta } from "@/lib/contas";
import { ensureBuiltinPerfis } from "@/lib/importacao/perfis-nativos";
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

  // a conta sai do banco + tipo (lib/bancos.ts), mesmo que tenha chegado digitada
  const perfil = await prisma.perfilImportacao.create({
    data: dadosDoUsuario(userId, { ...v.dados, ...(await padronizarConta(userId, v.dados.conta)), builtin: null }),
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
  const { id, ...campos } = v.dados;
  const data = { ...campos, ...(await padronizarConta(userId, campos.conta)) };

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
