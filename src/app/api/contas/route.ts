import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { escopoDoUsuario } from "@/lib/tenant";
import { garantirContas } from "@/lib/contas";
import { BANCOS, nomeDaConta } from "@/lib/bancos";
import { dadosDoUsuario } from "@/lib/tenant";
import { idSchema, lerCorpo, validar } from "@/lib/validacao";

const edicaoSchema = z.object({ id: idSchema, tipo: z.enum(["corrente", "cartao"]) });
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

export async function PATCH(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const v = validar(edicaoSchema, await lerCorpo(req));
  if (!v.ok) return v.resposta;
  const r = await prisma.conta.updateMany({ where: escopoDoUsuario(userId, { id: v.dados.id }), data: { tipo: v.dados.tipo } });
  if (r.count === 0) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
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

