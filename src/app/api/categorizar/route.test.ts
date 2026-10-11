import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUserId: vi.fn(),
  memoriaFindMany: vi.fn(),
  lancamentoFindMany: vi.fn(),
  groupBy: vi.fn(),
  updateMany: vi.fn(),
  transaction: vi.fn(),
  perfilFindUnique: vi.fn(),
  parse: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSessionUserId: mocks.getSessionUserId }));
// o cliente da Anthropic é trocado por um falso: nenhum teste chama a API de verdade
vi.mock("@/lib/categorizacao-inteligente", async (original) => ({
  ...(await original<typeof import("@/lib/categorizacao-inteligente")>()),
  criarCliente: () => ({ messages: { parse: mocks.parse } }),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    memoriaIA: { findMany: mocks.memoriaFindMany },
    userProfile: { findUnique: mocks.perfilFindUnique },
    apelido: { findMany: async () => [] },
    lancamento: { findMany: mocks.lancamentoFindMany, groupBy: mocks.groupBy, updateMany: mocks.updateMany },
    $transaction: mocks.transaction,
  },
}));

import { GET, POST, PUT } from "./route";

const req = (method: string, body: unknown) => new NextRequest("http://localhost/api/categorizar", {
  method, body: JSON.stringify(body), headers: { "content-type": "application/json" },
});
const categorizar = (inteligente = false) => POST(req("POST", { inteligente }));

describe("API de categorização", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUserId.mockResolvedValue("ana@example.com");
    mocks.memoriaFindMany.mockResolvedValue([]);
    mocks.perfilFindUnique.mockResolvedValue({ nomeCompleto: "" });
    mocks.groupBy.mockResolvedValue([]);
    mocks.lancamentoFindMany.mockResolvedValue([
      { id: 9, descricao: "LOJA DE ROUPAS TEMU", tipo: "Saída", categoria: null },
    ]);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation((operacoes: Promise<unknown>[]) => Promise.all(operacoes));
  });

  it("mantém userId em toda leitura e atualização", async () => {
    expect((await categorizar()).status).toBe(200);
    expect(mocks.lancamentoFindMany).toHaveBeenCalledWith({ where: { userId: "ana@example.com", categoria: null } });
    expect(mocks.memoriaFindMany).toHaveBeenCalledWith({ where: { userId: "ana@example.com" } });
    expect(mocks.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "ana@example.com", categoria: { not: null } },
    }));
    // só onde ainda está sem categoria
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { userId: "ana@example.com", id: 9, categoria: null },
      data: { categoria: "Compras" },
    });
  });

  it("usa o histórico do usuário antes das regras, mas delivery vence o histórico", async () => {
    mocks.lancamentoFindMany.mockResolvedValue([
      { id: 1, descricao: "GRAN EDUCACAO (6/12)", tipo: "Saída", categoria: null },
      { id: 2, descricao: "NAY MIX DELIVERY", tipo: "Saída", categoria: null },
      { id: 3, descricao: "POP 13AGO 17H41MIN", tipo: "Saída", categoria: null },
    ]);
    mocks.groupBy.mockResolvedValue([
      { descricao: "GRAN EDUCACAO (1/12)", tipo: "Saída", categoria: "Mensalidades e Cursos", _count: { _all: 3 } },
      { descricao: "NAY MIX DELIVERY", tipo: "Saída", categoria: "Restaurantes e Lanches", _count: { _all: 2 } },
    ]);
    const json = await (await categorizar()).json();
    expect(json).toMatchObject({ total: 3, porHistorico: 1, porRegras: 2, semCategoria: 0 });
    const gravado = Object.fromEntries(mocks.updateMany.mock.calls.map(([a]) => [a.where.id, a.data.categoria]));
    expect(gravado).toEqual({ 1: "Mensalidades e Cursos", 2: "Delivery e iFood", 3: "Transporte por App" });
  });

  describe("categorização inteligente", () => {
    // descrição que nem Memória, nem histórico, nem regras resolvem
    const semPista = { id: 4, descricao: "XPTO 123", tipo: "Saída", categoria: null, data: new Date("2026-10-02T00:00:00Z"), valor: -50, conta: "Nubank · Crédito" };
    afterEach(() => vi.unstubAllEnvs());

    it("o botão só aparece com chave no servidor", async () => {
      vi.stubEnv("ANTHROPIC_API_KEY", "");
      expect(await (await GET()).json()).toEqual({ inteligente: false });
      vi.stubEnv("ANTHROPIC_API_KEY", "chave-falsa");
      expect(await (await GET()).json()).toEqual({ inteligente: true });
      mocks.getSessionUserId.mockResolvedValue(null);
      expect((await GET()).status).toBe(401);
    });

    it("sem chave avisa em vez de falhar calado", async () => {
      vi.stubEnv("ANTHROPIC_API_KEY", "");
      mocks.lancamentoFindMany.mockResolvedValue([semPista]);
      expect(await (await categorizar(true)).json()).toMatchObject({ semCategoria: 1, inteligente: "sem-chave" });
      expect(mocks.parse).not.toHaveBeenCalled();
    });

    it("só sugere: devolve para revisão e não grava nada", async () => {
      vi.stubEnv("ANTHROPIC_API_KEY", "chave-falsa");
      mocks.parse.mockResolvedValue({ stop_reason: "end_turn", parsed_output: { sugestoes: [{ id: 4, categoria: "Compras", certeza: "media" }] } });
      mocks.lancamentoFindMany.mockResolvedValue([semPista]);
      const json = await (await categorizar(true)).json();
      expect(json).toMatchObject({ inteligente: "ok", semCategoria: 1 });
      expect(json.sugestoes).toEqual([{
        id: 4, categoria: "Compras", certeza: "media", descricao: "XPTO 123",
        data: "2026-10-02T00:00:00.000Z", valor: -50, conta: "Nubank · Crédito",
      }]);
      expect(mocks.updateMany).not.toHaveBeenCalled();
    });

    it("erro do serviço volta para a tela", async () => {
      vi.stubEnv("ANTHROPIC_API_KEY", "chave-falsa");
      mocks.parse.mockRejectedValue(new Error("rede"));
      mocks.lancamentoFindMany.mockResolvedValue([semPista]);
      const res = await categorizar(true);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ inteligente: "erro", inteligenteErro: "o serviço não respondeu", sugestoes: [] });
    });

    it("aplicar grava só o confirmado, no próprio usuário e onde ainda está sem categoria", async () => {
      const res = await PUT(req("PUT", { itens: [{ id: 4, categoria: "Farmácia" }, { id: 5, categoria: "Compras" }], userId: "bruno@example.com" }));
      expect(await res.json()).toEqual({ aplicados: 2 });
      expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: 4, categoria: null, userId: "ana@example.com" }, data: { categoria: "Farmácia" } });
      expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: 5, categoria: null, userId: "ana@example.com" }, data: { categoria: "Compras" } });
    });

    it("aplicar recusa categoria inventada, lista vazia e quem não entrou", async () => {
      for (const corpo of [{ itens: [{ id: 4, categoria: "Inventada" }] }, { itens: [] }, {}, { itens: [{ id: -1, categoria: "Compras" }] }])
        expect((await PUT(req("PUT", corpo))).status, JSON.stringify(corpo)).toBe(400);
      mocks.getSessionUserId.mockResolvedValue(null);
      expect((await PUT(req("PUT", { itens: [{ id: 4, categoria: "Compras" }] }))).status).toBe(401);
      expect(mocks.updateMany).not.toHaveBeenCalled();
    });
  });
});
