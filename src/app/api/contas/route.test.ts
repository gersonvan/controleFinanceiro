import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSessionUserId: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSessionUserId: mocks.getSessionUserId }));
vi.mock("@/lib/contas", () => ({ garantirContas: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { conta: { updateMany: mocks.updateMany, findMany: vi.fn(), findFirst: mocks.findFirst, create: mocks.create } } }));

import { PATCH, POST } from "./route";

const post = (body: unknown) => POST(new NextRequest("http://localhost/api/contas", {
  method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" },
}));

const patch = (body: unknown) => PATCH(new NextRequest("http://localhost/api/contas", {
  method: "PATCH", body: JSON.stringify(body), headers: { "content-type": "application/json" },
}));

describe("API de contas", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.getSessionUserId.mockResolvedValue("ana@example.com"); mocks.updateMany.mockResolvedValue({ count: 1 }); });

  it("muda o tipo só de conta do próprio usuário", async () => {
    expect((await patch({ id: 3, tipo: "cartao" })).status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: 3, userId: "ana@example.com" }, data: { tipo: "cartao" } });
  });

  it("rejeita tipo inválido e conta de outro usuário", async () => {
    expect((await patch({ id: 3, tipo: "poupanca" })).status).toBe(400);
    mocks.updateMany.mockResolvedValue({ count: 0 });
    expect((await patch({ id: 99, tipo: "corrente" })).status).toBe(404);
  });

  it("cria conta com o nome gerado por banco + tipo + apelido, no escopo do usuário", async () => {
    mocks.findFirst.mockResolvedValue(null);
    mocks.create.mockResolvedValue({ id: 7 });
    const r = await post({ banco: "nubank", tipo: "cartao", apelido: "final 1234" });
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ id: 7, nome: "Nubank · Crédito · final 1234" });
    expect(mocks.create).toHaveBeenCalledWith({ data: { userId: "ana@example.com", nome: "Nubank · Crédito · final 1234", banco: "nubank", tipo: "cartao", apelido: "final 1234" } });
  });

  it("recusa conta repetida, banco desconhecido e 'Outro' sem nome", async () => {
    mocks.findFirst.mockResolvedValue({ id: 1 });
    expect((await post({ banco: "nubank", tipo: "cartao" })).status).toBe(409);
    expect((await post({ banco: "banco-x", tipo: "cartao" })).status).toBe(400);
    expect((await post({ banco: "outro", tipo: "corrente", apelido: "" })).status).toBe(400);
  });
});
