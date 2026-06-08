import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapearCategoria, CATEGORIAS } from "@/lib/categorias";

export async function POST(req: NextRequest) {
  const { ids } = await req.json() as { ids?: number[] };

  const memoria = await prisma.memoriaIA.findMany();
  const memoriaMap = new Map(
    memoria.map((m) => [m.descricao.toLowerCase(), m.categoriaCorreta])
  );

  const where = ids?.length
    ? { id: { in: ids } }
    : { categoria: null as null };

  const lancamentos = await prisma.lancamento.findMany({ where });

  let categorizadosRegras = 0;
  let categorizadosIA = 0;
  let semCategoria = 0;

  const apiKey = process.env.GEMINI_API_KEY;
  const categoriasStr = CATEGORIAS.join(", ");

  for (const l of lancamentos) {
    // Tenta regras e memória primeiro
    const cat = mapearCategoria(l.descricao, "", l.tipo, memoriaMap);

    if (cat) {
      await prisma.lancamento.update({
        where: { id: l.id },
        data: { categoria: cat },
      });
      categorizadosRegras++;
      continue;
    }

    // Fallback: API do Gemini (se chave disponível)
    if (apiKey) {
      try {
        const catIA = await chamarGemini(l.descricao, categoriasStr, apiKey);
        if (catIA && CATEGORIAS.includes(catIA as never)) {
          await prisma.lancamento.update({
            where: { id: l.id },
            data: { categoria: catIA },
          });
          categorizadosIA++;
          await sleep(1100);
          continue;
        }
      } catch {
        // ignora erro da IA, deixa sem categoria
      }
    }

    semCategoria++;
  }

  return NextResponse.json({
    total: lancamentos.length,
    categorizadosRegras,
    categorizadosIA,
    semCategoria,
  });
}

async function chamarGemini(
  descricao: string,
  categoriasStr: string,
  apiKey: string
): Promise<string | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`;

  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: `Descrição da transação: "${descricao}"` }],
      },
    ],
    systemInstruction: {
      parts: [
        {
          text: `Você é um assistente de finanças pessoais brasileiro. Analise a descrição de transação bancária e retorne UMA categoria da lista. Responda APENAS com o JSON.

Categorias válidas: [${categoriasStr}]`,
        },
      ],
    },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          categoria_sugerida: { type: "STRING" },
        },
        required: ["categoria_sugerida"],
      },
      temperature: 0.0,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
