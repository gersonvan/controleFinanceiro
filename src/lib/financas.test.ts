import { describe, expect, it } from "vitest";
import { classificarMeio, custoDivida, origemEncargo, gastosPorMeio, mediaPorMeio, mesesAte, ritmoDoMes, tipoSugerido, type LancamentoFinancas, type TipoConta } from "./financas";

const utc = (s: string) => new Date(s + "T00:00:00Z");
const l = (p: Partial<Omit<LancamentoFinancas, "data">> & { data: string }): LancamentoFinancas => ({
  mesReferencia: null, valor: -10, categoria: null, descricao: "X", conta: "C6 Débito", ...p, data: utc(p.data),
});
const tipos = new Map<string, TipoConta>([["C6 Débito", "corrente"], ["C6 Crédito", "cartao"]]);

describe("meio de pagamento", () => {
  it("sugere o tipo pelo nome da conta", () => {
    expect(tipoSugerido("C6 Crédito")).toBe("cartao");
    expect(tipoSugerido("Nubank Cartão")).toBe("cartao");
    expect(tipoSugerido("BB Corrente")).toBe("corrente");
  });

  it("classifica pelas descrições reais dos bancos", () => {
    const m = (descricao: string, tipo: TipoConta = "corrente") => classificarMeio({ descricao }, tipo);
    expect(m("QUALQUER COISA", "cartao")).toBe("cartao");
    expect(m("Pix enviado para J R ESTACIONAMENTO LTDA")).toBe("pix");
    expect(m("Transferência enviada pelo Pix - FULANO")).toBe("pix");
    expect(m("ART PAO                FORTALEZA     BRA   ")).toBe("debito");
    expect(m("Compra no débito - ATILA LIMA")).toBe("debito");
    expect(m("99* POP 25Set 13h37min SP BRA")).toBe("debito");
    expect(m("JUROS CHEQUE ESP")).toBe("encargos");
    expect(m("IOF CHEQUE ESPECIAL")).toBe("encargos");
    expect(m("UNIMED FORTALEZA SOCIEDADE COOP")).toBe("boleto");
    expect(m("Pagamento de boleto efetuado - EDIFICIO LIVORNO")).toBe("boleto");
  });
});

describe("gastos por meio", () => {
  const dados = [
    l({ data: "2026-09-02", valor: -100, descricao: "Pix enviado para LOJA" }),
    l({ data: "2026-08-20", mesReferencia: utc("2026-09-01"), valor: -50, conta: "C6 Crédito" }), // fatura de setembro
    l({ data: "2026-09-06", valor: -68000, categoria: "Investimentos (Aportes)", descricao: "Aplicação RDB" }),
    l({ data: "2026-09-10", valor: -5000, categoria: "Pagamento de Cartão de Crédito", descricao: "BANCO C6 S.A." }),
    l({ data: "2026-09-11", valor: -300, categoria: "Empresa (PJ)", descricao: "Pix enviado para CONTADOR" }),
    l({ data: "2026-09-12", valor: 2000, descricao: "Pix recebido de FULANO" }),
    l({ data: "2026-08-05", valor: -40, descricao: "Pix enviado para OUTRO" }),
  ];

  it("conta o cartão pela fatura e deixa de fora aportes, pagamento de fatura, empresa e entradas", () => {
    const [ago, set] = gastosPorMeio(dados, tipos, ["2026-08", "2026-09"]);
    expect(set.porMeio).toEqual({ cartao: 50, pix: 100, boleto: 0, debito: 0, encargos: 0 });
    expect(set.total).toBe(150);
    expect(set.investido).toBe(68000);
    expect(ago.total).toBe(40);
  });

  it("média ignora meses sem nenhum gasto", () => {
    const serie = gastosPorMeio(dados, tipos, ["2026-07", "2026-08"]);
    expect(mediaPorMeio(serie)).toMatchObject({ total: 40, meses: 1 });
  });

  it("gera a janela de meses atravessando o ano", () => {
    expect(mesesAte(2026, 2, 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});

describe("custo de dívida", () => {
  it("soma juros, IOF e multas, desconta devoluções e aponta a maior causa", () => {
    const dados = [
      l({ data: "2026-05-05", valor: -334.29, descricao: "JUROS CHEQUE ESP" }),
      l({ data: "2026-05-05", valor: -81.77, descricao: "IOF CHEQUE ESPECIAL" }),
      l({ data: "2026-05-15", valor: 1.58, descricao: "DEV JUROS CHQ ESP" }),
      l({ data: "2026-06-02", valor: -284.76, descricao: "JUROS CHEQUE ESP" }),
      l({ data: "2026-06-14", valor: -6.28, descricao: "Multa por fatura atrasada", conta: "Nubank Crédito" }),
      l({ data: "2026-06-20", valor: -50, descricao: "MERCADO" }),
      l({ data: "2026-06-21", valor: -3.1, descricao: "IOF Transações Exterior", conta: "C6 Crédito" }),
    ];
    const r = custoDivida(dados, ["2026-05", "2026-06"]);
    expect(r.serie).toEqual([
      { mes: "2026-05", juros: 334.29, iof: 81.77, multas: 0, devolvido: 1.58, total: 414.48 },
      { mes: "2026-06", juros: 284.76, iof: 0, multas: 6.28, devolvido: 0, total: 291.04 },
    ]);
    expect(r.total).toBe(705.52);
    expect(r.mesesComCusto).toBe(2);
    expect(r.maiores[0]).toMatchObject({ descricao: "JUROS CHEQUE ESP", vezes: 2, meses: 2, total: 619.05 });
    expect(r.porOrigem.map((o) => o.origem)).toEqual(["Cheque especial", "Atraso de fatura"]);
    expect(r.principal).toMatchObject({ origem: "Cheque especial", conta: "C6 Débito", total: 700.82, participacao: 99 });
  });

  it("agrupa as descrições reais pela origem", () => {
    expect(origemEncargo("DEV JUROS CHQ ESP")).toBe("Cheque especial");
    expect(origemEncargo("IOF CHEQUE ESPECIAL")).toBe("Cheque especial");
    expect(origemEncargo("Juros de Mora")).toBe("Atraso de fatura");
    expect(origemEncargo("Multa Contratual")).toBe("Atraso de fatura");
    expect(origemEncargo("IOF por fatura atrasada")).toBe("Atraso de fatura");
    expect(origemEncargo("IOF Rotativo")).toBe("Rotativo do cartão");
    expect(origemEncargo("Encargos")).toBe("Rotativo do cartão");
  });
});

describe("ritmo do mês", () => {
  it("acumula por dia só nas contas correntes e projeta pelo restante médio", () => {
    const dados = [
      l({ data: "2026-08-01", valor: -100 }), l({ data: "2026-08-20", valor: -200 }),
      l({ data: "2026-07-01", valor: -300 }), l({ data: "2026-07-20", valor: -300 }),
      l({ data: "2026-09-01", valor: -500 }),
      l({ data: "2026-09-02", valor: -999, conta: "C6 Crédito", mesReferencia: utc("2026-09-01") }),
    ];
    const r = ritmoDoMes(dados, tipos, "2026-09", ["2026-07", "2026-08"], 10);
    expect(r.dias).toBe(30);
    expect(r.atual).toHaveLength(10);
    expect(r.gastoAteHoje).toBe(500);
    expect(r.media[0]).toBe(200);       // (300 + 100) / 2
    expect(r.mediaFim).toBe(450);       // (600 + 300) / 2
    expect(r.projecao).toBe(750);       // 500 + (450 − 200)
    expect(r.mesesNaMedia).toBe(2);
  });
});
