import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUserId: vi.fn(),
  memoriaFindMany: vi.fn(),
  lancamentoFindMany: vi.fn(),
  groupBy: vi.fn(),
  updateMany: vi.fn(),
  transaction: vi.fn(),
  perfilFindUnique: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSessionUserId: mocks.getSessionUserId }));
vi.mock("@/lib/db", () => ({
  prisma: {
    memoriaIA: { findMany: mocks.memoriaFindMany },
    userProfile: { findUnique: mocks.perfilFindUnique },
    lancamento: { findMany: mocks.lancamentoFindMany, groupBy: mocks.groupBy, updateMany: mocks.updateMany },
    $transaction: mocks.transaction,
  },
}));

import { POST } from "./route";

const categorizar = () => POST(new NextRequest("http://localhost/api/categorizar", {
  method: "POST",
  body: JSON.stringify({ usarGemini: false }),
  headers: { "content-type": "application/json" },
}));

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
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { userId: "ana@example.com", id: 9 },
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
});
