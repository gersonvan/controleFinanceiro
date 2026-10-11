import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), createMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { perfilImportacao: { findMany: mocks.findMany, createMany: mocks.createMany } } }));

import { ensureBuiltinPerfis } from "./perfis-nativos";

const criados = () => mocks.createMany.mock.calls[0][0].data as { builtin: string; ativo: boolean; userId: string; nome: string; conta: string; usaMesReferencia: boolean }[];

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

  it("extrato C6 e CSVs do Nubank fazem parte do catálogo de toda conta", async () => {
    mocks.findMany.mockResolvedValue([]);
    await ensureBuiltinPerfis("bruno@example.com");
    const por = new Map(criados().map((p) => [p.builtin, p]));
    expect(por.get("c6-debito")).toMatchObject({ nome: "C6 — Extrato da Conta (CSV)", conta: "C6 · Débito", usaMesReferencia: false });
    expect(por.get("nubank-credito")).toMatchObject({ nome: "Nubank — Fatura Cartão (CSV)", conta: "Nubank · Crédito", usaMesReferencia: true });
    expect(por.get("nubank-debito")).toMatchObject({ nome: "Nubank — Extrato da Conta (CSV)", conta: "Nubank · Débito", usaMesReferencia: false });
    expect(por.has("c6-credito")).toBe(false); // a fatura C6 em CSV é o c6-cartao-csv
    expect(por.get("bradesco-extrato-pdf")).toMatchObject({ nome: "Bradesco — Extrato da Conta", conta: "Bradesco · Débito", usaMesReferencia: false });
  });
});
