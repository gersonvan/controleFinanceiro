import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { dadosDoUsuario, escopoDoUsuario } from "@/lib/tenant";
import { categoriaSchema, lerCorpo, textoCurto, validar } from "@/lib/validacao";
import { GRUPOS, PERIODICIDADES, totaisMensais, type ItemPlanejado } from "@/lib/planejamento";
import { categoriasForaDoCatalogo } from "@/lib/categorias-usuario";

const MARGEM_PADRAO = 20;

const itemSchema = z
  .object({
    grupo: z.enum(GRUPOS),
    descricao: textoCurto,
    categoria: categoriaSchema,
    valor: z.number().positive().max(1_000_000_000),
    periodicidade: z.enum(PERIODICIDADES).default("mensal"),
    parcelaAtual: z.number().int().min(1).max(1000).nullable().optional(),
    parcelaTotal: z.number().int().min(1).max(1000).nullable().optional(),
  })
  .superRefine((item, ctx) => {
    if (item.grupo === "parcela") {
      if (item.parcelaAtual == null || item.parcelaTotal == null) {
        ctx.addIssue({ code: "custom", message: "Parcela exige parcelaAtual e parcelaTotal", path: ["parcelaAtual"] });
      } else if (item.parcelaAtual > item.parcelaTotal) {
        ctx.addIssue({ code: "custom", message: "parcelaAtual não pode passar de parcelaTotal", path: ["parcelaAtual"] });
      }
      return;
    }
    // Periodicidade coerente com o grupo: sazonal é anual; variável pode ser
    // semanal ou mensal; entradas e fixos são mensais.
    const permitidas: Record<string, readonly string[]> = {
      entrada: ["mensal"], fixo: ["mensal"], variavel: ["mensal", "semanal"], sazonal: ["anual"],
    };
    if (!permitidas[item.grupo].includes(item.periodicidade)) {
      ctx.addIssue({ code: "custom", message: `Periodicidade inválida para ${item.grupo}`, path: ["periodicidade"] });
    }
  });

const fotografiaSchema = z.object({
  itens: z.array(itemSchema).max(200),
  margemPercentual: z.number().min(0).max(100).default(MARGEM_PADRAO),
  concluir: z.boolean().default(false),
});

async function carregarFotografia(userId: string) {
  const [perfil, itens] = await Promise.all([
    prisma.userProfile.findUnique({ where: escopoDoUsuario(userId) }),
    prisma.planejamentoItem.findMany({
      where: escopoDoUsuario(userId),
      orderBy: [{ ordem: "asc" }, { id: "asc" }],
    }),
  ]);
  const margemPercentual = perfil?.margemPercentual ?? MARGEM_PADRAO;
  return {
    itens,
    margemPercentual,
    fotografiaConcluidaEm: perfil?.fotografiaConcluidaEm ?? null,
    totais: totaisMensais(itens as ItemPlanejado[], margemPercentual),
  };
}

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  return NextResponse.json(await carregarFotografia(userId));
}

// Substitui a fotografia inteira: o wizard sempre envia o conjunto completo.
export async function PUT(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const v = validar(fotografiaSchema, await lerCorpo(req));
  if (!v.ok) return v.resposta;
  const fora = await categoriasForaDoCatalogo(userId, v.dados.itens.map((i) => i.categoria)); // só as categorias do usuário
  if (fora) return fora;
  const { itens, margemPercentual, concluir } = v.dados;

  const concluidaEm = concluir ? new Date() : undefined;

  await prisma.$transaction([
    prisma.planejamentoItem.deleteMany({ where: escopoDoUsuario(userId) }),
    prisma.planejamentoItem.createMany({
      data: itens.map((item, ordem) => dadosDoUsuario(userId, { ...item, ordem })),
    }),
    prisma.userProfile.upsert({
      where: escopoDoUsuario(userId),
      create: dadosDoUsuario(userId, { margemPercentual, fotografiaConcluidaEm: concluidaEm ?? null }),
      update: { margemPercentual, ...(concluidaEm ? { fotografiaConcluidaEm: concluidaEm } : {}) },
    }),
  ]);

  return NextResponse.json(await carregarFotografia(userId));
}
