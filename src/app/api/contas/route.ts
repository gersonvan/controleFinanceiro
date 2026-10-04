import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { escopoDoUsuario } from "@/lib/tenant";
import { garantirContas } from "@/lib/contas";
import { BANCOS, nomeDaConta } from "@/lib/bancos";
import { dadosDoUsuario } from "@/lib/tenant";
import { erro400, idSchema, lerCorpo, lerQuery, validar } from "@/lib/validacao";

const edicaoSchema = z.object({
  id: idSchema,
  tipo: z.enum(["corrente", "cartao"]).optional(),
  apelido: z.string().trim().max(40).optional(),
}).refine((v) => v.tipo !== undefined || v.apelido !== undefined, { message: "Informe tipo ou apelido" });
const criacaoSchema = z.object({
  banco: z.enum(BANCOS.map((b) => b.id) as [string, ...string[]]),
  tipo: z.enum(["corrente", "cartao"]),
  apelido: z.string().trim().max(40).default(""),
}).refine((v) => v.banco !== "outro" || v.apelido.length > 0, { message: "Dê um nome para a conta (ex.: Carteira)", path: ["apelido"] });

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const usos = await garantirContas(userId);
  const contas = await prisma.conta.findMany({ where: escopoDoUsuario(userId), orderBy: { nome: "asc" } });
  return NextResponse.json(contas.map((c) => ({
    id: c.id, nome: c.nome, banco: c.banco, apelido: c.apelido, tipo: c.tipo, lancamentos: usos.get(c.nome) ?? 0,
  })));
}

// Muda apelido ou tipo: o nome é gerado de novo e todos os lançamentos, reservas
// e perfis com o nome antigo passam para o novo, numa transação.
export async function PATCH(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const v = validar(edicaoSchema, await lerCorpo(req));
  if (!v.ok) return v.resposta;
  const conta = await prisma.conta.findFirst({ where: escopoDoUsuario(userId, { id: v.dados.id }) });
  if (!conta) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });

  const dados = {
    banco: conta.banco,
    tipo: (v.dados.tipo ?? (conta.tipo === "cartao" ? "cartao" : "corrente")) as "corrente" | "cartao",
    apelido: v.dados.apelido ?? conta.apelido,
  };
  if (dados.banco === "outro" && !dados.apelido) return erro400("A conta \"Outro\" precisa de um nome");
  const nome = nomeDaConta(dados);
  if (nome !== conta.nome && await prisma.conta.findFirst({ where: escopoDoUsuario(userId, { nome }) })) {
    return NextResponse.json({ error: `Já existe a conta "${nome}"` }, { status: 409 });
  }
  await prisma.$transaction([
    prisma.conta.updateMany({ where: escopoDoUsuario(userId, { id: conta.id }), data: { ...dados, nome } }),
    prisma.lancamento.updateMany({ where: escopoDoUsuario(userId, { conta: conta.nome }), data: { conta: nome } }),
    prisma.reserva.updateMany({ where: escopoDoUsuario(userId, { conta: conta.nome }), data: { conta: nome } }),
    prisma.perfilImportacao.updateMany({ where: escopoDoUsuario(userId, { conta: conta.nome }), data: { conta: nome } }),
  ]);
  return NextResponse.json({ id: conta.id, nome });
}

// Exclui só conta vazia (sem lançamentos e sem reservas).
export async function DELETE(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const v = validar(idSchema, lerQuery(req).id);
  if (!v.ok) return v.resposta;
  const conta = await prisma.conta.findFirst({ where: escopoDoUsuario(userId, { id: v.dados }) });
  if (!conta) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
  const [lancamentos, reservas] = await Promise.all([
    prisma.lancamento.count({ where: escopoDoUsuario(userId, { conta: conta.nome }) }),
    prisma.reserva.count({ where: escopoDoUsuario(userId, { conta: conta.nome }) }),
  ]);
  if (lancamentos || reservas) {
    return NextResponse.json({ error: `A conta tem ${lancamentos} lançamento(s) e ${reservas} reserva(s); só dá para excluir conta vazia` }, { status: 409 });
  }
  await prisma.conta.deleteMany({ where: escopoDoUsuario(userId, { id: conta.id }) });
  return NextResponse.json({ ok: true });
}

// Nova conta: banco + Débito/Crédito + apelido. O nome é gerado (lib/bancos.ts).
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const v = validar(criacaoSchema, await lerCorpo(req));
  if (!v.ok) return v.resposta;
  const nome = nomeDaConta(v.dados);
  const existe = await prisma.conta.findFirst({ where: escopoDoUsuario(userId, { nome }) });
  if (existe) return NextResponse.json({ error: `A conta "${nome}" já existe — use um apelido diferente` }, { status: 409 });
  const conta = await prisma.conta.create({ data: dadosDoUsuario(userId, { nome, ...v.dados }) });
  return NextResponse.json({ id: conta.id, nome }, { status: 201 });
}

