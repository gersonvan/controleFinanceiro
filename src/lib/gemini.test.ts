import { describe, expect, it, vi } from "vitest";
import { categorizarComGemini, MODELO_PADRAO, POR_PEDIDO } from "./gemini";

const CATEGORIAS = ["Compras", "Restaurantes e Lanches", "Salário"];
const resposta = (itens: unknown[], status = 200) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(itens) }] } }] }), { status });
const itens = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, descricao: `LOJA ${i + 1}`, tipo: "Saída" }));

describe("Gemini", () => {
  it("manda a chave no header, o modelo atual na URL e as descrições num pedido só", async () => {
    const fetch = vi.fn().mockResolvedValue(resposta([{ id: 1, categoria: "Compras" }, { id: 2, categoria: "Restaurantes e Lanches" }]));
    const r = await categorizarComGemini(itens(2), CATEGORIAS, { apiKey: "chave-falsa", fetch });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO_PADRAO}:generateContent`);
    expect(url).not.toContain("chave-falsa");
    expect(init.headers["x-goog-api-key"]).toBe("chave-falsa");
    const corpo = JSON.parse(init.body);
    expect(JSON.parse(corpo.contents[0].parts[0].text)).toEqual(itens(2));
    expect(corpo.generationConfig.responseSchema.items.properties.categoria.enum).toEqual(CATEGORIAS);
    expect(r).toEqual({ categorias: new Map([[1, "Compras"], [2, "Restaurantes e Lanches"]]), erro: null });
  });

  it("o modelo pode vir da configuração", async () => {
    const fetch = vi.fn().mockResolvedValue(resposta([]));
    await categorizarComGemini(itens(1), CATEGORIAS, { apiKey: "k", modelo: "gemini-x", fetch });
    expect(fetch.mock.calls[0][0]).toContain("/models/gemini-x:generateContent");
  });

  it("divide em lotes e descarta id de fora do pedido e categoria fora da lista", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(resposta([{ id: 1, categoria: "Compras" }, { id: 999, categoria: "Compras" }, { id: 2, categoria: "Inventada" }]))
      .mockResolvedValueOnce(resposta([{ id: POR_PEDIDO + 1, categoria: "Salário" }]))
      .mockResolvedValueOnce(resposta(["lixo", null]));
    const r = await categorizarComGemini(itens(POR_PEDIDO * 2 + 5), CATEGORIAS, { apiKey: "k", fetch });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(r.categorias).toEqual(new Map([[1, "Compras"], [POR_PEDIDO + 1, "Salário"]]));
  });

  it("erro do Gemini para os lotes seguintes, mas guarda o que já veio", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(resposta([{ id: 1, categoria: "Compras" }]))
      .mockResolvedValueOnce(new Response("not found", { status: 404 }));
    const r = await categorizarComGemini(itens(POR_PEDIDO * 3), CATEGORIAS, { apiKey: "k", fetch });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(r.categorias).toEqual(new Map([[1, "Compras"]]));
    expect(r.erro?.message).toBe("o serviço respondeu HTTP 404");
  });

  it("sem resposta (rede, tempo esgotado) vira erro sem detalhes", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("ECONNRESET chave-falsa"));
    const r = await categorizarComGemini(itens(1), CATEGORIAS, { apiKey: "chave-falsa", fetch });
    expect(r.erro?.message).toBe("o serviço não respondeu");
  });
});
