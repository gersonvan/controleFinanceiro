// Dados do usuário usados pela importação: o nome completo como aparece nos
// extratos, que reconhece Pix/TED entre as contas dele (lib/nome-proprio.ts).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { dadosDoUsuario, escopoDoUsuario } from "@/lib/tenant";
import { lerCorpo, validar } from "@/lib/validacao";

const perfilSchema = z.object({ nomeCompleto: z.string().trim().max(120) });

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const perfil = await prisma.userProfile.findUnique({ where: escopoDoUsuario(userId), select: { nomeCompleto: true } });
  return NextResponse.json({ nomeCompleto: perfil?.nomeCompleto ?? "" });
}

export async function PATCH(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const v = validar(perfilSchema, await lerCorpo(req));
  if (!v.ok) return v.resposta;
  const { nomeCompleto } = v.dados;
  await prisma.userProfile.upsert({
    where: escopoDoUsuario(userId),
    create: dadosDoUsuario(userId, { nomeCompleto }),
    update: { nomeCompleto },
  });
  return NextResponse.json({ nomeCompleto });
}
