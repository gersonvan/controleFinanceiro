import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  cookie: vi.fn(),
  metodo: vi.fn(),
  findUnique: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (n === "espaco" ? mocks.cookie() : undefined) }),
  headers: async () => ({ get: (n: string) => (n === "x-metodo" ? mocks.metodo() : null) }),
}));
vi.mock("./db", () => ({ prisma: { acesso: { findUnique: mocks.findUnique } } }));

import { contextoDaSessao, podeNaRequisicao } from "./espaco";
import { getSessionUserId, getUsuarioLogado } from "./session";

const BRUNO = "bruno@example.com", ANA = "ana@example.com";

describe("finanças compartilhadas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { email: BRUNO } });
    mocks.cookie.mockReturnValue(undefined);
    mocks.metodo.mockReturnValue("GET");
    mocks.findUnique.mockResolvedValue(null);
  });

  it("sem escolha, cada um nas próprias finanças", async () => {
    expect(await contextoDaSessao()).toEqual({ usuario: BRUNO, dono: BRUNO, papel: "dono" });
    expect(await getSessionUserId()).toBe(BRUNO);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("finanças compartilhadas: o dono vira o tenant, conferido no banco", async () => {
    mocks.cookie.mockReturnValue({ value: ANA });
    mocks.findUnique.mockResolvedValue({ papel: "ajudar" });
    expect(await contextoDaSessao()).toEqual({ usuario: BRUNO, dono: ANA, papel: "ajudar" });
    expect(mocks.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { donoUserId_membroEmail: { donoUserId: ANA, membroEmail: BRUNO } },
    }));
    mocks.metodo.mockReturnValue("POST");
    expect(await getSessionUserId()).toBe(ANA); // ajudar altera
    expect(await getUsuarioLogado()).toBe(BRUNO);
  });

  it("cookie forjado ou acesso retirado: volta às próprias finanças", async () => {
    mocks.cookie.mockReturnValue({ value: ANA });
    mocks.findUnique.mockResolvedValue(null);
    expect(await getSessionUserId()).toBe(BRUNO);
  });

  it("só ver: lê, mas não altera (sem método, na dúvida, não altera)", async () => {
    mocks.cookie.mockReturnValue({ value: ANA });
    mocks.findUnique.mockResolvedValue({ papel: "ver" });
    expect(await getSessionUserId()).toBe(ANA);
    for (const m of ["POST", "PUT", "PATCH", "DELETE", null]) {
      mocks.metodo.mockReturnValue(m);
      expect(await getSessionUserId(), String(m)).toBeNull();
    }
    expect(podeNaRequisicao("ver", "head")).toBe(true);
    expect(podeNaRequisicao("dono", null)).toBe(true);
  });

  it("papel estranho no banco vira só ver; sem sessão, nada", async () => {
    mocks.cookie.mockReturnValue({ value: ANA });
    mocks.findUnique.mockResolvedValue({ papel: "admin" });
    expect((await contextoDaSessao())?.papel).toBe("ver");
    mocks.auth.mockResolvedValue(null);
    expect(await getSessionUserId()).toBeNull();
  });
});
