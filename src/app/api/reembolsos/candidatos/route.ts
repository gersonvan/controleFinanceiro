import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { escopoDoUsuario } from "@/lib/tenant";
import { lerQuery, opcional, textoCurto, validar } from "@/lib/validacao";
import { sugestoesPara } from "@/lib/reembolso-dados";

const buscaSchema = z.object({
  entradaId: z.coerce.number().int().positive(),
  busca: opcional(textoCurto),
});

const DIA = 86_400_000;

// Gastos para vincular a um Pix de reembolso: sem busca, os próximos da data do
// Pix (45 dias antes a 15 depois); com busca, pela descrição em qualquer data.
export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const v = validar(buscaSchema, lerQuery(req));
  if (!v.ok) return v.resposta;
  const { entradaId, busca } = v.dados;

  const entrada = await prisma.lancamento.findFirst({
    where: escopoDoUsuario(userId, { id: entradaId }),
    select: { id: true, data: true, descricao: true, valor: true },
  });
  if (!entrada) return NextResponse.json({ error: "Lançamento não encontrado" }, { status: 404 });

  const termo = busca?.trim();
  const gastos = await prisma.lancamento.findMany({
    where: escopoDoUsuario(userId, {
      valor: { lt: 0 },
      ...(termo
        ? { descricao: { contains: termo, mode: "insensitive" as const } }
        : { data: { gte: new Date(entrada.data.getTime() - 45 * DIA), lte: new Date(entrada.data.getTime() + 15 * DIA) } }),
    }),
    select: { id: true, data: true, descricao: true, valor: true, categoria: true, conta: true, valorReembolsado: true },
    orderBy: { data: "desc" },
    take: termo ? 40 : 80,
  });
  // sem busca: os mais próximos da data do Pix primeiro
  if (!termo) gastos.sort((a, b) => Math.abs(a.data.getTime() - entrada.data.getTime()) - Math.abs(b.data.getTime() - entrada.data.getTime()));

  // gasto que o padrão aprendido sugere para este Pix
  const [par] = await sugestoesPara(userId, [entrada]);
  const sugerido = par
    ? gastos.find((g) => g.id === par.saidaId) ?? await prisma.lancamento.findFirst({
        where: escopoDoUsuario(userId, { id: par.saidaId }),
        select: { id: true, data: true, descricao: true, valor: true, categoria: true, conta: true, valorReembolsado: true },
      })
    : null;
  return NextResponse.json({ gastos, sugerido });
}
