import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUserId: vi.fn(),
  findUnique: vi.fn(), upsert: vi.fn(),
  lancamentoFindMany: vi.fn(), planejamentoFindMany: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ getSessionUserId: mocks.getSessionUserId }));
vi.mock("@/lib/db", () => ({ prisma: {
  userProfile: { findUnique: mocks.findUnique, upsert: mocks.upsert },
  lancamento: { findMany: mocks.lancamentoFindMany },
  planejamentoItem: { findMany: mocks.planejamentoFindMany },
} }));

import { GET, PATCH } from "./route";

const patch = (body: unknown) => PATCH(new NextRequest("http://localhost/api/previsao", {
  method: "PATCH", body: JSON.stringify(body), headers: { "content-type": "application/json" },
}));

describe("API de previsão", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUserId.mockResolvedValue("ana@example.com");
    mocks.findUnique.mockResolvedValue({ previsaoEncerradas: ["Viagem"] });
    mocks.lancamentoFindMany.mockResolvedValue([]);
    mocks.planejamentoFindMany.mockResolvedValue([]);
  });

  it("lê só dados do usuário e, sem fotografia, responde com a base histórico", async () => {
    const j = await (await GET(new NextRequest("http://localhost/api/previsao?base=fotografia"))).json();
    expect(mocks.lancamentoFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: "ana@example.com" }) }));
    expect(mocks.planejamentoFindMany).toHaveBeenCalledWith({ where: { userId: "ana@example.com" } });
    expect(j).toMatchObject({ base: "historico", temFotografia: false, encerradas: ["Viagem"] });
  });

  it("encerra e reativa categorias no perfil do próprio usuário", async () => {
    const r = await (await patch({ categoria: "Prestação de Imóvel", encerrada: true })).json();
    expect(r.encerradas).toEqual(["Prestação de Imóvel", "Viagem"]);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "ana@example.com" } }));
    const r2 = await (await patch({ categoria: "Viagem", encerrada: false })).json();
    expect(r2.encerradas).toEqual([]);
  });

  it("rejeita categoria que não existe", async () => {
    expect((await patch({ categoria: "Qualquer Coisa", encerrada: true })).status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
