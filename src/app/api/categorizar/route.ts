import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapearCategoria, CATEGORIAS } from "@/lib/categorias";

export async function POST(req: NextRequest) {
  const body = await req.json() as { ids?: number[]; usarGemini?: boolean; forcarRegras?: boolean };
  const { ids, usarGemini = false, forcarRegras = false } = body;

  // Carrega Memória da IA
  const memoria = await prisma.memoriaIA.findMany();
  const memoriaMap = new Map<string, string>(
    memoria.map((m): [string, string] => [m.descricao.toLowerCase(), m.categoriaCorreta])
  );

  // forcarRegras = re-aplica regras em TODOS os lançamentos (ignora categoria existente)
  // modo normal  = só processa lançamentos sem categoria
  const where = ids?.length
    ? { id: { in: ids }, ...(forcarRegras ? {} : { categoria: null as null }) }
    : (forcarRegras ? {} : { categoria: null as null });

  const lancamentos = await prisma.lancamento.findMany({ where });

  const porMemoria: { id: number; categoria: string }[] = [];
  const porRegras:  { id: number; categoria: string }[] = [];
  const semCategoria: number[] = [];

  // --- Fase 1: Memória da IA (match exato) ---
  const restantes: typeof lancamentos = [];

  for (const l of lancamentos) {
    const descLower = l.descricao.toLowerCase();
    if (memoriaMap.has(descLower)) {
      porMemoria.push({ id: l.id, categoria: memoriaMap.get(descLower)! });
    } else {
      restantes.push(l);
    }
  }

  // --- Fase 2: Regras manuais (padrões de texto) ---
  const aindaSemCategoria: typeof lancamentos = [];

  for (const l of restantes) {
    // passa memoriaMap vazio para garantir que só usa as regras, memória já foi processada
    const cat = mapearCategoria(l.descricao, "", l.tipo, new Map());
    if (cat) {
      porRegras.push({ id: l.id, categoria: cat });
    } else {
      aindaSemCategoria.push(l);
    }
  }

  // --- Batch update: Memória da IA ---
  if (porMemoria.length > 0) {
    await Promise.all(
      porMemoria.map((item) =>
        prisma.lancamento.update({
          where: { id: item.id },
          data: { categoria: item.categoria },
        })
      )
    );
  }

  // --- Batch update: Regras manuais ---
  if (porRegras.length > 0) {
    await Promise.all(
      porRegras.map((item) =>
        prisma.lancamento.update({
          where: { id: item.id },
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
      for (const l of aindaSemCategoria) {
        try {
          const catIA = await chamarGemini(l.descricao, categoriasStr, apiKey);
          if (catIA && CATEGORIAS.includes(catIA as never)) {
            await prisma.lancamento.update({
              where: { id: l.id },
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
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`;

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
