import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUserId: vi.fn(),
  conta: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  lancamento: { updateMany: vi.fn(), count: vi.fn() },
  reserva: { updateMany: vi.fn(), count: vi.fn() },
  perfilImportacao: { updateMany: vi.fn() },
  transaction: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ getSessionUserId: mocks.getSessionUserId }));
vi.mock("@/lib/contas", () => ({ garantirContas: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {
  conta: mocks.conta, lancamento: mocks.lancamento, reserva: mocks.reserva, perfilImportacao: mocks.perfilImportacao,
  $transaction: mocks.transaction,
} }));

import { DELETE, PATCH, POST } from "./route";

const req = (method: string, body?: unknown, query = "") => new NextRequest(`http://localhost/api/contas${query}`, {
  method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json" },
});
const NUBANK = { id: 3, userId: "ana@example.com", nome: "Nubank · Crédito", banco: "nubank", tipo: "cartao", apelido: "" };

describe("API de contas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUserId.mockResolvedValue("ana@example.com");
    mocks.transaction.mockImplementation((ops: unknown[]) => Promise.all(ops));
  });

  it("cria conta com o nome gerado por banco + tipo + apelido, no escopo do usuário", async () => {
    mocks.conta.findFirst.mockResolvedValue(null);
    mocks.conta.create.mockResolvedValue({ id: 7 });
    const r = await POST(req("POST", { banco: "nubank", tipo: "cartao", apelido: "final 1234" }));
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ id: 7, nome: "Nubank · Crédito · final 1234" });
    expect(mocks.conta.create).toHaveBeenCalledWith({ data: { userId: "ana@example.com", nome: "Nubank · Crédito · final 1234", banco: "nubank", tipo: "cartao", apelido: "final 1234" } });
  });

  it("recusa conta repetida, banco desconhecido e 'Outro' sem nome", async () => {
    mocks.conta.findFirst.mockResolvedValue({ id: 1 });
    expect((await POST(req("POST", { banco: "nubank", tipo: "cartao" }))).status).toBe(409);
    expect((await POST(req("POST", { banco: "banco-x", tipo: "cartao" }))).status).toBe(400);
    expect((await POST(req("POST", { banco: "outro", tipo: "corrente", apelido: "" }))).status).toBe(400);
  });

  it("apelido novo renomeia a conta e leva junto lançamentos, reservas e perfis", async () => {
    mocks.conta.findFirst.mockResolvedValueOnce(NUBANK).mockResolvedValueOnce(null);
    const r = await PATCH(req("PATCH", { id: 3, apelido: "Roxinho" }));
    expect(await r.json()).toEqual({ id: 3, nome: "Nubank · Crédito · Roxinho" });
    const de = { userId: "ana@example.com", conta: "Nubank · Crédito" };
    expect(mocks.lancamento.updateMany).toHaveBeenCalledWith({ where: de, data: { conta: "Nubank · Crédito · Roxinho" } });
    expect(mocks.reserva.updateMany).toHaveBeenCalledWith({ where: de, data: { conta: "Nubank · Crédito · Roxinho" } });
    expect(mocks.perfilImportacao.updateMany).toHaveBeenCalledWith({ where: de, data: { conta: "Nubank · Crédito · Roxinho" } });
    expect(mocks.conta.updateMany).toHaveBeenCalledWith({ where: { userId: "ana@example.com", id: 3 }, data: { banco: "nubank", tipo: "cartao", apelido: "Roxinho", nome: "Nubank · Crédito · Roxinho" } });
  });

  it("não renomeia para um nome que já existe nem mexe em conta de outro usuário", async () => {
    mocks.conta.findFirst.mockResolvedValueOnce(NUBANK).mockResolvedValueOnce({ id: 9 });
    expect((await PATCH(req("PATCH", { id: 3, tipo: "corrente" }))).status).toBe(409);
    expect(mocks.transaction).not.toHaveBeenCalled();
    mocks.conta.findFirst.mockResolvedValue(null);
    expect((await PATCH(req("PATCH", { id: 99, apelido: "x" }))).status).toBe(404);
    expect(mocks.conta.findFirst).toHaveBeenLastCalledWith({ where: { userId: "ana@example.com", id: 99 } });
  });

  it("exclui só conta vazia", async () => {
    mocks.conta.findFirst.mockResolvedValue(NUBANK);
    mocks.lancamento.count.mockResolvedValue(5);
    mocks.reserva.count.mockResolvedValue(0);
    expect((await DELETE(req("DELETE", undefined, "?id=3"))).status).toBe(409);
    expect(mocks.conta.deleteMany).not.toHaveBeenCalled();
    mocks.lancamento.count.mockResolvedValue(0);
    expect((await DELETE(req("DELETE", undefined, "?id=3"))).status).toBe(200);
    expect(mocks.conta.deleteMany).toHaveBeenCalledWith({ where: { userId: "ana@example.com", id: 3 } });
  });
});
