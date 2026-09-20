import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { dadosDoUsuario, escopoDoUsuario } from "@/lib/tenant";
import { z } from "zod";
import { lerCorpo, validar } from "@/lib/validacao";

const onboardingSchema = z.object({ nome: z.string().trim().max(100).default("") });

export async function PATCH(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const v = validar(onboardingSchema, await lerCorpo(req));
  if (!v.ok) return v.resposta;
  const { nome } = v.dados;

  await prisma.userProfile.upsert({
    where: escopoDoUsuario(userId),
    create: dadosDoUsuario(userId, { nome, onboardingCompleto: true }),
    update: { nome, onboardingCompleto: true },
  });

  return NextResponse.json({ ok: true });
}
