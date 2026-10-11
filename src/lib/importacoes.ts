// Importações de arquivo: a lista das recentes e o "desfazer" — apaga os
// lançamentos que a importação criou, recalcula os reembolsos dos lançamentos
// de fora que estavam ligados a eles e volta o saldo da conta na Reserva (se
// ninguém mexeu nele depois).
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { escopoDoUsuario } from "./tenant";
import { recalcularPixes, recalcularReembolsados } from "./reembolso-dados";

type Tx = Prisma.TransactionClient;

/** O que a importação mudou no saldo da conta (Importacao.saldo). */
export interface SaldoDaImportacao {
  reservaId: number;
  anterior: { saldo: number; data: string; observacao: string | null } | null; // null = a importação criou a reserva
  gravado: { saldo: number; data: string };
}

export async function importacoesRecentes(userId: string, limite = 15) {
  const lista = await prisma.importacao.findMany({
    where: escopoDoUsuario(userId),
    orderBy: { createdAt: "desc" },
    take: limite,
    select: { id: true, perfil: true, conta: true, arquivo: true, createdAt: true, _count: { select: { lancamentos: true } } },
  });
  // se o usuário já apagou tudo o que ela criou, não há o que desfazer
  return lista.filter((i) => i._count.lancamentos > 0).map(({ _count, ...i }) => ({ ...i, lancamentos: _count.lancamentos }));
}

async function voltarSaldo(tx: Tx, userId: string, s: SaldoDaImportacao | null): Promise<boolean> {
  // reserva criada pela importação fica: o usuário pode tê-la ajustado
  if (!s?.anterior) return false;
  const r = await tx.reserva.findFirst({ where: escopoDoUsuario(userId, { id: s.reservaId }) });
  // só volta se o saldo ainda é o que esta importação gravou
  if (!r || r.saldoInformado !== s.gravado.saldo || r.dataSaldo.toISOString() !== s.gravado.data) return false;
  await tx.reserva.updateMany({
    where: escopoDoUsuario(userId, { id: s.reservaId }),
    data: { saldoInformado: s.anterior.saldo, dataSaldo: new Date(s.anterior.data), observacao: s.anterior.observacao },
  });
  return true;
}

export async function desfazerImportacao(userId: string, id: number): Promise<{ apagados: number; saldoRestaurado: boolean } | null> {
  return prisma.$transaction(async (tx) => {
    const imp = await tx.importacao.findFirst({ where: escopoDoUsuario(userId, { id }) });
    if (!imp) return null;
    const ids = (await tx.lancamento.findMany({ where: escopoDoUsuario(userId, { importacaoId: id }), select: { id: true } })).map((l) => l.id);
    const dela = new Set(ids);
    const vinculos = await tx.reembolso.findMany({
      where: { userId, OR: [{ entradaId: { in: ids } }, { saidaId: { in: ids } }] },
      select: { entradaId: true, saidaId: true },
    });
    const { count } = await tx.lancamento.deleteMany({ where: escopoDoUsuario(userId, { importacaoId: id }) });
    // os vínculos somem junto (cascade); o lado de fora volta ao valor sem eles
    await recalcularReembolsados(tx, userId, vinculos.map((v) => v.saidaId).filter((i) => !dela.has(i)));
    await recalcularPixes(tx, userId, vinculos.map((v) => v.entradaId).filter((i) => !dela.has(i)));
    const saldoRestaurado = await voltarSaldo(tx, userId, imp.saldo as unknown as SaldoDaImportacao | null);
    await tx.importacao.deleteMany({ where: escopoDoUsuario(userId, { id }) });
    return { apagados: count, saldoRestaurado };
  });
}
