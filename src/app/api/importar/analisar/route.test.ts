import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUserId: vi.fn(),
  perfilFindFirst: vi.fn(),
  lancamentoFindMany: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSessionUserId: mocks.getSessionUserId }));
vi.mock("@/lib/importacao/perfis-nativos", () => ({ ensureBuiltinPerfis: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    perfilImportacao: { findFirst: mocks.perfilFindFirst },
    lancamento: { findMany: mocks.lancamentoFindMany },
  },
}));

import { POST } from "./route";

const ofx = "OFXHEADER:100\n<ORG>Banco Itaú\n<FID>0341\n" +
  "<STMTTRN><DTPOSTED>20260805<TRNAMT>-45,90<NAME>PADARIA\n" +
  "<STMTTRN><DTPOSTED>20260806<TRNAMT>100.00<MEMO>PIX RECEBIDO";

const perfilItau = {
  id: 7, nome: "Itaú — Conta Corrente", conta: "Itaú Corrente", formato: "ofx", builtin: "itau-corrente-ofx",
  delimitador: ",", linhasPular: 0, formatoData: "DD/MM/AAAA", modoValor: "unica",
  colData: null, colDescricao: null, colParcela: null, colValor: null, colEntrada: null, colSaida: null,
  inverterSinal: false, usaMesReferencia: false,
};

const enviar = (conteudo: string, nome: string) => {
  const form = new FormData();
  form.append("file", new File([conteudo], nome));
  return POST(new NextRequest("http://localhost/api/importar/analisar", { method: "POST", body: form }));
};

describe("análise de arquivo para importação em lote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUserId.mockResolvedValue("ana@example.com");
    mocks.lancamentoFindMany.mockResolvedValue([]);
  });

  it("exige sessão", async () => {
    mocks.getSessionUserId.mockResolvedValue(null);
    expect((await enviar(ofx, "extrato.ofx")).status).toBe(401);
  });

  it("reconhece o banco, busca o perfil do próprio usuário e conta duplicados", async () => {
    mocks.perfilFindFirst.mockResolvedValue(perfilItau);
    // Um dos dois lançamentos já está gravado
    mocks.lancamentoFindMany.mockResolvedValue([
      { data: new Date(2026, 7, 5), descricao: "PADARIA", valor: -45.9 },
    ]);

    const json = await (await enviar(ofx, "extrato.ofx")).json();

    expect(mocks.perfilFindFirst).toHaveBeenCalledWith({
      where: { builtin: "itau-corrente-ofx", userId: "ana@example.com" },
    });
    expect(mocks.lancamentoFindMany.mock.calls[0][0].where.userId).toBe("ana@example.com");
    expect(json).toMatchObject({
      formato: "ofx", reconhecido: true, total: 2, novos: 1, duplicados: 1,
      perfil: { id: 7, conta: "Itaú Corrente", usaMesReferencia: false },
      mesReferenciaSugerido: null,
    });
  });

  it("marca como não reconhecido um CSV sem layout conhecido, sem consultar lançamentos", async () => {
    const json = await (await enviar("data;historico;valor\n01/08/2026;Mercado;-10,00", "planilha.csv")).json();

    expect(json).toMatchObject({ formato: "csv", reconhecido: false });
    expect(json.motivo).toMatch(/colunas/);
    expect(mocks.perfilFindFirst).not.toHaveBeenCalled();
    expect(mocks.lancamentoFindMany).not.toHaveBeenCalled();
  });

  it("marca como não reconhecido quando o usuário não tem o perfil do banco", async () => {
    mocks.perfilFindFirst.mockResolvedValue(null);
    const json = await (await enviar(ofx, "extrato.ofx")).json();
    expect(json).toMatchObject({ formato: "ofx", reconhecido: false, banco: "Banco Itaú" });
  });
});

describe("análise: extrato repetido em outro formato", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUserId.mockResolvedValue("ana@example.com");
    mocks.perfilFindFirst.mockResolvedValue(perfilItau);
  });

  it("conta como suspeito o que bate em data e valor com outra descrição", async () => {
    mocks.lancamentoFindMany.mockResolvedValue([
      { data: new Date(2026, 7, 5), descricao: "Pix enviado para PADARIA DO ZE", valor: -45.9 },
      // mesma descrição com espaço e caixa diferentes = duplicado, não suspeito
      { data: new Date(2026, 7, 6), descricao: "pix recebido ", valor: 100 },
    ]);
    const json = await (await enviar(ofx, "extrato.ofx")).json();
    expect(json).toMatchObject({ total: 2, duplicados: 1, novos: 1, suspeitos: 1 });
  });
});
