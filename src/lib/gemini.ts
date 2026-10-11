// Categorização pelo Gemini (opcional, botão "✨ Inteligente" em Lançamentos): só o
// que a Memória, o histórico e as regras não resolveram, em lotes — um pedido
// com várias descrições em vez de um por lançamento. Sem GEMINI_API_KEY o
// botão não aparece. O modelo pode ser trocado por GEMINI_MODEL sem mexer no
// código: o anterior (gemini-2.0-flash-lite) foi desligado pelo Google em
// 01/06/2026 e, como os erros eram engolidos, o botão parecia não fazer nada.

export const MODELO_PADRAO = "gemini-3.1-flash-lite";
/** Lançamentos por pedido ao Gemini. */
export const POR_PEDIDO = 50;
const TEMPO_MAXIMO_MS = 25_000;

export const geminiConfigurado = () => !!process.env.GEMINI_API_KEY;

export interface ItemGemini { id: number; descricao: string; tipo: string }

/** Falha do Gemini com o status HTTP (a mensagem não leva corpo de resposta nem chave). */
export class ErroGemini extends Error {
  constructor(readonly status: number) {
    // vai para a tela: sem o nome do fornecedor
    super(status ? `o serviço respondeu HTTP ${status}` : "o serviço não respondeu");
  }
}

const INSTRUCAO =
  "Você é um assistente de finanças pessoais brasileiro. Recebe uma lista JSON de transações bancárias " +
  "(id, descricao, tipo Entrada ou Saída). Para cada uma, escolha UMA categoria da lista permitida que " +
  "descreva o gasto ou a receita. Se não der para saber pela descrição, deixe a transação de fora da resposta.";

async function pedir(
  lote: ItemGemini[],
  categorias: readonly string[],
  opts: { apiKey: string; modelo: string; fetch: typeof fetch },
): Promise<Map<number, string>> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${opts.modelo}:generateContent`;
  const payload = {
    contents: [{ role: "user", parts: [{ text: JSON.stringify(lote.map(({ id, descricao, tipo }) => ({ id, descricao, tipo }))) }] }],
    systemInstruction: { parts: [{ text: INSTRUCAO }] },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: { id: { type: "INTEGER" }, categoria: { type: "STRING", enum: [...categorias] } },
          required: ["id", "categoria"],
        },
      },
      temperature: 0,
    },
  };
  let res: Response;
  try {
    // a chave vai no header, não na URL, para não parar em logs
    res = await opts.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": opts.apiKey },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TEMPO_MAXIMO_MS),
    });
  } catch {
    throw new ErroGemini(0);
  }
  if (!res.ok) throw new ErroGemini(res.status);

  const data = await res.json().catch(() => null);
  const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  let respostas: unknown;
  try { respostas = JSON.parse(texto ?? "[]"); } catch { respostas = []; }

  const ids = new Set(lote.map((l) => l.id));
  const resultado = new Map<number, string>();
  for (const r of Array.isArray(respostas) ? respostas : []) {
    const { id, categoria } = (r ?? {}) as { id?: unknown; categoria?: unknown };
    if (typeof id === "number" && ids.has(id) && typeof categoria === "string" && categorias.includes(categoria))
      resultado.set(id, categoria);
  }
  return resultado;
}

/**
 * Categoria sugerida por id, só com ids do pedido e categorias da lista. Um
 * erro interrompe os lotes seguintes, mas o que já voltou é aproveitado.
 */
export async function categorizarComGemini(
  itens: ItemGemini[],
  categorias: readonly string[],
  opts: { apiKey: string; modelo?: string; fetch?: typeof fetch },
): Promise<{ categorias: Map<number, string>; erro: ErroGemini | null }> {
  const config = { apiKey: opts.apiKey, modelo: opts.modelo || MODELO_PADRAO, fetch: opts.fetch ?? fetch };
  const resultado = new Map<number, string>();
  try {
    for (let i = 0; i < itens.length; i += POR_PEDIDO) {
      for (const [id, c] of await pedir(itens.slice(i, i + POR_PEDIDO), categorias, config)) resultado.set(id, c);
    }
  } catch (e) {
    return { categorias: resultado, erro: e instanceof ErroGemini ? e : new ErroGemini(0) };
  }
  return { categorias: resultado, erro: null };
}
