import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { gastosDoPix, pixesDoGasto, recalcularPixes, recalcularReembolsados } from "@/lib/reembolso-dados";
import { getSessionUserId } from "@/lib/session";
import { padronizarConta } from "@/lib/contas";
import { dadosAtualizaveisDoUsuario, dadosDoUsuario, escopoDoUsuario } from "@/lib/tenant";
import { filtrosLancamentoSchema, montarWhereLancamentos } from "@/lib/filtros";
import {
  categoriaSchema, idSchema, lerCorpo, lerQuery, opcional, textoCurto, textoLongo,
  tipoSchema, validar,
} from "@/lib/validacao";

const listagemSchema = filtrosLancamentoSchema.extend({
  page: opcional(z.coerce.number().int().min(1)).default(1),
  limit: opcional(z.coerce.number().int().min(1).max(500)).default(50),
});

// Campos que o cliente pode escrever; tudo fora daqui (id, createdAt, userId…) é descartado.
const camposLancamento = z.object({
  data: z.coerce.date(),
  descricao: textoLongo,
  valor: z.number().finite(),
  tipo: tipoSchema,
  conta: textoCurto,
  categoria: categoriaSchema.nullable().optional(),
  pessoa: textoCurto.nullable().optional(),
  mesReferencia: z.coerce.date().nullable().optional(),
  fonte: textoCurto.nullable().optional(),
});

const criacaoSchema = camposLancamento;
const edicaoSchema = camposLancamento.partial().extend({ id: idSchema });

const recategorizacaoSchema = z
  .object({
    ids: z.array(idSchema).max(1000).optional(),
    descricaoContem: textoCurto.optional(),
    descricaoExata: textoLongo.optional(),
    categoriaErrada: z.string().trim().min(1).max(100).optional(),
    somenteSemCategoria: z.boolean().optional(),
    categoriaCorreta: categoriaSchema,
    pessoa: textoCurto.optional(), // para Empréstimo / Recebimento de Empréstimo
  })
  // Sem nenhum critério o updateMany atingiria todos os lançamentos do usuário.
  .refine((v) => v.ids?.length || v.descricaoContem || v.descricaoExata || v.categoriaErrada, {
    message: "Informe ids, descricaoContem, descricaoExata ou categoriaErrada",
  });

export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const v = validar(listagemSchema, lerQuery(req));
  if (!v.ok) return v.resposta;
  const { page, limit, ...filtros } = v.dados;

  const where = montarWhereLancamentos(userId, filtros);

  const [total, lancamentos] = await Promise.all([
    prisma.lancamento.count({ where }),
    prisma.lancamento.findMany({
      where,
      orderBy: { data: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return NextResponse.json({ lancamentos, total, page, limit });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const v = validar(criacaoSchema, await lerCorpo(req));
  if (!v.ok) return v.resposta;

  const { conta } = await padronizarConta(userId, v.dados.conta); // "Carteira" → "Outro · Carteira"
  const lancamento = await prisma.lancamento.create({
    data: dadosDoUsuario(userId, { ...v.dados, conta }),
  });
  return NextResponse.json(lancamento, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const v = validar(idSchema, lerQuery(req).id);
  if (!v.ok) return v.resposta;

  // Pix de reembolso excluído: os gastos que ele abatia voltam ao valor cheio.
  // Gasto excluído: o que o Pix usava nele volta a ser sobra (entrada).
  await prisma.$transaction(async (tx) => {
    const gastos = await gastosDoPix(tx, userId, v.dados);
    const pixes = await pixesDoGasto(tx, userId, v.dados);
    await tx.lancamento.deleteMany({ where: escopoDoUsuario(userId, { id: v.dados }) });
    await recalcularReembolsados(tx, userId, gastos);
    await recalcularPixes(tx, userId, pixes);
  });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const v = validar(edicaoSchema, await lerCorpo(req));
  if (!v.ok) return v.resposta;
  const { id, ...campos } = v.dados;
  const data = campos.conta ? { ...campos, conta: (await padronizarConta(userId, campos.conta)).conta } : campos;

  const lancamento = await prisma.lancamento.updateMany({
    where: escopoDoUsuario(userId, { id }),
    data: dadosAtualizaveisDoUsuario(userId, data),
  });
  return NextResponse.json(lancamento);
}

export async function PUT(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const v = validar(recategorizacaoSchema, await lerCorpo(req));
  if (!v.ok) return v.resposta;
  const { ids, descricaoContem, descricaoExata, categoriaErrada, somenteSemCategoria, categoriaCorreta, pessoa } = v.dados;

  const where = escopoDoUsuario(userId);
  if (ids?.length)     where.id       = { in: ids };
  if (descricaoContem) where.descricao = { contains: descricaoContem, mode: "insensitive" };
  if (descricaoExata)  where.descricao = descricaoExata;
  if (categoriaErrada) where.categoria = categoriaErrada;
  if (somenteSemCategoria) where.categoria = null;

  const result = await prisma.lancamento.updateMany({
    where,
    data: { categoria: categoriaCorreta, ...(pessoa ? { pessoa } : {}) },
  });

  return NextResponse.json({ corrigidos: result.count });
}
