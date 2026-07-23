import { describe, expect, it } from "vitest";
import { parseCSVGenerico } from "./csv";
import { detectarBancoOFX, detectarFormato, sugerirPapeis } from "./detectar";
import { importar, type PerfilCompleto } from "./engine";
import { detectarBancoPDF } from "./pdf";
import { parseOFX } from "./ofx";
import { parseCSV, parseDataFlexivel, parseValor, type PerfilConfig } from "./tipos";

const perfilCsv: PerfilConfig = {
  nome: "Conta de teste",
  conta: "Conta teste",
  formato: "csv",
  delimitador: ";",
  linhasPular: 1,
  formatoData: "DD/MM/AAAA",
  modoValor: "unica",
  colData: 0,
  colDescricao: 1,
  colValor: 2,
  colEntrada: null,
  colSaida: null,
  inverterSinal: false,
  usaMesReferencia: false,
};

describe("utilitários de importação", () => {
  it("lê CSV com delimitador, aspas escapadas e quebra de linha dentro de uma célula", () => {
    expect(parseCSV('data;descricao\n01/01/2026;"Loja ""A""\nCentro"', ";")).toEqual([
      ["data", "descricao"],
      ["01/01/2026", 'Loja "A"\nCentro'],
    ]);
  });

  it("interpreta datas e valores brasileiros", () => {
    expect(parseDataFlexivel("15/02/2026", "DD/MM/AAAA")).toEqual(new Date(2026, 1, 15));
    expect(parseDataFlexivel("2026-02-15", "AAAA-MM-DD")).toEqual(new Date(2026, 1, 15));
    expect(parseValor("R$ 1.234,56")).toBe(1234.56);
    expect(parseValor("-50.25")).toBe(-50.25);
  });

  it("sugere corretamente data, descrição e valor", () => {
    expect(sugerirPapeis([
      ["Data", "Descrição", "Valor"],
      ["01/01/2026", "Mercado Central", "-120,00"],
      ["02/01/2026", "Farmácia", "-45,00"],
    ], 1)).toEqual(["data", "descricao", "valor"]);
  });
});

describe("parser CSV genérico", () => {
  it("importa, categoriza e define o mês de referência pela data", () => {
    const itens = parseCSVGenerico(
      "data;descricao;valor\n05/02/2026;Mercado;-123,45\n06/02/2026;Salário;2500,00",
      perfilCsv,
      new Map(),
      null
    );

    expect(itens).toHaveLength(2);
    expect(itens[0]).toMatchObject({
      descricao: "Mercado", valor: -123.45, tipo: "Saída", conta: "Conta teste",
      mesReferencia: new Date(2026, 1, 1),
    });
    expect(itens[1]).toMatchObject({ descricao: "Salário", valor: 2500, tipo: "Entrada" });
  });

  it("aceita colunas separadas e mês de referência informado para fatura", () => {
    const itens = parseCSVGenerico(
      "data;descricao;entrada;saida\n05/02/2026;Compra;;80,00\n06/02/2026;Reembolso;20,00;",
      { ...perfilCsv, colValor: null, colEntrada: 2, colSaida: 3, modoValor: "separadas", usaMesReferencia: true },
      new Map(),
      new Date(2026, 2, 1)
    );

    expect(itens.map(({ valor, tipo, mesReferencia }) => ({ valor, tipo, mesReferencia }))).toEqual([
      { valor: -80, tipo: "Saída", mesReferencia: new Date(2026, 2, 1) },
      { valor: 20, tipo: "Entrada", mesReferencia: new Date(2026, 2, 1) },
    ]);
  });
});

describe("parser e detecção OFX", () => {
  it("identifica banco por FID e lê OFX SGML sem tags de fechamento", () => {
    const ofx = "OFXHEADER:100\n<ORG>Banco Itaú\n<FID>0341\n<STMTTRN><DTPOSTED>20260205<TRNAMT>-45,90<NAME>PADARIA\n<STMTTRN><DTPOSTED>20260206<TRNAMT>100.00<MEMO>PIX RECEBIDO";
    const itens = parseOFX(ofx, { ...perfilCsv, formato: "ofx" }, new Map(), null);

    expect(detectarFormato(ofx, "extrato.txt")).toBe("ofx");
    expect(detectarBancoOFX(ofx)).toEqual({ builtinKey: "itau-corrente-ofx", orgName: "Banco Itaú" });
    expect(itens.map(({ descricao, valor, tipo }) => ({ descricao, valor, tipo }))).toEqual([
      { descricao: "PADARIA", valor: -45.9, tipo: "Saída" },
      { descricao: "PIX RECEBIDO", valor: 100, tipo: "Entrada" },
    ]);
  });

  it("reconhece arquivos PDF e bancos de fatura", () => {
    expect(detectarFormato("%PDF-1.7", "arquivo.bin")).toBe("pdf");
    expect(detectarBancoPDF("NU PAGAMENTOS S.A. - FATURA NUBANK")).toEqual({
      builtinKey: "nubank-cartao-pdf",
      bancoNome: "Nubank — Fatura do Cartão",
    });
  });
});

describe("motor de importação", () => {
  it("encaminha perfil CSV ao parser genérico", () => {
    const perfil: PerfilCompleto = { ...perfilCsv, builtin: null };
    const itens = importar("data;descricao;valor\n10/02/2026;Teste;-10", "extrato.csv", perfil, new Map(), null);

    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({ descricao: "Teste", valor: -10, fonte: "Importado Conta de teste" });
  });
});
