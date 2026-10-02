import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSessionUserId: vi.fn(), findMany: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSessionUserId: mocks.getSessionUserId }));
vi.mock("@/lib/db", () => ({ prisma: { lancamento: { findMany: mocks.findMany }, apelido: { findMany: async () => [] } } }));

import { GET } from "./route";

let id = 0;
const l = (descricao: string, valor: number, data: string) =>
  ({ id: ++id, descricao, valor, data: new Date(`${data}T00:00:00Z`), conta: "BB Corrente" });

describe("Revisar: grupos por estabelecimento", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.getSessionUserId.mockResolvedValue("ana@example.com"); });

  it("junta as variações da descrição e não mistura entrada com saída", async () => {
    mocks.findMany.mockResolvedValue([
      l("Pagamento de Boleto - ESCOLA FICTICIA INFANTIL - Data balanc.: 04", -1804, "2026-03-04"),
      l("Pagamento de Boleto - ESCOLA FICTICIA INFANTIL LTDA - Data balanc", -236.25, "2026-02-20"),
      l("Pagamento de Boleto - ESCOLA FICTICIA INFANTIL", -1864, "2026-01-05"),
      l("Pix - Enviado - 04/09 12:18 MARIA TESTE", -100, "2026-09-04"),
      l("Pix - Recebido - 05/09 10:00 MARIA TESTE", 100, "2026-09-05"),
    ]);
    const j = await (await GET(new NextRequest("http://localhost/api/lancamentos/agrupados?categoria=__sem__"))).json();
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "ana@example.com", categoria: null } }));
    const escola = j.grupos.find((g: { descricao: string }) => g.descricao.includes("ESCOLA"));
    expect(escola).toMatchObject({ quantidade: 3, total: -3904.25, ultimaData: "2026-03-04" });
    expect(escola.descricoes).toHaveLength(3);
    expect(escola.ids).toHaveLength(3);
    expect(j.grupos.filter((g: { descricao: string }) => g.descricao.includes("MARIA"))).toHaveLength(2);

    const itens = await (await GET(new NextRequest(`http://localhost/api/lancamentos/agrupados?categoria=__sem__&chave=${encodeURIComponent(escola.chave)}`))).json();
    expect(itens.itens.map((i: { valor: number }) => i.valor)).toEqual([-1804, -236.25, -1864]);
  });
});
