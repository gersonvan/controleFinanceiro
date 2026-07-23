import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { dadosDoUsuario, escopoDoUsuario } from "@/lib/tenant";

export async function PATCH(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { nome } = await req.json();

  await prisma.userProfile.upsert({
    where: escopoDoUsuario(userId),
    create: dadosDoUsuario(userId, { nome: nome ?? "", onboardingCompleto: true }),
    update: { nome: nome ?? "", onboardingCompleto: true },
  });

  return NextResponse.json({ ok: true });
}
