import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { tiposDasContas } from "@/lib/contas";
import { comValorLiquido } from "@/lib/reembolso";
import { dadosDoUsuario, escopoDoUsuario } from "@/lib/tenant";
import { categoriaSchema, idSchema, lerCorpo, validar } from "@/lib/validacao";
import {
  avaliar, categoriaAceitaTeto, categoriaDo, diaDeHoje, economiaAcumulada, LIMITE_SIMULTANEOS, MESES_MINIMOS,
  metaMaisFacil, MODELOS, MODELOS_IDS, montarBase, ocupamVaga, opcoesDeTeto, periodoDo, referenciaDo, repetido,
  sugerirDesafios, tituloDoDesafio, type Avaliacao, type Desafio, type LancamentoDesafio,
} from "@/lib/desafios";
import { carregarCatalogo, categoriasForaDoCatalogo } from "@/lib/categorias-usuario";
import { propriasDeGasto } from "@/lib/catalogo-categorias";

const DIA = 86_400_000;
/** Fechados que a página mostra (os abandonados somem: desistir não tem castigo). */
const HISTORICO = 20;

/** Lançamentos a partir de `desde` (pela data ou pela fatura), já líquidos de reembolsos. */
async function carregarLancamentos(userId: string, desde: Date): Promise<LancamentoDesafio[]> {
  const ls = await prisma.lancamento.findMany({
    where: escopoDoUsuario(userId, { OR: [{ data: { gte: desde } }, { mesReferencia: { gte: desde } }] }),
    select: {
      data: true, mesReferencia: true, valor: true, valorReembolsado: true, categoria: true,
      descricao: true, conta: true, tipo: true, fonte: true, createdAt: true,
    },
  });
  return ls.map(comValorLiquido);
}

/** Início dos 6 meses fechados que servem de base para o normal do usuário. */
const inicioDaBase = (hoje: Date) => new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 6, 1));

// Desafios com o estado de hoje (fecha os que terminaram e já têm extrato),
// sugestões, catálogo e economia acumulada.
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const hoje = diaDeHoje();
  const base0 = inicioDaBase(hoje);
  const desafios: Desafio[] = await prisma.desafio.findMany({ where: escopoDoUsuario(userId), orderBy: { inicio: "desc" } });
  const ativos = desafios.filter((d) => d.status === "ativo");
  // os ativos precisam das contas usadas até 60 dias antes do início
  const desde = new Date(Math.min(base0.getTime(), ...ativos.map((d) => d.inicio.getTime() - 60 * DIA)));
  const [tipos, lancamentos, semCategoria, catalogo] = await Promise.all([
    tiposDasContas(userId),
    carregarLancamentos(userId, desde),
    prisma.lancamento.count({ where: escopoDoUsuario(userId, { categoria: null, data: { gte: base0 } }) }),
    carregarCatalogo(userId),
  ]);

  const lista: (Desafio & Avaliacao)[] = [];
  for (const d of desafios) {
    const a = avaliar(d, lancamentos, tipos, hoje);
    if (a.fechamento) {
      await prisma.desafio.updateMany({
        where: escopoDoUsuario(userId, { id: d.id, status: "ativo" }),
        data: { ...a.fechamento, encerradoEm: new Date() },
      });
      Object.assign(d, a.fechamento);
    }
    lista.push({ ...d, ...a });
  }

  const base = montarBase(lancamentos, hoje);
  const emCurso = lista.filter((d) => d.status === "ativo");
  const fechados = lista.filter((d) => d.status === "cumprido" || d.status === "nao_cumprido").slice(0, HISTORICO);
  const comTitulo = (d: Desafio & Avaliacao) => {
    const facil = metaMaisFacil(d);
    return {
      id: d.id, modelo: d.modelo, categoria: d.categoria, meta: d.meta, referencia: d.referencia,
      inicio: d.inicio, fim: d.fim, status: d.status, estado: d.estado, resultado: d.resultado,
      economia: d.economia, parcial: d.parcial, pendentes: d.pendentes,
      titulo: tituloDoDesafio(d),
      nivel: MODELOS[d.modelo as keyof typeof MODELOS]?.nivel ?? 0,
      medida: MODELOS[d.modelo as keyof typeof MODELOS]?.medida ?? "gasto",
      maisFacil: facil === null ? null : { meta: facil, titulo: tituloDoDesafio({ ...d, meta: facil }) },
    };
  };

  return NextResponse.json({
    hoje,
    limite: LIMITE_SIMULTANEOS,
    vagas: Math.max(LIMITE_SIMULTANEOS - ocupamVaga(desafios, hoje), 0),
    economiaAcumulada: economiaAcumulada(desafios),
    emCurso: emCurso.map(comTitulo),
    fechados: fechados.map(comTitulo),
    sugestoes: sugerirDesafios(base, desafios, hoje),
    catalogo: MODELOS_IDS.map((id) => ({
      id, ...MODELOS[id], ...periodoDo(id, hoje),
      referencia: MODELOS[id].medida === "gasto" && !MODELOS[id].categoriaFixa ? null : referenciaDo(id, categoriaDo(id, null), base),
    })),
    opcoesTeto: opcoesDeTeto(base, propriasDeGasto(catalogo)), // as próprias de gasto também
    semHistorico: base.mesesComDados < MESES_MINIMOS,
    semCategoria,
  });
}

const aceiteSchema = z.object({
  modelo: z.enum(MODELOS_IDS as [string, ...string[]]),
  categoria: categoriaSchema.nullable().optional(),
  meta: z.number().finite().min(-1e7).max(1e7).optional(),
});

// Aceita um desafio: o servidor calcula período e referência; o cliente só escolhe modelo, categoria e meta.
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const v = validar(aceiteSchema, await lerCorpo(req));
  if (!v.ok) return v.resposta;
  const fora = await categoriasForaDoCatalogo(userId, [v.dados.categoria]); // só as categorias do usuário
  if (fora) return fora;

  const modelo = v.dados.modelo as (typeof MODELOS_IDS)[number];
  const { medida } = MODELOS[modelo];
  const categoria = categoriaDo(modelo, v.dados.categoria);
  if (medida === "gasto" && (!categoria || !categoriaAceitaTeto(categoria, propriasDeGasto(await carregarCatalogo(userId)))))
    return NextResponse.json({ error: "Escolha uma categoria de gasto" }, { status: 400 });
  if (medida !== "sobra" && (v.dados.meta ?? 0) < 0)
    return NextResponse.json({ error: "A meta não pode ser negativa" }, { status: 400 });

  const hoje = diaDeHoje();
  const periodo = periodoDo(modelo, hoje);
  const desafios = await prisma.desafio.findMany({ where: escopoDoUsuario(userId), select: { modelo: true, categoria: true, status: true, inicio: true, fim: true } });
  if (ocupamVaga(desafios, hoje) >= LIMITE_SIMULTANEOS)
    return NextResponse.json({ error: `Você já tem ${LIMITE_SIMULTANEOS} desafios em andamento` }, { status: 409 });
  if (repetido(desafios, { modelo, categoria, ...periodo }))
    return NextResponse.json({ error: "Você já tem esse desafio neste período" }, { status: 409 });

  const base = montarBase(await carregarLancamentos(userId, inicioDaBase(hoje)), hoje);
  const referencia = referenciaDo(modelo, categoria, base);
  const meta = v.dados.meta ?? (modelo === "teto-categoria" ? Math.round((referencia * 0.9) / 10) * 10 : 0);
  const criado = await prisma.desafio.create({
    data: dadosDoUsuario(userId, { modelo, categoria, meta, referencia, ...periodo }),
  });
  return NextResponse.json({ ...criado, titulo: tituloDoDesafio(criado) }, { status: 201 });
}

const acaoSchema = z.object({ id: idSchema, acao: z.enum(["desistir", "encerrar"]) });

// Desistir (sai da lista, sem castigo) ou encerrar um que terminou e ainda espera extrato.
export async function PATCH(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const v = validar(acaoSchema, await lerCorpo(req));
  if (!v.ok) return v.resposta;
  const { id, acao } = v.dados;

  const d = await prisma.desafio.findFirst({ where: escopoDoUsuario(userId, { id, status: "ativo" }) });
  if (!d) return NextResponse.json({ error: "Desafio não encontrado" }, { status: 404 });

  if (acao === "desistir") {
    await prisma.desafio.updateMany({ where: escopoDoUsuario(userId, { id, status: "ativo" }), data: { status: "abandonado", encerradoEm: new Date() } });
    return NextResponse.json({ ok: true });
  }

  const hoje = diaDeHoje();
  if (hoje <= d.fim) return NextResponse.json({ error: "O desafio ainda está em andamento" }, { status: 409 });
  const [tipos, lancamentos] = await Promise.all([
    tiposDasContas(userId),
    carregarLancamentos(userId, new Date(d.inicio.getTime() - 60 * DIA)),
  ]);
  const a = avaliar(d, lancamentos, tipos, hoje, true);
  await prisma.desafio.updateMany({
    where: escopoDoUsuario(userId, { id, status: "ativo" }),
    data: { ...a.fechamento!, encerradoEm: new Date() },
  });
  return NextResponse.json({ ok: true, ...a.fechamento });
}
