// Compartilhar as próprias finanças: o dono (quem está logado, não as finanças
// abertas) convida, muda o papel e retira o acesso; quem foi convidado pode sair.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUsuarioLogado } from "@/lib/session";
import { emailPermitido } from "@/lib/acesso";
import { espacosDoUsuario, PAPEIS_DE_ACESSO } from "@/lib/espaco";
import { idSchema, lerCorpo, lerQuery, opcional, validar } from "@/lib/validacao";

const papelSchema = z.enum(PAPEIS_DE_ACESSO);
const conviteSchema = z.object({ email: z.string().trim().toLowerCase().email().max(200), papel: papelSchema });
const mudancaSchema = z.object({ id: idSchema, papel: papelSchema });
const remocaoSchema = z.object({ id: opcional(idSchema), dono: opcional(z.string().trim().max(200)) })
  .refine((q) => !!q.id !== !!q.dono, "Informe id (retirar acesso) ou dono (sair)");

export async function GET() {
  const usuario = await getUsuarioLogado();
  if (!usuario) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const meus = await prisma.acesso.findMany({ where: { donoUserId: usuario }, orderBy: { createdAt: "asc" } });
  const comigo = (await espacosDoUsuario(usuario)).filter((e) => e.papel !== "dono");
  return NextResponse.json({
    // podeEntrar: o app ainda limita quem entra (ALLOWED_EMAILS)
    meus: meus.map((a) => ({ id: a.id, email: a.membroEmail, papel: a.papel, podeEntrar: emailPermitido(a.membroEmail) })),
    comigo,
  });
}

export async function POST(req: NextRequest) {
  const usuario = await getUsuarioLogado();
  if (!usuario) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const v = validar(conviteSchema, await lerCorpo(req));
  if (!v.ok) return v.resposta;
  const { email, papel } = v.dados;
  if (email === usuario.toLowerCase()) return NextResponse.json({ error: "Você já tem acesso às suas finanças" }, { status: 400 });
  const existente = await prisma.acesso.findUnique({ where: { donoUserId_membroEmail: { donoUserId: usuario, membroEmail: email } } });
  if (existente) return NextResponse.json({ error: "Essa pessoa já tem acesso" }, { status: 409 });
  const criado = await prisma.acesso.create({ data: { donoUserId: usuario, membroEmail: email, papel } });
  return NextResponse.json({ id: criado.id, email, papel, podeEntrar: emailPermitido(email) }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const usuario = await getUsuarioLogado();
  if (!usuario) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const v = validar(mudancaSchema, await lerCorpo(req));
  if (!v.ok) return v.resposta;
  const r = await prisma.acesso.updateMany({ where: { id: v.dados.id, donoUserId: usuario }, data: { papel: v.dados.papel } });
  if (r.count === 0) return NextResponse.json({ error: "Acesso não encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// ?id= o dono retira o acesso de alguém; ?dono= quem foi convidado sai das finanças desse dono
export async function DELETE(req: NextRequest) {
  const usuario = await getUsuarioLogado();
  if (!usuario) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const v = validar(remocaoSchema, lerQuery(req));
  if (!v.ok) return v.resposta;
  const where = v.dados.id
    ? { id: v.dados.id, donoUserId: usuario }
    : { donoUserId: v.dados.dono!, membroEmail: usuario.toLowerCase() };
  const r = await prisma.acesso.deleteMany({ where });
  if (r.count === 0) return NextResponse.json({ error: "Acesso não encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
