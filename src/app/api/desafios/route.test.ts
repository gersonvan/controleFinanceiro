import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUserId: vi.fn(),
  desafioFindMany: vi.fn(),
  desafioFindFirst: vi.fn(),
  desafioCreate: vi.fn(),
  desafioUpdateMany: vi.fn(),
  lancamentoFindMany: vi.fn(),
  lancamentoCount: vi.fn(),
  tiposDasContas: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSessionUserId: mocks.getSessionUserId }));
vi.mock("@/lib/contas", () => ({ tiposDasContas: mocks.tiposDasContas }));
vi.mock("@/lib/db", () => ({
  prisma: {
    desafio: {
      findMany: mocks.desafioFindMany, findFirst: mocks.desafioFindFirst,
      create: mocks.desafioCreate, updateMany: mocks.desafioUpdateMany,
    },
    lancamento: { findMany: mocks.lancamentoFindMany, count: mocks.lancamentoCount },
  },
}));

import { GET, PATCH, POST } from "./route";

const ANA = "ana@example.com";
const dia = (s: string) => new Date(`${s}T00:00:00Z`);
const req = (method: string, body: unknown) =>
  new NextRequest("http://localhost/api/desafios", { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });

const desafio = (p: Record<string, unknown>) => ({
  id: 1, userId: ANA, categoria: null, meta: 0, referencia: 0, status: "ativo", resultado: null, economia: null,
  parcial: false, encerradoEm: null, inicio: dia("2026-10-01"), fim: new Date("2026-10-31T23:59:59.999Z"), ...p,
});
const lanc = (data: string, valor: number, categoria: string, conta = "Débito") => ({
  data: dia(data), mesReferencia: null, valor, valorReembolsado: 0, categoria, descricao: "X", conta,
  tipo: valor >= 0 ? "Entrada" : "Saída", fonte: "Importado Banco (OFX)", createdAt: dia(data),
});

describe("API de desafios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-07T15:00:00Z"));
    mocks.getSessionUserId.mockResolvedValue(ANA);
    mocks.desafioFindMany.mockResolvedValue([]);
    mocks.lancamentoFindMany.mockResolvedValue([]);
    mocks.lancamentoCount.mockResolvedValue(0);
    mocks.tiposDasContas.mockResolvedValue(new Map([["Débito", "corrente"]]));
    mocks.desafioCreate.mockImplementation(({ data }) => Promise.resolve({ id: 9, status: "ativo", ...data }));
    mocks.desafioUpdateMany.mockResolvedValue({ count: 1 });
  });
  afterEach(() => vi.useRealTimers());

  it("exige sessão", async () => {
    mocks.getSessionUserId.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await POST(req("POST", { modelo: "sobra" }))).status).toBe(401);
    expect((await PATCH(req("PATCH", { id: 1, acao: "desistir" }))).status).toBe(401);
    expect(mocks.desafioFindMany).not.toHaveBeenCalled();
  });

  it("aceita: período e referência vêm do servidor, o dono vem da sessão", async () => {
    mocks.lancamentoFindMany.mockResolvedValue(
      ["04", "05", "06", "07", "08", "09"].map((m) => lanc(`2026-${m}-10`, -500, "Restaurantes e Lanches")),
    );
    const res = await POST(req("POST", {
      modelo: "teto-categoria", categoria: "Restaurantes e Lanches", meta: 400,
      userId: "bruno@example.com", referencia: 1, inicio: "2020-01-01",
    }));
    expect(res.status).toBe(201);
    const { data } = mocks.desafioCreate.mock.calls[0][0];
    expect(data).toEqual({
      userId: ANA, modelo: "teto-categoria", categoria: "Restaurantes e Lanches", meta: 400, referencia: 500,
      inicio: dia("2026-10-01"), fim: new Date("2026-10-31T23:59:59.999Z"),
    });
    expect(mocks.lancamentoFindMany.mock.calls[0][0].where.userId).toBe(ANA);
  });

  it("semana sem delivery já vem com a categoria; teto sem meta propõe 10% abaixo", async () => {
    await POST(req("POST", { modelo: "semana-sem-delivery", categoria: "Compras" }));
    expect(mocks.desafioCreate.mock.calls[0][0].data).toMatchObject({ categoria: "Delivery e iFood", meta: 0, inicio: dia("2026-10-07") });
    mocks.lancamentoFindMany.mockResolvedValue([lanc("2026-09-10", -333, "Compras")]);
    await POST(req("POST", { modelo: "teto-categoria", categoria: "Compras" }));
    expect(mocks.desafioCreate.mock.calls[1][0].data).toMatchObject({ meta: 300, referencia: 333 });
  });

  it("recusa modelo, categoria e meta inválidos", async () => {
    for (const corpo of [
      { modelo: "inventado" },
      { modelo: "teto-categoria" },
      { modelo: "teto-categoria", categoria: "Pagamento de Cartão de Crédito" },
      { modelo: "teto-categoria", categoria: "Inventada" },
      { modelo: "zero-encargos", meta: -5 },
      { modelo: "sobra", meta: "muito" },
    ]) {
      expect((await POST(req("POST", corpo))).status, JSON.stringify(corpo)).toBe(400);
    }
    expect(mocks.desafioCreate).not.toHaveBeenCalled();
  });

  it("no máximo 3 em andamento, sem repetir o mesmo no período", async () => {
    mocks.desafioFindMany.mockResolvedValue([desafio({ modelo: "sobra" })]);
    expect((await POST(req("POST", { modelo: "sobra" }))).status).toBe(409);
    mocks.desafioFindMany.mockResolvedValue([
      desafio({ modelo: "sobra" }), desafio({ modelo: "zero-encargos" }),
      desafio({ modelo: "teto-categoria", categoria: "Compras" }),
    ]);
    const cheio = await POST(req("POST", { modelo: "semana-sem-delivery" }));
    expect(cheio.status).toBe(409);
    expect((await cheio.json()).error).toMatch(/3 desafios/);
    expect(mocks.desafioCreate).not.toHaveBeenCalled();
  });

  it("GET fecha o que terminou e já tem extrato, dentro do tenant", async () => {
    mocks.desafioFindMany.mockResolvedValue([
      desafio({ id: 5, modelo: "teto-categoria", categoria: "Compras", meta: 400, referencia: 600, inicio: dia("2026-09-01"), fim: new Date("2026-09-30T23:59:59.999Z") }),
    ]);
    mocks.lancamentoFindMany.mockResolvedValue([lanc("2026-09-12", -350, "Compras"), lanc("2026-10-02", -10, "Compras")]);
    const json = await (await GET()).json();
    expect(mocks.desafioFindMany.mock.calls[0][0].where).toEqual({ userId: ANA });
    expect(mocks.desafioUpdateMany).toHaveBeenCalledWith({
      where: { id: 5, status: "ativo", userId: ANA },
      data: expect.objectContaining({ status: "cumprido", resultado: 350, economia: 250, parcial: false }),
    });
    expect(json.economiaAcumulada).toBe(250);
    expect(json.fechados[0]).toMatchObject({ id: 5, estado: "cumprido", titulo: expect.stringContaining("Compras") });
    expect(json.fechados[0].userId).toBeUndefined();
    expect(json.vagas).toBe(3);
  });

  it("desistir e encerrar só mexem no próprio desafio ativo", async () => {
    mocks.desafioFindFirst.mockResolvedValue(null);
    expect((await PATCH(req("PATCH", { id: 7, acao: "desistir" }))).status).toBe(404);
    expect(mocks.desafioFindFirst).toHaveBeenCalledWith({ where: { id: 7, status: "ativo", userId: ANA } });

    mocks.desafioFindFirst.mockResolvedValue(desafio({ id: 7, modelo: "sobra" }));
    expect((await PATCH(req("PATCH", { id: 7, acao: "encerrar" }))).status).toBe(409); // outubro ainda não acabou
    expect((await PATCH(req("PATCH", { id: 7, acao: "desistir" }))).status).toBe(200);
    expect(mocks.desafioUpdateMany).toHaveBeenCalledWith({
      where: { id: 7, status: "ativo", userId: ANA },
      data: { status: "abandonado", encerradoEm: expect.any(Date) },
    });
  });
});
