import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUserId: vi.fn(),
  count: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  deleteMany: vi.fn(),
  updateMany: vi.fn(),
  reembolsoFindMany: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSessionUserId: mocks.getSessionUserId }));
vi.mock("@/lib/db", () => {
  const prisma = {
    lancamento: {
      count: mocks.count,
      findMany: mocks.findMany,
      create: mocks.create,
      deleteMany: mocks.deleteMany,
      updateMany: mocks.updateMany,
    },
    reembolso: { findMany: mocks.reembolsoFindMany, groupBy: vi.fn().mockResolvedValue([]) },
    $transaction: (fn: (tx: unknown) => unknown) => fn(prisma),
  };
  return { prisma };
});

import { DELETE, GET, PATCH, POST, PUT } from "./route";

const json = (method: string, body: unknown) =>
  new NextRequest("http://localhost/api/lancamentos", {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

const lancamentoValido = {
  data: "2026-09-01",
  descricao: "Mercado",
  valor: -50,
  tipo: "Saída",
  conta: "Nubank Conta",
};

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
    mocks.reembolsoFindMany.mockResolvedValue([]);

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
    expect(mocks.reembolsoFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "ana@example.com", entradaId: 42 },
    }));
  });

  it("atribui a criação ao usuário autenticado", async () => {
    mocks.create.mockResolvedValue({ id: 1 });

    const response = await POST(json("POST", lancamentoValido));

    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        ...lancamentoValido,
        data: new Date("2026-09-01"),
        userId: "ana@example.com",
      },
    });
  });

  it("não permite que PATCH mova o lançamento para outro usuário", async () => {
    const request = new NextRequest("http://localhost/api/lancamentos", {
      method: "PATCH",
      body: JSON.stringify({ id: 42, categoria: "Aluguel", userId: "ana@example.com" }),
      headers: { "content-type": "application/json" },
    });
    mocks.updateMany.mockResolvedValue({ count: 1 });

    await PATCH(request);

    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: 42, userId: "ana@example.com" },
      data: { categoria: "Aluguel" },
    });
  });
});

describe("API de lançamentos: validação de entrada", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUserId.mockResolvedValue("ana@example.com");
  });

  it("descarta campos que o cliente não pode definir (id, createdAt, userId)", async () => {
    mocks.create.mockResolvedValue({ id: 1 });

    await POST(json("POST", {
      ...lancamentoValido,
      id: 999,
      createdAt: "2020-01-01",
      userId: "outra@example.com",
    }));

    const { data } = mocks.create.mock.calls[0][0];
    expect(data).not.toHaveProperty("id");
    expect(data).not.toHaveProperty("createdAt");
    expect(data.userId).toBe("ana@example.com");
  });

  it("rejeita corpo com tipos errados sem tocar no banco", async () => {
    const response = await POST(json("POST", { ...lancamentoValido, valor: "cinquenta" }));

    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejeita categoria fora da lista", async () => {
    const response = await PATCH(json("PATCH", { id: 1, categoria: "Inventada" }));

    expect(response.status).toBe(400);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("rejeita id não numérico na exclusão", async () => {
    const response = await DELETE(
      new NextRequest("http://localhost/api/lancamentos?id=abc", { method: "DELETE" })
    );

    expect(response.status).toBe(400);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it("não recategoriza em lote sem nenhum critério", async () => {
    const response = await PUT(json("PUT", { categoriaCorreta: "Compras" }));

    expect(response.status).toBe(400);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("limita a paginação e ignora datas inválidas", async () => {
    mocks.count.mockResolvedValue(0);
    mocks.findMany.mockResolvedValue([]);

    const invalida = await GET(new NextRequest("http://localhost/api/lancamentos?dataInicio=ontem"));
    expect(invalida.status).toBe(400);

    const grande = await GET(new NextRequest("http://localhost/api/lancamentos?limit=99999"));
    expect(grande.status).toBe(400);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});

describe("recategorização por descrição exata (Revisar categorias)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUserId.mockResolvedValue("ana@example.com");
    mocks.updateMany.mockResolvedValue({ count: 3 });
  });

  it("atinge só o grupo sem categoria daquela descrição", async () => {
    const res = await PUT(json("PUT", {
      descricaoExata: "Pix enviado para RESERVE IMOBILIARIA", somenteSemCategoria: true, categoriaCorreta: "Aluguel",
    }));
    expect(res.status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { userId: "ana@example.com", descricao: "Pix enviado para RESERVE IMOBILIARIA", categoria: null },
      data: { categoria: "Aluguel" },
    });
  });
});
