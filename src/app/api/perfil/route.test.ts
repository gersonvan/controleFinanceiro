import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUserId: vi.fn(),
  userProfile: { findUnique: vi.fn(), upsert: vi.fn() },
}));
vi.mock("@/lib/session", () => ({ getSessionUserId: mocks.getSessionUserId }));
vi.mock("@/lib/db", () => ({ prisma: { userProfile: mocks.userProfile } }));

import { GET, PATCH } from "./route";

const patch = (body: unknown) => new NextRequest("http://localhost/api/perfil", {
  method: "PATCH", body: JSON.stringify(body), headers: { "content-type": "application/json" },
});

describe("API de perfil (nome nos extratos)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUserId.mockResolvedValue("ana@example.com");
  });

  it("lê e grava só o perfil do usuário da sessão", async () => {
    mocks.userProfile.findUnique.mockResolvedValue({ nomeCompleto: "Ana Maria Souza" });
    expect(await (await GET()).json()).toEqual({ nomeCompleto: "Ana Maria Souza" });
    expect(mocks.userProfile.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "ana@example.com" } }));

    await PATCH(patch({ nomeCompleto: "  Ana Maria de Souza  " }));
    expect(mocks.userProfile.upsert).toHaveBeenCalledWith({
      where: { userId: "ana@example.com" },
      create: { userId: "ana@example.com", nomeCompleto: "Ana Maria de Souza" },
      update: { nomeCompleto: "Ana Maria de Souza" },
    });
  });

  it("recusa sem sessão e nome grande demais", async () => {
    expect((await PATCH(patch({ nomeCompleto: "x".repeat(121) }))).status).toBe(400);
    mocks.getSessionUserId.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });
});
