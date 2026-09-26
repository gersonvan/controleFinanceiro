import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { escopoDoUsuario } from "@/lib/tenant";
import { idSchema, lerCorpo, lerQuery, validar } from "@/lib/validacao";
import { CATEGORIA_REEMBOLSO, distribuirReembolso } from "@/lib/reembolso";
import { recalcularReembolsados } from "@/lib/reembolso-dados";

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
  const { entradaId } = v.dados;
  const saidaIds = [...new Set(v.dados.saidaIds)].filter((id) => id !== entradaId);

  const entrada = await prisma.lancamento.findFirst({ where: escopoDoUsuario(userId, { id: entradaId }) });
  if (!entrada) return NextResponse.json({ error: "Lançamento não encontrado" }, { status: 404 });
  if (entrada.valor <= 0) return NextResponse.json({ error: "Só uma entrada pode reembolsar gastos" }, { status: 400 });

  const gastos = await prisma.lancamento.findMany({
    where: escopoDoUsuario(userId, { id: { in: saidaIds }, valor: { lt: 0 } }),
    select: { id: true, valor: true },
  });
  if (gastos.length !== saidaIds.length) return NextResponse.json({ error: "Algum gasto não foi encontrado" }, { status: 400 });

  const resultado = await prisma.$transaction(async (tx) => {
    const anteriores = await tx.reembolso.findMany({ where: { userId, entradaId }, select: { saidaId: true } });
    await tx.reembolso.deleteMany({ where: { userId, entradaId } });

    // quanto outros Pix já reembolsaram de cada gasto
    const outros = await tx.reembolso.groupBy({
      by: ["saidaId"], where: { userId, saidaId: { in: saidaIds } }, _sum: { valor: true },
    });
    const jaReembolsado = new Map(outros.map((o) => [o.saidaId, o._sum.valor ?? 0]));
    const { partes, sobra } = distribuirReembolso(
      entrada.valor,
      gastos.map((g) => ({ id: g.id, valor: g.valor, jaReembolsado: jaReembolsado.get(g.id) ?? 0 })),
    );
    if (partes.length) {
      await tx.reembolso.createMany({ data: partes.map((p) => ({ userId, entradaId, saidaId: p.saidaId, valor: p.valor })) });
    }
    // com vínculo, o Pix é Reembolso; ao desfazer, volta a ficar sem categoria
    await tx.lancamento.updateMany({
      where: escopoDoUsuario(userId, { id: entradaId }),
      data: { categoria: partes.length ? CATEGORIA_REEMBOLSO : entrada.categoria === CATEGORIA_REEMBOLSO ? null : entrada.categoria },
    });
    await recalcularReembolsados(tx, userId, [...anteriores.map((a) => a.saidaId), ...saidaIds]);
    return { partes, sobra };
  });

  return NextResponse.json(resultado);
}
