// Carrega o que a categorização automática sabe do usuário: as regras da
// Memória Local e o histórico do que ele já categorizou.
import { prisma } from "./db";
import { escopoDoUsuario } from "./tenant";
import { chaveMemoria, montarHistorico, type MemoriaCategorizacao } from "./categorias";

export async function carregarMemoriaCategorizacao(userId: string): Promise<MemoriaCategorizacao> {
  const [regras, categorizados, perfil] = await Promise.all([
    prisma.memoriaIA.findMany({ where: escopoDoUsuario(userId) }),
    prisma.lancamento.groupBy({
      by: ["descricao", "tipo", "categoria"],
      where: escopoDoUsuario(userId, { categoria: { not: null } }),
      _count: { _all: true },
    }),
    prisma.userProfile.findUnique({ where: escopoDoUsuario(userId), select: { nomeCompleto: true } }),
  ]);
  return {
    memoria: new Map(regras.map((m): [string, string] => [chaveMemoria(m.descricao), m.categoriaCorreta])),
    historico: montarHistorico(categorizados.map((c) => ({ ...c, n: c._count._all }))),
    nomeCompleto: perfil?.nomeCompleto || undefined,
  };
}
