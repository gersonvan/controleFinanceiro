// Categorias do usuário (lib/catalogo-categorias.ts, lib/categorias-usuario.ts):
//   GET   → linhas de CategoriaUsuario e quantos lançamentos há em cada categoria
//   POST  { nome, grupo }                        → cria uma personalizada
//   PATCH { acao: "ocultar", nome, destino }     → oculta uma nativa (não do sistema)
//         { acao: "mostrar", nome }              → mostra de novo uma nativa oculta
//         { acao: "renomear", nome, novoNome }   → renomeia uma personalizada (tudo acompanha)
//         { acao: "excluir", nome, destino }     → exclui uma personalizada
// Ocultar e excluir exigem o destino do que já está na categoria: outra existente,
// do mesmo lado (entrada/saída), ou null = sem categoria.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { dadosDoUsuario, escopoDoUsuario } from "@/lib/tenant";
import { erro400, lerCorpo, validar } from "@/lib/validacao";
import { CATEGORIAS_DO_SISTEMA } from "@/lib/categorias";
import {
  destinosPossiveis, GRUPOS_PERSONALIZAVEIS, limparNome, MAX_PERSONALIZADAS, montarCatalogo, podeOcultar, problemaNoNome,
  type Catalogo, type LinhaCategoriaUsuario,
} from "@/lib/catalogo-categorias";
import { desafiosAtivosNa, linhasDoUsuario, migrarCategoria } from "@/lib/categorias-usuario";

const nome = z.string().trim().min(1).max(60);
const criarSchema = z.object({ nome, grupo: z.string().refine((g) => GRUPOS_PERSONALIZAVEIS.includes(g), "Grupo inválido") });
// destino sem .optional(): a escolha é obrigatória (null = sem categoria)
const acaoSchema = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("ocultar"), nome, destino: nome.nullable() }),
  z.object({ acao: z.literal("mostrar"), nome }),
  z.object({ acao: z.literal("renomear"), nome, novoNome: nome }),
  z.object({ acao: z.literal("excluir"), nome, destino: nome.nullable() }),
]);

export interface RespostaCategorias {
  linhas: LinhaCategoriaUsuario[];
  lancamentos: Record<string, number>; // por categoria
  sistema: string[];
}

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const [linhas, porCategoria] = await Promise.all([
    linhasDoUsuario(userId),
    prisma.lancamento.groupBy({ by: ["categoria"], where: escopoDoUsuario(userId, { categoria: { not: null } }), _count: { _all: true } }),
  ]);
  return NextResponse.json({
    linhas,
    lancamentos: Object.fromEntries(porCategoria.map((c) => [c.categoria, c._count._all])),
    sistema: [...CATEGORIAS_DO_SISTEMA],
  } satisfies RespostaCategorias);
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const v = validar(criarSchema, await lerCorpo(req));
  if (!v.ok) return v.resposta;

  const catalogo = montarCatalogo(await linhasDoUsuario(userId));
  if (catalogo.personalizadas.length >= MAX_PERSONALIZADAS) return erro400(`Você já tem ${MAX_PERSONALIZADAS} categorias próprias.`);
  const problema = problemaNoNome(v.dados.nome, catalogo);
  if (problema) return erro400(problema);

  const criada = await prisma.categoriaUsuario.create({
    data: dadosDoUsuario(userId, { nome: limparNome(v.dados.nome), nativa: false, grupo: v.dados.grupo }),
    select: { nome: true, nativa: true, grupo: true, destino: true },
  });
  return NextResponse.json(criada, { status: 201 });
}

/** null se dá para mandar o que está em `nome` para `destino`; senão, a resposta de erro. */
function conferirDestino(catalogo: Catalogo, nome: string, destino: string | null) {
  if (destino !== null && !destinosPossiveis(catalogo, nome).includes(destino)) {
    return erro400("Escolha uma categoria sua do mesmo tipo (entrada ou saída), ou deixe sem categoria.");
  }
  return null;
}

async function semDesafioAtivo(userId: string, nome: string) {
  const n = await desafiosAtivosNa(userId, nome);
  return n === 0 ? null : NextResponse.json(
    { error: `Há ${n === 1 ? "um desafio em andamento" : `${n} desafios em andamento`} em "${nome}". Encerre antes de tirar a categoria da lista.` },
    { status: 409 },
  );
}

export async function PATCH(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const v = validar(acaoSchema, await lerCorpo(req));
  if (!v.ok) return v.resposta;
  const pedido = v.dados;

  const linhas = await linhasDoUsuario(userId);
  const catalogo = montarCatalogo(linhas);
  const personalizada = catalogo.personalizadas.some((p) => p.nome === pedido.nome);

  if (pedido.acao === "mostrar") {
    await prisma.categoriaUsuario.deleteMany({ where: escopoDoUsuario(userId, { nome: pedido.nome, nativa: true }) });
    return NextResponse.json({ ok: true });
  }

  if (pedido.acao === "ocultar") {
    if (!podeOcultar(pedido.nome)) {
      return erro400(CATEGORIAS_DO_SISTEMA.has(pedido.nome) ? "Essa categoria é usada nos cálculos do app e não pode ser ocultada." : "Categoria do app não encontrada.");
    }
    if (catalogo.ocultas.has(pedido.nome)) return erro400("Essa categoria já está oculta.");
    const erro = conferirDestino(catalogo, pedido.nome, pedido.destino) ?? await semDesafioAtivo(userId, pedido.nome);
    if (erro) return erro;
    const depois = montarCatalogo([...linhas, { nome: pedido.nome, nativa: true, grupo: null, destino: pedido.destino }]);
    const migracao = await prisma.$transaction(async (tx) => {
      const m = await migrarCategoria(tx, userId, pedido.nome, pedido.destino, depois);
      await tx.categoriaUsuario.create({ data: dadosDoUsuario(userId, { nome: pedido.nome, nativa: true, destino: pedido.destino }) });
      return m;
    });
    return NextResponse.json({ ok: true, migracao });
  }

  // renomear e excluir: só as personalizadas
  if (!personalizada) return erro400("Só dá para renomear ou excluir as categorias que você criou.");

  if (pedido.acao === "renomear") {
    const novo = limparNome(pedido.novoNome);
    if (novo === pedido.nome) return NextResponse.json({ ok: true });
    const problema = problemaNoNome(novo, catalogo, pedido.nome);
    if (problema) return erro400(problema);
    const depois = montarCatalogo(linhas.map((l) => (l.nome === pedido.nome && !l.nativa ? { ...l, nome: novo } : l)));
    const migracao = await prisma.$transaction(async (tx) => {
      const m = await migrarCategoria(tx, userId, pedido.nome, novo, depois);
      // o mesmo desafio, a mesma categoria: inclusive os já encerrados
      await tx.desafio.updateMany({ where: escopoDoUsuario(userId, { categoria: pedido.nome }), data: { categoria: novo } });
      await tx.categoriaUsuario.updateMany({ where: escopoDoUsuario(userId, { nome: pedido.nome, nativa: false }), data: { nome: novo } });
      return m;
    });
    return NextResponse.json({ ok: true, nome: novo, migracao });
  }

  // excluir
  const erro = conferirDestino(catalogo, pedido.nome, pedido.destino) ?? await semDesafioAtivo(userId, pedido.nome);
  if (erro) return erro;
  const depois = montarCatalogo(linhas.filter((l) => !(l.nome === pedido.nome && !l.nativa)));
  const migracao = await prisma.$transaction(async (tx) => {
    const m = await migrarCategoria(tx, userId, pedido.nome, pedido.destino, depois);
    await tx.categoriaUsuario.deleteMany({ where: escopoDoUsuario(userId, { nome: pedido.nome, nativa: false }) });
    return m;
  });
  return NextResponse.json({ ok: true, migracao });
}
