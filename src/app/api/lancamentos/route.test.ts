import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUserId: vi.fn(),
  count: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  deleteMany: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSessionUserId: mocks.getSessionUserId }));
vi.mock("@/lib/db", () => ({
  prisma: { lancamento: {
    count: mocks.count,
    findMany: mocks.findMany,
    create: mocks.create,
    deleteMany: mocks.deleteMany,
    updateMany: mocks.updateMany,
  } },
}));

import { DELETE, GET, PATCH, POST } from "./route";

describe("API de lançamentos: isolamento de tenant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUserId.mockResolvedValue("ana@example.com");
  });

  it("não consulta o banco quando não há sessão", async () => {
    mocks.getSessionUserId.mockResolvedValue(null);

    const response = await GET(new NextRequest("http://localhost/api/lancamentos"));

    expect(response.status).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("aplica userId na listagem, contagem e exclusão", async () => {
    mocks.count.mockResolvedValue(1);
    mocks.findMany.mockResolvedValue([]);
    mocks.deleteMany.mockResolvedValue({ count: 1 });

    await GET(new NextRequest("http://localhost/api/lancamentos?categoria=Moradia"));
    await DELETE(new NextRequest("http://localhost/api/lancamentos?id=42", { method: "DELETE" }));

    expect(mocks.count).toHaveBeenCalledWith({
      where: { userId: "ana@example.com", categoria: "Moradia" },
    });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "ana@example.com", categoria: "Moradia" },
    }));
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { userId: "ana@example.com", id: 42 },
    });
  });

  it("atribui a criação ao usuário autenticado", async () => {
    mocks.create.mockResolvedValue({ id: 1 });
    const request = new NextRequest("http://localhost/api/lancamentos", {
      method: "POST",
      body: JSON.stringify({ descricao: "Mercado", valor: -50 }),
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith({
      data: { descricao: "Mercado", valor: -50, userId: "ana@example.com" },
    });
  });

  it("não permite que PATCH mova o lançamento para outro usuário", async () => {
    const request = new NextRequest("http://localhost/api/lancamentos", {
      method: "PATCH",
      body: JSON.stringify({ id: 42, categoria: "Moradia", userId: "ana@example.com" }),
      headers: { "content-type": "application/json" },
    });
    mocks.updateMany.mockResolvedValue({ count: 1 });

    await PATCH(request);

    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: 42, userId: "ana@example.com" },
      data: { categoria: "Moradia" },
    });
  });
});
