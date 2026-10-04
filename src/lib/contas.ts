// Contas do usuário e seus tipos (corrente/cartão). Toda conta que aparece
// nos lançamentos ganha um registro com o tipo sugerido pelo nome.
import { prisma } from "./db";
import { dadosDoUsuario, escopoDoUsuario } from "./tenant";
import { type TipoConta } from "./financas";
import { interpretarNomeAntigo, nomeDaConta } from "./bancos";

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

/** Banco e tipo de um perfil de importação (os migrados têm os dois; senão, lê do nome da conta). */
export function bancoTipoDoPerfil(p: { banco: string | null; tipoConta: string | null; conta: string }): { banco: string; tipo: TipoConta } {
  if (p.banco && p.tipoConta) return { banco: p.banco, tipo: p.tipoConta === "cartao" ? "cartao" : "corrente" };
  const d = interpretarNomeAntigo(p.conta);
  return { banco: d.banco, tipo: d.tipo };
}

/**
 * Para onde vai uma importação desse banco e tipo. Nenhuma conta: a padrão
 * ("Nubank · Crédito"), criada no registro quando os lançamentos chegam. Uma: essa.
 * Mais de uma (apelidos): padrao = null e o usuário escolhe entre as opções.
 */
export async function destinoDaImportacao(userId: string, banco: string, tipo: TipoConta) {
  const contas = await prisma.conta.findMany({
    where: escopoDoUsuario(userId, { banco, tipo }), select: { nome: true }, orderBy: { nome: "asc" },
  });
  const opcoes = contas.map((c) => c.nome);
  if (opcoes.length === 0) return { padrao: nomeDaConta({ banco, tipo, apelido: "" }), opcoes };
  return { padrao: opcoes.length === 1 ? opcoes[0] : null, opcoes };
}

/** Confirma a conta escolhida (ou a única possível); sem escolha numa situação ambígua, devolve as opções. */
export async function resolverConta(userId: string, banco: string, tipo: TipoConta, escolhida?: string | null) {
  const { padrao, opcoes } = await destinoDaImportacao(userId, banco, tipo);
  const validas = opcoes.length ? opcoes : [padrao!];
  if (escolhida) return validas.includes(escolhida) ? { ok: true as const, nome: escolhida } : { ok: false as const, opcoes: validas };
  return padrao ? { ok: true as const, nome: padrao } : { ok: false as const, opcoes: validas };
}

/**
 * Nome de conta que ainda chega digitado (perfil personalizado, lançamento manual):
 * se já existe no registro do usuário, fica; senão vira o formato padrão
 * ("Bradesco cartão" → "Bradesco · Crédito", "Carteira" → "Outro · Carteira").
 */
export async function padronizarConta(userId: string, nome: string) {
  const existente = await prisma.conta.findFirst({ where: escopoDoUsuario(userId, { nome: nome.trim() }) });
  if (existente) {
    return { conta: existente.nome, banco: existente.banco, tipoConta: (existente.tipo === "cartao" ? "cartao" : "corrente") as TipoConta };
  }
  const dados = interpretarNomeAntigo(nome.trim());
  return { conta: nomeDaConta(dados), banco: dados.banco, tipoConta: dados.tipo };
}

