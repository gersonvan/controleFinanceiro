import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { escopoDoUsuario } from "@/lib/tenant";
import { lerQuery, validar } from "@/lib/validacao";
import { chaveContraparte } from "@/lib/reembolso-padroes";
import { pixSemDivisao, sugestoesPara } from "@/lib/reembolso-dados";

const schema = z.object({ entradaId: z.coerce.number().int().positive() });

// Depois de dividir um Pix: outros Pix do mesmo pagador ainda sem divisão e o
// gasto que o padrão sugere para cada um (nada é gravado aqui).
export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const v = validar(schema, lerQuery(req));
  if (!v.ok) return v.resposta;

  const pix = await prisma.lancamento.findFirst({ where: escopoDoUsuario(userId, { id: v.dados.entradaId }), select: { descricao: true } });
  if (!pix) return NextResponse.json({ error: "Lançamento não encontrado" }, { status: 404 });

  const chave = chaveContraparte(pix.descricao);
  const semDivisao = await prisma.lancamento.findMany({
    where: escopoDoUsuario(userId, pixSemDivisao),
    select: { id: true, descricao: true, valor: true, data: true },
  });
  const doMesmoPagador = semDivisao.filter((p) => chaveContraparte(p.descricao) === chave);
  const pares = await sugestoesPara(userId, doMesmoPagador);
  if (pares.length === 0) return NextResponse.json([]);

  const gastos = await prisma.lancamento.findMany({
    where: escopoDoUsuario(userId, { id: { in: pares.map((p) => p.saidaId) } }),
    select: { id: true, data: true, descricao: true, valor: true },
  });
  const pixPorId = new Map(doMesmoPagador.map((p) => [p.id, p]));
  const gastoPorId = new Map(gastos.map((g) => [g.id, g]));
  return NextResponse.json(pares.map((p) => ({ pix: pixPorId.get(p.entradaId), gasto: gastoPorId.get(p.saidaId) })));
}
