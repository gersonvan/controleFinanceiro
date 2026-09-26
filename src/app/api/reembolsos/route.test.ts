import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUserId: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  tx: {
    reembolso: { findMany: vi.fn(), deleteMany: vi.fn(), groupBy: vi.fn(), createMany: vi.fn() },
    lancamento: { updateMany: vi.fn() },
  },
}));

vi.mock("@/lib/session", () => ({ getSessionUserId: mocks.getSessionUserId }));
vi.mock("@/lib/db", () => ({
  prisma: {
    lancamento: { findFirst: mocks.findFirst, findMany: mocks.findMany },
    $transaction: (fn: (tx: unknown) => unknown) => fn(mocks.tx),
  },
}));

import { PUT } from "./route";

const dividir = (body: unknown) => PUT(new NextRequest("http://localhost/api/reembolsos", {
  method: "PUT", body: JSON.stringify(body), headers: { "content-type": "application/json" },
}));

describe("API de reembolsos (Dividir)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUserId.mockResolvedValue("ana@example.com");
    mocks.findFirst.mockResolvedValue({ id: 10, valor: 76.25, categoria: "Transferência Recebida" });
    mocks.findMany.mockResolvedValue([{ id: 20, valor: -334.99 }]);
    mocks.tx.reembolso.findMany.mockResolvedValue([]);
    mocks.tx.reembolso.groupBy.mockResolvedValue([]);
  });

  it("vincula o Pix ao gasto, marca Reembolso e recalcula o gasto — tudo no escopo do usuário", async () => {
    mocks.tx.reembolso.groupBy
      .mockResolvedValueOnce([]) // já reembolsado por outros
      .mockResolvedValueOnce([{ saidaId: 20, _sum: { valor: 76.25 } }]); // recálculo
    const r = await dividir({ entradaId: 10, saidaIds: [20] });
    expect(r.status).toBe(200);
    expect(mocks.findFirst).toHaveBeenCalledWith({ where: { userId: "ana@example.com", id: 10 } });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "ana@example.com", id: { in: [20] }, valor: { lt: 0 } },
    }));
    expect(mocks.tx.reembolso.createMany).toHaveBeenCalledWith({
      data: [{ userId: "ana@example.com", entradaId: 10, saidaId: 20, valor: 76.25 }],
    });
    expect(mocks.tx.lancamento.updateMany).toHaveBeenCalledWith({
      where: { userId: "ana@example.com", id: 10 }, data: { categoria: "Reembolso" },
    });
    expect(mocks.tx.lancamento.updateMany).toHaveBeenCalledWith({
      where: { userId: "ana@example.com", id: 20 }, data: { valorReembolsado: 76.25 },
    });
  });

  it("rejeita Pix de outro usuário, saída como Pix e gasto que não é do usuário", async () => {
    mocks.findFirst.mockResolvedValueOnce(null);
    expect((await dividir({ entradaId: 10, saidaIds: [20] })).status).toBe(404);
    mocks.findFirst.mockResolvedValueOnce({ id: 10, valor: -5, categoria: null });
    expect((await dividir({ entradaId: 10, saidaIds: [20] })).status).toBe(400);
    mocks.findMany.mockResolvedValueOnce([]);
    expect((await dividir({ entradaId: 10, saidaIds: [99] })).status).toBe(400);
    expect(mocks.tx.reembolso.createMany).not.toHaveBeenCalled();
  });

  it("desfazer: remove vínculos, tira o Reembolso e devolve o gasto ao valor cheio", async () => {
    mocks.findFirst.mockResolvedValue({ id: 10, valor: 76.25, categoria: "Reembolso" });
    mocks.findMany.mockResolvedValue([]);
    mocks.tx.reembolso.findMany.mockResolvedValue([{ saidaId: 20 }]);
    const r = await dividir({ entradaId: 10, saidaIds: [] });
    expect(r.status).toBe(200);
    expect(mocks.tx.reembolso.deleteMany).toHaveBeenCalledWith({ where: { userId: "ana@example.com", entradaId: 10 } });
    expect(mocks.tx.lancamento.updateMany).toHaveBeenCalledWith({ where: { userId: "ana@example.com", id: 10 }, data: { categoria: null } });
    expect(mocks.tx.lancamento.updateMany).toHaveBeenCalledWith({ where: { userId: "ana@example.com", id: 20 }, data: { valorReembolsado: 0 } });
  });
});
