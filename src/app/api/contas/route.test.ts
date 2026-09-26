import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSessionUserId: vi.fn(), updateMany: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSessionUserId: mocks.getSessionUserId }));
vi.mock("@/lib/contas", () => ({ garantirContas: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { conta: { updateMany: mocks.updateMany, findMany: vi.fn() } } }));

import { PATCH } from "./route";

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
});
