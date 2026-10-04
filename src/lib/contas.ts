// Contas do usuário e seus tipos (corrente/cartão). Toda conta que aparece
// nos lançamentos ganha um registro com o tipo sugerido pelo nome.
import { prisma } from "./db";
import { dadosDoUsuario, escopoDoUsuario } from "./tenant";
import { type TipoConta } from "./financas";
import { interpretarNomeAntigo } from "./bancos";

export async function garantirContas(userId: string) {
  const [usadas, existentes] = await Promise.all([
    prisma.lancamento.groupBy({ by: ["conta"], where: escopoDoUsuario(userId), _count: { _all: true } }),
    prisma.conta.findMany({ where: escopoDoUsuario(userId), select: { nome: true } }),
  ]);
  const conhecidas = new Set(existentes.map((c) => c.nome));
  const novas = usadas.filter((u) => !conhecidas.has(u.conta));
  if (novas.length > 0) {
    await prisma.conta.createMany({
      // banco, tipo e apelido lidos do nome (lib/bancos.ts); depois da migração os nomes já vêm no formato novo
      data: novas.map((u) => {
        const { banco, tipo, apelido } = interpretarNomeAntigo(u.conta);
        return dadosDoUsuario(userId, { nome: u.conta, banco, tipo, apelido });
      }),
      skipDuplicates: true,
    });
  }
  return new Map(usadas.map((u) => [u.conta, u._count._all]));
}

export async function tiposDasContas(userId: string): Promise<Map<string, TipoConta>> {
  await garantirContas(userId);
  const contas = await prisma.conta.findMany({ where: escopoDoUsuario(userId), select: { nome: true, tipo: true } });
  return new Map(contas.map((c) => [c.nome, c.tipo === "cartao" ? "cartao" : "corrente"]));
}
