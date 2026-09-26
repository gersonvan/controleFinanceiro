import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { escopoDoUsuario } from "@/lib/tenant";
import { garantirContas } from "@/lib/contas";
import { idSchema, lerCorpo, validar } from "@/lib/validacao";

const edicaoSchema = z.object({ id: idSchema, tipo: z.enum(["corrente", "cartao"]) });

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const usos = await garantirContas(userId);
  const contas = await prisma.conta.findMany({ where: escopoDoUsuario(userId), orderBy: { nome: "asc" } });
  return NextResponse.json(contas.map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo, lancamentos: usos.get(c.nome) ?? 0 })));
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
