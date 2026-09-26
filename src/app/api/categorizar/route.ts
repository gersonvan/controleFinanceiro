import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { categorizarComOrigem, CATEGORIAS } from "@/lib/categorias";
import { carregarMemoriaCategorizacao } from "@/lib/memoria";
import { getSessionUserId } from "@/lib/session";
import { escopoDoUsuario } from "@/lib/tenant";
import { z } from "zod";
import { idSchema, lerCorpo, validar } from "@/lib/validacao";

// Cada chamada ao Gemini leva ~1,1 s (rate limit): sem teto uma única requisição
// poderia rodar por minutos e estourar o timeout da função e a cota gratuita.
const MAX_GEMINI_POR_REQUISICAO = 50;

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
  const semCategoria: number[] = [];
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
  let categorizadosGemini = 0;

  if (usarGemini && aindaSemCategoria.length > 0) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      const categoriasStr = CATEGORIAS.join(", ");
      for (const l of aindaSemCategoria.slice(0, MAX_GEMINI_POR_REQUISICAO)) {
        try {
          const catIA = await chamarGemini(l.descricao, categoriasStr, apiKey);
          if (catIA && CATEGORIAS.includes(catIA as never)) {
            await prisma.lancamento.updateMany({
              where: escopoDoUsuario(userId, { id: l.id }),
              data: { categoria: catIA },
            });
            categorizadosGemini++;
            semCategoria.splice(semCategoria.indexOf(l.id), 1);
          }
          await sleep(1100);
        } catch {
          // ignora erro, deixa sem categoria
        }
      }
    }
  }

  for (const l of aindaSemCategoria) {
    semCategoria.push(l.id);
  }

  return NextResponse.json({
    total: lancamentos.length,
    porMemoria: porMemoria.length,
    porHistorico: porHistorico.length,
    porRegras: porRegras.length,
    porGemini: categorizadosGemini,
    semCategoria: semCategoria.length - categorizadosGemini,
  });
}

async function chamarGemini(
  descricao: string,
  categoriasStr: string,
  apiKey: string
): Promise<string | null> {
  // A chave vai no header, não na query string, para não parar em logs de proxy.
  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent";

  const payload = {
    contents: [{ role: "user", parts: [{ text: `Descrição da transação: "${descricao}"` }] }],
    systemInstruction: {
      parts: [{
        text: `Você é um assistente de finanças pessoais brasileiro. Analise a descrição de transação bancária e retorne UMA categoria da lista. Responda APENAS com o JSON.\n\nCategorias válidas: [${categoriasStr}]`,
      }],
    },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: { categoria_sugerida: { type: "STRING" } },
        required: ["categoria_sugerida"],
      },
      temperature: 0.0,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`Gemini error: ${res.status}`);
  const data = await res.json();
  const jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!jsonText) return null;
  return JSON.parse(jsonText).categoria_sugerida || null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
