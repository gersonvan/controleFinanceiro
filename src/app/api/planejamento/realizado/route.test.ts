import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUserId: vi.fn(),
  findUnique: vi.fn(),
  itensFindMany: vi.fn(),
  lancFindMany: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSessionUserId: mocks.getSessionUserId }));
vi.mock("@/lib/db", () => ({
  prisma: {
    userProfile: { findUnique: mocks.findUnique },
    planejamentoItem: { findMany: mocks.itensFindMany },
    lancamento: { findMany: mocks.lancFindMany },
  },
}));

import { GET } from "./route";

const get = (q = "") => GET(new NextRequest(`http://localhost/api/planejamento/realizado${q}`));

describe("Planejado × Realizado", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUserId.mockResolvedValue("ana@example.com");
    mocks.findUnique.mockResolvedValue({ margemPercentual: 10 });
    mocks.itensFindMany.mockResolvedValue([
      { grupo: "entrada", descricao: "Salário", categoria: "Salário", valor: 4000, periodicidade: "mensal" },
      { grupo: "fixo", descricao: "Energia", categoria: "Contas de Consumo", valor: 300, periodicidade: "mensal" },
      { grupo: "sazonal", descricao: "IPTU", categoria: "Impostos e Tributos", valor: 1200, periodicidade: "anual" },
      { grupo: "variavel", descricao: "Farmácia", categoria: "Farmácia", valor: 50, periodicidade: "mensal" },
      { grupo: "fixo", descricao: "Remédio contínuo", categoria: "Farmácia", valor: 100, periodicidade: "mensal" },
    ]);
    mocks.lancFindMany.mockResolvedValue([
      { categoria: "Contas de Consumo", valor: -280, tipo: "Saída" },
      { categoria: "Farmácia", valor: -220, tipo: "Saída" },
      { categoria: "Restaurantes e Lanches", valor: -90, tipo: "Saída" },
      { categoria: "Pagamento de Cartão de Crédito", valor: -999, tipo: "Saída" }, // neutra
      { categoria: "Salário", valor: 4100, tipo: "Entrada" },
    ]);
  });

  it("exige sessão e escopa as consultas ao tenant", async () => {
    mocks.getSessionUserId.mockResolvedValue(null);
    expect((await get()).status).toBe(401);

    mocks.getSessionUserId.mockResolvedValue("ana@example.com");
    await get("?ano=2026&mes=9");
    expect(mocks.itensFindMany).toHaveBeenCalledWith({ where: { userId: "ana@example.com" } });
    expect(mocks.lancFindMany.mock.calls[0][0].where.userId).toBe("ana@example.com");
  });

  it("compara por categoria, soma grupos, ignora neutras e lista o não planejado", async () => {
    const json = await (await get("?ano=2026&mes=9")).json();

    expect(json.entradas).toEqual({ planejado: 4000, realizado: 4100 });
    expect(json.margem).toBe(400);
    expect(json.saidas.planejado).toBeCloseTo(300 + 100 + 150, 5);
    expect(json.saidas.realizado).toBe(280 + 220 + 90); // sem a neutra

    const farmacia = json.linhas.find((l: { categoria: string }) => l.categoria === "Farmácia");
    expect(farmacia).toMatchObject({ planejado: 150, realizado: 220 });
    expect(farmacia.grupos.sort()).toEqual(["fixo", "variavel"]);

    expect(json.naoPlanejado).toEqual([{ categoria: "Restaurantes e Lanches", grupos: [], planejado: 0, realizado: 90 }]);
  });

  it("rejeita mês inválido", async () => {
    expect((await get("?mes=13")).status).toBe(400);
  });
});
