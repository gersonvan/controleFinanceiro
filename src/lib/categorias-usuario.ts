// Servidor: carrega as categorias do usuário (lib/catalogo-categorias.ts), barra
// gravações com categoria que não é dele e move os dados quando uma categoria
// some da lista. Ocultar uma nativa ou excluir uma personalizada obriga a
// escolher para onde vai o que já está nela: outra categoria existente ou
// nenhuma. As do sistema (CATEGORIAS_DO_SISTEMA) nunca saem da lista.
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { escopoDoUsuario } from "./tenant";
import { erro400 } from "./validacao";
import { categoriaLivre, montarCatalogo, type Catalogo } from "./catalogo-categorias";
import type { Grupo as GrupoFotografia } from "./planejamento";

export async function linhasDoUsuario(userId: string) {
  return prisma.categoriaUsuario.findMany({
    where: escopoDoUsuario(userId),
    select: { nome: true, nativa: true, grupo: true, destino: true },
    orderBy: { nome: "asc" },
  });
}

export async function carregarCatalogo(userId: string): Promise<Catalogo> {
  return montarCatalogo(await linhasDoUsuario(userId));
}

/** 400 se alguma categoria não for do usuário (nativa visível ou personalizada); null se todas servem. */
export async function categoriasForaDoCatalogo(userId: string, nomes: (string | null | undefined)[]) {
  const usadas = [...new Set(nomes.filter((n): n is string => !!n))];
  if (usadas.length === 0) return null;
  const catalogo = await carregarCatalogo(userId);
  const fora = usadas.filter((n) => !catalogo.validas.has(n));
  return fora.length ? erro400("Categoria inválida", fora.map((n) => `"${n}" não está nas suas categorias`)) : null;
}

/** Desafios em andamento numa categoria: enquanto houver, ela não sai da lista. */
export async function desafiosAtivosNa(userId: string, categoria: string) {
  return prisma.desafio.count({ where: escopoDoUsuario(userId, { categoria, status: "ativo" }) });
}

export interface Migracao { lancamentos: number; regras: number; itensFotografia: number }

/**
 * Leva tudo o que está em `de` para `para` (null = sem categoria): lançamentos,
 * regras da Memória (sem destino, a regra deixa de existir), itens da Fotografia
 * (que sempre precisam de uma categoria: sem destino, vão para a categoria livre
 * do grupo), categorias encerradas da Previsão e o destino de outras ocultas.
 * `depois` é o catálogo já sem `de`. Desafios ficam com quem chama.
 */
export async function migrarCategoria(
  tx: Prisma.TransactionClient, userId: string, de: string, para: string | null, depois: Catalogo,
): Promise<Migracao> {
  const lancamentos = await tx.lancamento.updateMany({ where: escopoDoUsuario(userId, { categoria: de }), data: { categoria: para } });
  const regras = para
    ? await tx.memoriaIA.updateMany({ where: escopoDoUsuario(userId, { categoriaCorreta: de }), data: { categoriaCorreta: para } })
    : await tx.memoriaIA.deleteMany({ where: escopoDoUsuario(userId, { categoriaCorreta: de }) });

  const itens = await tx.planejamentoItem.findMany({ where: escopoDoUsuario(userId, { categoria: de }), select: { id: true, grupo: true } });
  for (const item of itens) {
    await tx.planejamentoItem.updateMany({
      where: escopoDoUsuario(userId, { id: item.id }),
      data: { categoria: para ?? categoriaLivre(depois, item.grupo as GrupoFotografia) },
    });
  }

  const perfil = await tx.userProfile.findUnique({ where: escopoDoUsuario(userId), select: { previsaoEncerradas: true } });
  if (perfil?.previsaoEncerradas.includes(de)) {
    const encerradas = perfil.previsaoEncerradas.filter((c) => c !== de);
    if (para && !encerradas.includes(para)) encerradas.push(para);
    await tx.userProfile.update({ where: escopoDoUsuario(userId), data: { previsaoEncerradas: encerradas } });
  }

  // outra nativa oculta que mandava para `de` passa a mandar para o novo destino
  await tx.categoriaUsuario.updateMany({ where: escopoDoUsuario(userId, { nativa: true, destino: de }), data: { destino: para } });

  return { lancamentos: lancamentos.count, regras: regras.count, itensFotografia: itens.length };
}
