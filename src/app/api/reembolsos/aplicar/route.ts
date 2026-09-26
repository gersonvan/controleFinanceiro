import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/session";
import { idSchema, lerCorpo, validar } from "@/lib/validacao";
import { aplicarPadroes } from "@/lib/reembolso-dados";

const schema = z.object({ entradaIds: z.array(idSchema).min(1).max(200) });

// Liga pelos padrões os Pix confirmados pelo usuário. O par é recalculado aqui,
// não vem do navegador.
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const v = validar(schema, await lerCorpo(req));
  if (!v.ok) return v.resposta;
  return NextResponse.json({ vinculados: await aplicarPadroes(userId, v.dados.entradaIds) });
}
