import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUserId: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  deleteMany: vi.fn(),
  createMany: vi.fn(),
  upsert: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSessionUserId: mocks.getSessionUserId }));
vi.mock("@/lib/db", () => ({
  prisma: {
    userProfile: { findUnique: mocks.findUnique, upsert: mocks.upsert },
    planejamentoItem: { findMany: mocks.findMany, deleteMany: mocks.deleteMany, createMany: mocks.createMany },
    $transaction: mocks.transaction,
  },
}));

import { GET, PUT } from "./route";

const put = (body: unknown) =>
  new NextRequest("http://localhost/api/planejamento", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

const fixo = { grupo: "fixo", descricao: "Energia", categoria: "Contas de Consumo", valor: 300, periodicidade: "mensal" };

describe("API de planejamento", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUserId.mockResolvedValue("ana@example.com");
    mocks.findUnique.mockResolvedValue({ margemPercentual: 20, fotografiaConcluidaEm: null });
    mocks.findMany.mockResolvedValue([]);
    mocks.transaction.mockResolvedValue([]);
    // Os args de createMany/deleteMany são montados antes da transação; basta capturá-los.
    mocks.deleteMany.mockReturnValue("del");
    mocks.createMany.mockReturnValue("create");
    mocks.upsert.mockReturnValue("upsert");
  });

  it("exige sessão", async () => {
    mocks.getSessionUserId.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await PUT(put({ itens: [] }))).status).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("lê itens do tenant e devolve totais", async () => {
    mocks.findMany.mockResolvedValue([{ ...fixo, id: 1, userId: "ana@example.com", ordem: 0 }]);
    const json = await (await GET()).json();

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "ana@example.com" } }));
    expect(json.totais.fixos).toBe(300);
    expect(json.margemPercentual).toBe(20);
  });

  it("substitui o conjunto inteiro dentro do tenant e marca conclusão", async () => {
    const res = await PUT(put({
      itens: [{ ...fixo, userId: "outra@example.com" }, { grupo: "parcela", descricao: "Sofá", categoria: "Casa: Manutenção e Móveis", valor: 200, parcelaAtual: 3, parcelaTotal: 10 }],
      margemPercentual: 15,
      concluir: true,
    }));

    expect(res.status).toBe(200);
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { userId: "ana@example.com" } });
    const { data } = mocks.createMany.mock.calls[0][0];
    expect(data).toHaveLength(2);
    expect(data.every((d: { userId: string }) => d.userId === "ana@example.com")).toBe(true);
    expect(data[1]).toMatchObject({ ordem: 1, parcelaAtual: 3, parcelaTotal: 10 });
    const upsertArgs = mocks.upsert.mock.calls[0][0];
    expect(upsertArgs.where).toEqual({ userId: "ana@example.com" });
    expect(upsertArgs.update.margemPercentual).toBe(15);
    expect(upsertArgs.update.fotografiaConcluidaEm).toBeInstanceOf(Date);
    expect(mocks.transaction).toHaveBeenCalledWith(["del", "create", "upsert"]);
  });

  it("não marca conclusão quando concluir é false", async () => {
    await PUT(put({ itens: [fixo], margemPercentual: 20 }));
    expect(mocks.upsert.mock.calls[0][0].update).toEqual({ margemPercentual: 20 });
  });

  it("rejeita categoria fora da lista, parcela inconsistente e periodicidade incoerente", async () => {
    const casos = [
      [{ ...fixo, categoria: "Inventada" }],
      [{ grupo: "parcela", descricao: "x", categoria: "Compras", valor: 10, parcelaAtual: 5, parcelaTotal: 3 }],
      [{ grupo: "parcela", descricao: "x", categoria: "Compras", valor: 10 }],
      [{ ...fixo, grupo: "sazonal", periodicidade: "mensal" }],
      [{ ...fixo, valor: -1 }],
    ];
    for (const itens of casos) {
      const res = await PUT(put({ itens }));
      expect(res.status, JSON.stringify(itens)).toBe(400);
    }
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
