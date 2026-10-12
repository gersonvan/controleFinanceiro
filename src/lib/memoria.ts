// Carrega o que a categorização automática sabe do usuário: as regras da
// Memória Local, o histórico do que ele já categorizou e as categorias que ele
// ocultou (com o destino de cada uma).
import { prisma } from "./db";
import { escopoDoUsuario } from "./tenant";
import { carregarApelidos } from "./apelidos";
import { chaveMemoria, montarHistorico, type MemoriaCategorizacao } from "./categorias";
import { carregarCatalogo } from "./categorias-usuario";

export async function carregarMemoriaCategorizacao(userId: string): Promise<MemoriaCategorizacao> {
  const [regras, categorizados, perfil, apelidos, catalogo] = await Promise.all([
    prisma.memoriaIA.findMany({ where: escopoDoUsuario(userId) }),
    prisma.lancamento.groupBy({
      by: ["descricao", "tipo", "categoria"],
      where: escopoDoUsuario(userId, { categoria: { not: null } }),
      _count: { _all: true },
    }),
    prisma.userProfile.findUnique({ where: escopoDoUsuario(userId), select: { nomeCompleto: true } }),
    carregarApelidos(userId),
    carregarCatalogo(userId),
  ]);
  return {
    memoria: new Map(regras.map((m): [string, string] => [chaveMemoria(m.descricao), m.categoriaCorreta])),
    historico: montarHistorico(categorizados.map((c) => ({ ...c, n: c._count._all })), apelidos),
    nomeCompleto: perfil?.nomeCompleto || undefined,
    apelidos,
    ocultas: catalogo.ocultas,
  };
}
