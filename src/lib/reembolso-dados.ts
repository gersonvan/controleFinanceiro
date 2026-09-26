// Gravação dos vínculos de reembolso, valorReembolsado de cada gasto e os
// padrões aprendidos ("Pix da Margaret → TIM").
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { escopoDoUsuario } from "./tenant";
import { CATEGORIA_REEMBOLSO, distribuirReembolso } from "./reembolso";
import { aprenderPadroes, JANELA, sugerirVarios, type PadraoReembolso } from "./reembolso-padroes";

type Tx = Prisma.TransactionClient;

/** Recalcula valorReembolsado dos gastos a partir dos vínculos. */
export async function recalcularReembolsados(tx: Tx, userId: string, saidaIds: number[]) {
  const ids = [...new Set(saidaIds)];
  if (ids.length === 0) return;
  const somas = await tx.reembolso.groupBy({
    by: ["saidaId"],
    where: { userId, saidaId: { in: ids } },
    _sum: { valor: true },
  });
  const porId = new Map(somas.map((s) => [s.saidaId, s._sum.valor ?? 0]));
  for (const id of ids) {
    await tx.lancamento.updateMany({
      where: escopoDoUsuario(userId, { id }),
      data: { valorReembolsado: Math.round((porId.get(id) ?? 0) * 100) / 100 },
    });
  }
}

/** Recalcula, em cada Pix, quanto dele foi usado para abater gastos (o resto é sobra/entrada). */
export async function recalcularPixes(tx: Tx, userId: string, entradaIds: number[]) {
  const ids = [...new Set(entradaIds)];
  if (ids.length === 0) return;
  const somas = await tx.reembolso.groupBy({
    by: ["entradaId"],
    where: { userId, entradaId: { in: ids } },
    _sum: { valor: true },
  });
  const porId = new Map(somas.map((s) => [s.entradaId, s._sum.valor ?? 0]));
  for (const id of ids) {
    await tx.lancamento.updateMany({
      where: escopoDoUsuario(userId, { id }),
      data: { valorReembolsado: Math.round((porId.get(id) ?? 0) * 100) / 100 },
    });
  }
}

/** Pix que reembolsavam um gasto — para recalcular a sobra deles ao excluir o gasto. */
export async function pixesDoGasto(tx: Tx, userId: string, saidaId: number): Promise<number[]> {
  const v = await tx.reembolso.findMany({ where: { userId, saidaId }, select: { entradaId: true } });
  return v.map((x) => x.entradaId);
}

/** Gastos que um Pix reembolsava — para recalcular antes/depois de excluir o Pix. */
export async function gastosDoPix(tx: Tx, userId: string, entradaId: number): Promise<number[]> {
  const v = await tx.reembolso.findMany({ where: { userId, entradaId }, select: { saidaId: true } });
  return v.map((x) => x.saidaId);
}

export type ResultadoDivisao =
  | { ok: true; partes: { saidaId: number; valor: number }[]; sobra: number }
  | { ok: false; status: number; erro: string };

/**
 * Define os gastos que um Pix reembolsa (vazio = desfazer): distribui o valor,
 * marca/desmarca a categoria Reembolso e recalcula os gastos afetados.
 */
export async function definirReembolso(userId: string, entradaId: number, saidaIdsBrutos: number[]): Promise<ResultadoDivisao> {
  const saidaIds = [...new Set(saidaIdsBrutos)].filter((id) => id !== entradaId);
  const entrada = await prisma.lancamento.findFirst({ where: escopoDoUsuario(userId, { id: entradaId }) });
  if (!entrada) return { ok: false, status: 404, erro: "Lançamento não encontrado" };
  if (entrada.valor <= 0) return { ok: false, status: 400, erro: "Só uma entrada pode reembolsar gastos" };

  const gastos = await prisma.lancamento.findMany({
    where: escopoDoUsuario(userId, { id: { in: saidaIds }, valor: { lt: 0 } }),
    select: { id: true, valor: true },
  });
  if (gastos.length !== saidaIds.length) return { ok: false, status: 400, erro: "Algum gasto não foi encontrado" };

  return prisma.$transaction(async (tx) => {
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
    // com vínculo, o Pix é Reembolso e guarda o quanto abateu (o resto é sobra);
    // ao desfazer, volta a ficar sem categoria
    await tx.lancamento.updateMany({
      where: escopoDoUsuario(userId, { id: entradaId }),
      data: {
        categoria: partes.length ? CATEGORIA_REEMBOLSO : entrada.categoria === CATEGORIA_REEMBOLSO ? null : entrada.categoria,
        valorReembolsado: Math.round(partes.reduce((a, p) => a + p.valor, 0) * 100) / 100,
      },
    });
    await recalcularReembolsados(tx, userId, [...anteriores.map((a) => a.saidaId), ...saidaIds]);
    return { ok: true as const, partes, sobra };
  });
}

/** Padrões aprendidos com as divisões que o usuário já fez. */
export async function carregarPadroes(userId: string): Promise<Map<string, PadraoReembolso>> {
  const vinculos = await prisma.reembolso.findMany({
    where: { userId },
    select: { entradaId: true, entrada: { select: { descricao: true, valor: true } }, saida: { select: { descricao: true } } },
  });
  const porPix = new Map<number, { pix: { descricao: string; valor: number }; gastos: { descricao: string }[] }>();
  for (const v of vinculos) {
    const d = porPix.get(v.entradaId) ?? { pix: v.entrada, gastos: [] };
    d.gastos.push(v.saida);
    porPix.set(v.entradaId, d);
  }
  return aprenderPadroes([...porPix.values()]);
}

/** Pix (entradas) que ainda não reembolsam nada. */
export const pixSemDivisao = {
  valor: { gt: 0 },
  reembolsosFeitos: { none: {} },
  OR: [{ categoria: null }, { categoria: { not: CATEGORIA_REEMBOLSO } }],
};

/** Pares Pix → gasto sugeridos pelos padrões (não grava nada). */
export async function sugestoesPara(
  userId: string,
  pixes: { id: number; descricao: string; valor: number; data: Date }[],
  padroes?: Map<string, PadraoReembolso>,
): Promise<{ entradaId: number; saidaId: number }[]> {
  if (pixes.length === 0) return [];
  const aprendidos = padroes ?? await carregarPadroes(userId);
  if (aprendidos.size === 0) return [];
  const tempos = pixes.map((p) => p.data.getTime());
  const gastos = await prisma.lancamento.findMany({
    where: escopoDoUsuario(userId, {
      valor: { lt: 0 },
      data: { gte: new Date(Math.min(...tempos) - JANELA.antes), lte: new Date(Math.max(...tempos) + JANELA.depois) },
    }),
    select: { id: true, descricao: true, data: true, valor: true, valorReembolsado: true },
  });
  return sugerirVarios(pixes, aprendidos, gastos);
}

/** Liga pelos padrões os Pix informados que ainda não reembolsam nada. Devolve quantos ligou. */
export async function aplicarPadroes(userId: string, entradaIds: number[]): Promise<number> {
  if (entradaIds.length === 0) return 0;
  const padroes = await carregarPadroes(userId);
  if (padroes.size === 0) return 0;
  const pixes = await prisma.lancamento.findMany({
    where: escopoDoUsuario(userId, { id: { in: entradaIds }, ...pixSemDivisao }),
    select: { id: true, descricao: true, valor: true, data: true },
  });
  let ligados = 0;
  for (const par of await sugestoesPara(userId, pixes, padroes)) {
    const r = await definirReembolso(userId, par.entradaId, [par.saidaId]);
    if (r.ok && r.partes.length) ligados++;
  }
  return ligados;
}
