import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUserId: vi.fn(),
  apelido: { findMany: vi.fn(), upsert: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  groupBy: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ getSessionUserId: mocks.getSessionUserId }));
vi.mock("@/lib/db", () => ({
  prisma: { apelido: mocks.apelido, lancamento: { groupBy: mocks.groupBy }, $transaction: mocks.transaction },
}));

import { DELETE, GET, PATCH, POST } from "./route";

const json = (method: string, body: unknown) => new NextRequest("http://localhost/api/apelidos", {
  method, body: JSON.stringify(body), headers: { "content-type": "application/json" },
});

describe("API de mesmo pagamento", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUserId.mockResolvedValue("ana@example.com");
    mocks.transaction.mockImplementation((ops: unknown[]) => Promise.all(ops));
    mocks.apelido.upsert.mockResolvedValue({});
  });

  it("junta as descrições pela chave limpa, no escopo do usuário", async () => {
    const r = await POST(json("POST", { nome: "Financiamento do carro", descricoes: [
      "Pagamento de Boleto - FINANCEIRA A CREDITO - Data balanc.: 01",
      "Pagamento de Boleto - FINANCEIRA A CREDITO",
      "Pagamento de Boleto - BANCO B SOCIEDADE DE CREDITO",
    ] }));
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ nome: "Financiamento do carro", chaves: 2 });
    expect(mocks.apelido.upsert).toHaveBeenCalledWith({
      where: { userId_chave: { userId: "ana@example.com", chave: "financeira a credito" } },
      create: { userId: "ana@example.com", chave: "financeira a credito", nome: "Financiamento do carro" },
      update: { nome: "Financiamento do carro" },
    });
    expect((await POST(json("POST", { nome: "x", descricoes: ["A"] }))).status).toBe(400);
  });

  it("lista os grupos com exemplo e quantidade de lançamentos de cada variação", async () => {
    mocks.apelido.findMany.mockResolvedValue([
      { nome: "Escola", chave: "escola ficticia infantil" },
      { nome: "Escola", chave: "pix enviado para escola ficticia" },
    ]);
    mocks.groupBy.mockResolvedValue([
      { descricao: "Pagamento de Boleto - ESCOLA FICTICIA INFANTIL", _count: { _all: 5 } },
      { descricao: "Pagamento de Boleto - ESCOLA FICTICIA INFANTIL LTDA - Data balanc", _count: { _all: 2 } },
    ]);
    const j = await (await GET()).json();
    expect(mocks.apelido.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "ana@example.com" } }));
    expect(j).toEqual([{ nome: "Escola", variacoes: [
      { chave: "escola ficticia infantil", exemplo: "Pagamento de Boleto - ESCOLA FICTICIA INFANTIL", lancamentos: 7 },
      { chave: "pix enviado para escola ficticia", exemplo: null, lancamentos: 0 },
    ] }]);
  });

  it("renomeia e desfaz só no escopo do usuário", async () => {
    mocks.apelido.updateMany.mockResolvedValue({ count: 2 });
    await PATCH(json("PATCH", { nome: "Escola", novoNome: "Escola das crianças" }));
    expect(mocks.apelido.updateMany).toHaveBeenCalledWith({ where: { userId: "ana@example.com", nome: "Escola" }, data: { nome: "Escola das crianças" } });
    mocks.apelido.deleteMany.mockResolvedValue({ count: 1 });
    await DELETE(new NextRequest("http://localhost/api/apelidos?chave=escola%20ficticia%20infantil", { method: "DELETE" }));
    expect(mocks.apelido.deleteMany).toHaveBeenCalledWith({ where: { userId: "ana@example.com", chave: "escola ficticia infantil" } });
    expect((await DELETE(new NextRequest("http://localhost/api/apelidos", { method: "DELETE" }))).status).toBe(400);
    mocks.getSessionUserId.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });
});
