import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUserId: vi.fn(),
  reserva: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  lancamentoFindMany: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ getSessionUserId: mocks.getSessionUserId }));
vi.mock("@/lib/db", () => ({ prisma: { reserva: mocks.reserva, lancamento: { findMany: mocks.lancamentoFindMany } } }));

import { DELETE, GET, PATCH, POST } from "./route";

const json = (method: string, body: unknown) => new NextRequest("http://localhost/api/reservas", {
  method, body: JSON.stringify(body), headers: { "content-type": "application/json" },
});

describe("API de reservas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUserId.mockResolvedValue("ana@example.com");
    mocks.reserva.updateMany.mockResolvedValue({ count: 1 });
    mocks.reserva.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("lista só as reservas do usuário, com saldo estimado pelos lançamentos dele", async () => {
    mocks.reserva.findMany.mockResolvedValue([{ id: 1, nome: "CDB", bloqueada: false, saldoInformado: 1000, dataSaldo: new Date("2026-08-01T00:00:00Z"), conta: "Sofisa", filtroDescricao: null }]);
    mocks.lancamentoFindMany.mockResolvedValue([{ data: new Date("2026-09-01T00:00:00Z"), descricao: "Resgate", valor: 200, conta: "Sofisa", categoria: "Investimentos (Aportes)" }]);
    const j = await (await GET()).json();
    expect(mocks.reserva.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "ana@example.com" } }));
    expect(mocks.lancamentoFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: "ana@example.com" }) }));
    expect(j.reservas[0].saldo).toBe(800);
    expect(j.totais).toEqual({ disponivel: 800, bloqueado: 0, total: 800 });
  });

  it("cria com o userId da sessão e valida os campos", async () => {
    mocks.reserva.create.mockResolvedValue({ id: 2 });
    const ok = await POST(json("POST", { nome: "Previdência", tipo: "previdencia", bloqueada: true, saldoInformado: 100554.17, dataSaldo: "2026-08-31" }));
    expect(ok.status).toBe(201);
    expect(mocks.reserva.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "ana@example.com", nome: "Previdência", bloqueada: true }) });
    expect((await POST(json("POST", { nome: "X", tipo: "cripto", saldoInformado: 1, dataSaldo: "2026-08-31" }))).status).toBe(400);
    expect((await POST(json("POST", { nome: "X", tipo: "conta", saldoInformado: -5, dataSaldo: "2026-08-31" }))).status).toBe(400);
  });

  it("edita e exclui só no escopo do usuário", async () => {
    await PATCH(json("PATCH", { id: 7, saldoInformado: 40000, dataSaldo: "2026-09-27" }));
    expect(mocks.reserva.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "ana@example.com", id: 7 } }));
    await DELETE(new NextRequest("http://localhost/api/reservas?id=7", { method: "DELETE" }));
    expect(mocks.reserva.deleteMany).toHaveBeenCalledWith({ where: { userId: "ana@example.com", id: 7 } });
    mocks.reserva.updateMany.mockResolvedValue({ count: 0 });
    expect((await PATCH(json("PATCH", { id: 99, nome: "Y" }))).status).toBe(404);
  });
});
