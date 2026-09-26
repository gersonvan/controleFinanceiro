import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSessionUserId: vi.fn(), aplicarPadroes: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSessionUserId: mocks.getSessionUserId }));
vi.mock("@/lib/reembolso-dados", () => ({ aplicarPadroes: mocks.aplicarPadroes }));

import { POST } from "./route";

const aplicar = (body: unknown) => POST(new NextRequest("http://localhost/api/reembolsos/aplicar", {
  method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" },
}));

describe("aplicar padrões de reembolso", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.getSessionUserId.mockResolvedValue("ana@example.com"); mocks.aplicarPadroes.mockResolvedValue(3); });

  it("aplica só para o usuário da sessão e recalcula os pares no servidor", async () => {
    const r = await aplicar({ entradaIds: [1, 2, 3], pares: [{ entradaId: 1, saidaId: 999 }] });
    expect(await r.json()).toEqual({ vinculados: 3 });
    expect(mocks.aplicarPadroes).toHaveBeenCalledWith("ana@example.com", [1, 2, 3]);
  });

  it("exige sessão e ids válidos", async () => {
    expect((await aplicar({ entradaIds: [] })).status).toBe(400);
    mocks.getSessionUserId.mockResolvedValue(null);
    expect((await aplicar({ entradaIds: [1] })).status).toBe(401);
    expect(mocks.aplicarPadroes).not.toHaveBeenCalled();
  });
});
