import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSessionUserId: vi.fn(), findMany: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSessionUserId: mocks.getSessionUserId }));
vi.mock("@/lib/db", () => ({ prisma: { lancamento: { findMany: mocks.findMany } } }));

import { GET } from "./route";

const l = (categoria: string, descricao: string, valor: number, mes: string) =>
  ({ categoria, descricao, valor, data: new Date(`${mes}-10T00:00:00Z`), mesReferencia: null, valorReembolsado: 0 });

describe("Matriz", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.getSessionUserId.mockResolvedValue("ana@example.com"); });

  it("tira pagamento de fatura, transferências e aplicações das linhas principais, no escopo do usuário", async () => {
    mocks.findMany.mockResolvedValue([
      l("Salário", "GVAN CONSULTORIA", 12000, "2026-09"),
      l("Pagamento de Cartão de Crédito", "Pag Fatura Boleto", 5027.29, "2026-09"),
      l("Transferência entre Contas", "Pix recebido de GERSON", 6400, "2026-09"),
      l("Investimentos (Aportes)", "Aplicação RDB", -68000, "2026-09"),
    ]);
    const j = await (await GET(new NextRequest("http://localhost/api/matriz?tipo=Entrada"))).json();
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: "ana@example.com" }) }));
    expect(j.linhas.map((x: { categoria: string }) => x.categoria)).toEqual(["Salário"]);
    expect(j.internas.map((x: { categoria: string }) => x.categoria).sort()).toEqual(["Investimentos (Aportes)", "Pagamento de Cartão de Crédito", "Transferência entre Contas"]);
  });

  it("agrupa as categorias por grupo, com soma e média por mês", async () => {
    mocks.findMany.mockResolvedValue([
      l("Combustível", "POSTO TESTE", -300, "2026-08"),
      l("Combustível", "POSTO TESTE", -200, "2026-09"),
      l("Estacionamento", "ESTAPAR", -50, "2026-09"),
      l("Aluguel", "ALUGUEL", -1800, "2026-09"),
      l("Categoria Antiga", "X", -10, "2026-09"),
    ]);
    const j = await (await GET(new NextRequest("http://localhost/api/matriz?tipo=Saída"))).json();
    expect(j.grupos.map((g: { grupo: string }) => g.grupo)).toEqual(["Moradia", "Transporte", "Outros"]);
    const transporte = j.grupos[1];
    expect(transporte.categorias.map((c: { categoria: string }) => c.categoria)).toEqual(["Combustível", "Estacionamento"]);
    expect(transporte.totais).toEqual({ "08/2026": 300, "09/2026": 250 });
    expect(transporte.media).toBe(275);
  });
});
