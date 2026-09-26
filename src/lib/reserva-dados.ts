// Gravação da Reserva a partir da importação: saldo final do extrato da conta.
import { prisma } from "./db";
import { dadosDoUsuario, escopoDoUsuario } from "./tenant";

/**
 * Atualiza (ou cria) a reserva "em conta" de uma conta corrente com o saldo lido
 * do extrato. Um extrato mais antigo que o saldo já registrado não sobrescreve.
 */
export async function atualizarSaldoConta(userId: string, conta: string, saldo: number, data: Date) {
  const existente = await prisma.reserva.findFirst({ where: escopoDoUsuario(userId, { tipo: "conta", conta }) });
  if (existente) {
    if (existente.dataSaldo.getTime() > data.getTime()) return { conta, saldo: existente.saldoInformado, data: existente.dataSaldo, atualizado: false };
    await prisma.reserva.updateMany({
      where: escopoDoUsuario(userId, { id: existente.id }),
      data: { saldoInformado: saldo, dataSaldo: data, observacao: "Saldo lido do extrato importado." },
    });
  } else {
    await prisma.reserva.create({
      data: dadosDoUsuario(userId, {
        nome: conta, tipo: "conta", bloqueada: false, saldoInformado: saldo, dataSaldo: data,
        conta, filtroDescricao: null, observacao: "Saldo lido do extrato importado.",
      }),
    });
  }
  return { conta, saldo, data, atualizado: true };
}
