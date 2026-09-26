import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { idSchema, lerCorpo, lerQuery, validar } from "@/lib/validacao";
import { definirReembolso } from "@/lib/reembolso-dados";

const consultaSchema = z.object({ entradaId: z.coerce.number().int().positive() });
const divisaoSchema = z.object({
  entradaId: idSchema,
  saidaIds: z.array(idSchema).max(50), // vazio = desfazer a divisão
});

const camposGasto = { id: true, data: true, descricao: true, valor: true, categoria: true, conta: true, valorReembolsado: true } as const;

// Gastos que um Pix reembolsa.
export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const v = validar(consultaSchema, lerQuery(req));
  if (!v.ok) return v.resposta;

  const vinculos = await prisma.reembolso.findMany({
    where: { userId, entradaId: v.dados.entradaId },
    select: { valor: true, saida: { select: camposGasto } },
    orderBy: { saida: { data: "desc" } },
  });
  return NextResponse.json(vinculos.map((x) => ({ ...x.saida, parte: x.valor })));
}

// Define (ou desfaz, com saidaIds vazio) os gastos que um Pix reembolsa.
export async function PUT(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const v = validar(divisaoSchema, await lerCorpo(req));
  if (!v.ok) return v.resposta;
  const r = await definirReembolso(userId, v.dados.entradaId, v.dados.saidaIds);
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: r.status });
  return NextResponse.json({ partes: r.partes, sobra: r.sobra });
}
