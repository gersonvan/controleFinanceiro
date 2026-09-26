// Gravação dos vínculos de reembolso e do valorReembolsado de cada gasto.
import type { Prisma } from "@prisma/client";
import { escopoDoUsuario } from "./tenant";

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

/** Gastos que um Pix reembolsava — para recalcular antes/depois de excluir o Pix. */
export async function gastosDoPix(tx: Tx, userId: string, entradaId: number): Promise<number[]> {
  const v = await tx.reembolso.findMany({ where: { userId, entradaId }, select: { saidaId: true } });
  return v.map((x) => x.saidaId);
}
