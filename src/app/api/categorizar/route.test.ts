import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUserId: vi.fn(),
  memoriaFindMany: vi.fn(),
  lancamentoFindMany: vi.fn(),
  updateMany: vi.fn(),
  transaction: vi.fn(),
  mapearCategoria: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSessionUserId: mocks.getSessionUserId }));
vi.mock("@/lib/categorias", () => ({
  CATEGORIAS: ["Compras"],
  mapearCategoria: mocks.mapearCategoria,
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    memoriaIA: { findMany: mocks.memoriaFindMany },
    lancamento: { findMany: mocks.lancamentoFindMany, updateMany: mocks.updateMany },
    $transaction: mocks.transaction,
  },
}));

import { POST } from "./route";

describe("API de categorização: isolamento de tenant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUserId.mockResolvedValue("ana@example.com");
    mocks.memoriaFindMany.mockResolvedValue([]);
    mocks.lancamentoFindMany.mockResolvedValue([
      { id: 9, descricao: "LOJA", tipo: "Saída", categoria: null },
    ]);
    mocks.mapearCategoria.mockReturnValue("Compras");
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation((operacoes: Promise<unknown>[]) => Promise.all(operacoes));
  });

  it("mantém userId em toda atualização resultante da categorização", async () => {
    const response = await POST(new NextRequest("http://localhost/api/categorizar", {
      method: "POST",
      body: JSON.stringify({ usarGemini: false }),
      headers: { "content-type": "application/json" },
    }));

    expect(response.status).toBe(200);
    expect(mocks.lancamentoFindMany).toHaveBeenCalledWith({
      where: { userId: "ana@example.com", categoria: null },
    });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { userId: "ana@example.com", id: 9 },
      data: { categoria: "Compras" },
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
});
