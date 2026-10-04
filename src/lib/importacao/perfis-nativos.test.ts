import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), createMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { perfilImportacao: { findMany: mocks.findMany, createMany: mocks.createMany } } }));

import { ensureBuiltinPerfis } from "./perfis-nativos";

const criados = () => mocks.createMany.mock.calls[0][0].data as { builtin: string; ativo: boolean; userId: string }[];

describe("perfis nativos", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.createMany.mockResolvedValue({ count: 0 }); });

  it("conta nova recebe todos os bancos ativos (escolhe no onboarding)", async () => {
    mocks.findMany.mockResolvedValue([]);
    await ensureBuiltinPerfis("ana@example.com");
    expect(criados().length).toBeGreaterThan(10);
    expect(criados().every((p) => p.ativo && p.userId === "ana@example.com")).toBe(true);
  });

  it("banco novo no catálogo entra desativado para quem já tem os seus", async () => {
    mocks.findMany.mockResolvedValue([{ builtin: "itau-corrente-ofx" }, { builtin: "nubank-cartao-pdf" }]);
    await ensureBuiltinPerfis("ana@example.com");
    expect(criados().some((p) => p.builtin === "itau-corrente-ofx")).toBe(false); // já existia
    expect(criados().every((p) => p.ativo === false)).toBe(true);
  });
});
