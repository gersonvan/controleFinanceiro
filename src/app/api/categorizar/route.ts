import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { categorizarComOrigem, CATEGORIAS } from "@/lib/categorias";
import { carregarMemoriaCategorizacao } from "@/lib/memoria";
import { getSessionUserId } from "@/lib/session";
import { escopoDoUsuario } from "@/lib/tenant";
import { z } from "zod";
import { idSchema, lerCorpo, validar } from "@/lib/validacao";
import { categorizarComGemini, geminiConfigurado } from "@/lib/gemini";

// O Gemini vai em lotes (lib/gemini.ts): teto por clique para caber no tempo da
// função e na cota gratuita; o que sobrar fica para o próximo clique.
const MAX_GEMINI_POR_REQUISICAO = 200;

// Se o botão "✨ Inteligente" (categorização inteligente) deve aparecer (há chave configurada no servidor).
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  return NextResponse.json({ gemini: geminiConfigurado() });
}

const categorizacaoSchema = z.object({
  ids: z.array(idSchema).max(1000).optional(),
  usarGemini: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const v = validar(categorizacaoSchema, await lerCorpo(req));
  if (!v.ok) return v.resposta;
  const { ids, usarGemini } = v.dados;

  // Memória Local + histórico do que o usuário já categorizou
  const fonte = await carregarMemoriaCategorizacao(userId);

  // Só processa lançamentos sem categoria do usuário
  const where = escopoDoUsuario(userId, ids?.length
    ? { id: { in: ids }, categoria: null as null }
    : { categoria: null as null });

  const lancamentos = await prisma.lancamento.findMany({ where });

  const porMemoria: { id: number; categoria: string }[] = [];
  const porHistorico: { id: number; categoria: string }[] = [];
  const porRegras:  { id: number; categoria: string }[] = [];
  const aindaSemCategoria: typeof lancamentos = [];

  // --- Fases 1 e 2: Memória → delivery → histórico → regras ---
  for (const l of lancamentos) {
    const { categoria, origem } = categorizarComOrigem(l.descricao, "", l.tipo, fonte);
    if (origem === "memoria") porMemoria.push({ id: l.id, categoria });
    else if (origem === "historico") porHistorico.push({ id: l.id, categoria });
    else if (origem === "regra") porRegras.push({ id: l.id, categoria });
    else aindaSemCategoria.push(l);
  }

  // --- Batch update: Memória da IA e histórico ---
  const porAprendizado = [...porMemoria, ...porHistorico];
  if (porAprendizado.length > 0) {
    await prisma.$transaction(
      porAprendizado.map((item) =>
        prisma.lancamento.updateMany({
          where: escopoDoUsuario(userId, { id: item.id }),
          data: { categoria: item.categoria },
        })
      )
    );
  }

  // --- Batch update: Regras manuais ---
  if (porRegras.length > 0) {
    await prisma.$transaction(
      porRegras.map((item) =>
        prisma.lancamento.updateMany({
          where: escopoDoUsuario(userId, { id: item.id }),
          data: { categoria: item.categoria },
        })
      )
    );
  }

  // --- Fase 3: Gemini (só se solicitado explicitamente) ---
  let porGemini = 0;
  // "ok" | "sem-chave" | "erro": o botão avisa em vez de falhar calado
  let gemini: string | undefined;
  let geminiErro: string | undefined;
  if (usarGemini && aindaSemCategoria.length > 0) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) gemini = "sem-chave";
    else {
      const r = await categorizarComGemini(
        aindaSemCategoria.slice(0, MAX_GEMINI_POR_REQUISICAO).map(({ id, descricao, tipo }) => ({ id, descricao, tipo })),
        CATEGORIAS,
        { apiKey, modelo: process.env.GEMINI_MODEL },
      );
      if (r.categorias.size > 0) {
        await prisma.$transaction(
          [...r.categorias].map(([id, categoria]) =>
            prisma.lancamento.updateMany({ where: escopoDoUsuario(userId, { id }), data: { categoria } })
          )
        );
      }
      porGemini = r.categorias.size;
      gemini = r.erro ? "erro" : "ok";
      if (r.erro) geminiErro = r.erro.message;
    }
  }

  return NextResponse.json({
    total: lancamentos.length,
    porMemoria: porMemoria.length,
    porHistorico: porHistorico.length,
    porRegras: porRegras.length,
    porGemini,
    semCategoria: aindaSemCategoria.length - porGemini,
    ...(gemini && { gemini }),
    ...(geminiErro && { geminiErro }),
  });
}
