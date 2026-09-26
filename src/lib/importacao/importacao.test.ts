import { describe, expect, it } from "vitest";
import { parseCSVGenerico } from "./csv";
import { detectarBancoOFX, detectarFormato, detectarPerfilCSV, sugerirPapeis } from "./detectar";
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
  colParcela: null,
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

  it("reconhece o layout CSV de fatura do C6", () => {
    const cabecalho = "Data;Cartão;Final do Cartão;Categoria;Descrição;Parcela;Valor (em US$);Cotação (em R$);Valor (em R$)";

    expect(detectarPerfilCSV(cabecalho)).toEqual({
      builtinKey: "c6-cartao-csv",
      nome: "C6 — Fatura Cartão (CSV)",
    });
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

  it("incorpora a parcela à descrição e inverte o sinal de uma fatura", () => {
    const itens = parseCSVGenerico(
      "data;descricao;parcela;valor\n05/02/2026;GRAN EDUCACAO;5/12;54,90\n06/02/2026;Estorno Tarifa;Única;-98,00",
      { ...perfilCsv, colDescricao: 1, colParcela: 2, colValor: 3, inverterSinal: true, usaMesReferencia: true },
      new Map(),
      new Date(2026, 7, 1)
    );

    expect(itens.map(({ descricao, valor, tipo, mesReferencia }) => ({ descricao, valor, tipo, mesReferencia }))).toEqual([
      { descricao: "GRAN EDUCACAO (5/12)", valor: -54.9, tipo: "Saída", mesReferencia: new Date(2026, 7, 1) },
      { descricao: "Estorno Tarifa", valor: 98, tipo: "Entrada", mesReferencia: new Date(2026, 7, 1) },
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

describe("sanidade das linhas importadas", () => {
  const base = { descricao: "MERCADO", valor: -10, tipo: "Saída" as const, categoria: "", conta: "X", mesReferencia: new Date(2026, 8, 1), fonte: "t" };
  const hoje = new Date(2026, 8, 25);

  it("descarta saldo, valor zero e datas impossíveis", async () => {
    const { lancamentoValido } = await import("./engine");
    expect(lancamentoValido({ ...base, data: new Date(2026, 8, 20) }, hoje)).toBe(true);
    expect(lancamentoValido({ ...base, data: new Date(2026, 8, 20), valor: 0 }, hoje)).toBe(false);
    expect(lancamentoValido({ ...base, data: new Date(1902, 10, 30) }, hoje)).toBe(false);
    expect(lancamentoValido({ ...base, data: new Date(2028, 0, 1) }, hoje)).toBe(false);
    for (const descricao of ["Saldo do dia", "SALDO ANTERIOR", "Saldo", "Total da fatura", "SDO CTA/APL AUTOMATICAS"]) {
      expect(lancamentoValido({ ...base, descricao, data: new Date(2026, 8, 20) }, hoje), descricao).toBe(false);
    }
    // Lojas com nomes parecidos continuam valendo
    for (const descricao of ["TOTAL EXPRESS", "TOTALPASS", "SALDO CERTO LTDA"]) {
      expect(lancamentoValido({ ...base, descricao, data: new Date(2026, 8, 20) }, hoje), descricao).toBe(true);
    }
  });

  it("OFX com linha de saldo zerada não gera lançamento", () => {
    const ofx = "<ORG>BB\n<FID>0001\n<STMTTRN><DTPOSTED>19021130<TRNAMT>0.00<NAME>Saldo do dia\n<STMTTRN><DTPOSTED>20260901<TRNAMT>-12.00<NAME>PADARIA";
    const perfil: PerfilCompleto = { ...perfilCsv, formato: "ofx", builtin: null };
    expect(importar(ofx, "bb.ofx", perfil, new Map(), null).map((l) => l.descricao)).toEqual(["PADARIA"]);
  });

  it("data ISO vale mesmo com perfil DD/MM/AAAA, e datas que rolam são rejeitadas", () => {
    expect(parseDataFlexivel("2026-01-16", "DD/MM/AAAA")).toEqual(new Date(2026, 0, 16));
    expect(parseDataFlexivel("31/02/2026", "DD/MM/AAAA")).toBeNull();
    expect(parseDataFlexivel("2026/01/16", "DD/MM/AAAA")).toBeNull();
  });
});

describe("catálogo de categorias", () => {
  it("cada categoria está em exatamente um grupo do seletor", async () => {
    const { CATEGORIAS, GRUPOS_CATEGORIAS } = await import("../categorias");
    const nosGrupos = GRUPOS_CATEGORIAS.flatMap((g) => g.categorias);
    expect(new Set(nosGrupos).size).toBe(nosGrupos.length);
    expect([...nosGrupos].sort()).toEqual([...CATEGORIAS].sort());
  });

  it("gastos da empresa vão para Empresa (PJ) e ficam fora dos totais pessoais", async () => {
    const { mapearCategoria, CATEGORIAS_NEUTRAS } = await import("../categorias");
    for (const d of ["contador", "Contador Jun_26", "endereço fiscal", "SIMPLES NACIONAL", "MP *COWORKINGALDE"]) {
      expect(mapearCategoria(d, "", "Saída"), d).toBe("Empresa (PJ)");
    }
    expect(CATEGORIAS_NEUTRAS.has("Empresa (PJ)")).toBe(true);
  });
});

describe("extrato CSV da conta C6", () => {
  const extrato = [
    "EXTRATO DE CONTA CORRENTE C6 BANK",
    "Agência: 1;Conta: 123456",
    "Período: 07/08/2026 a 25/09/2026",
    "",
    "Data Lançamento,Data Contábil,Título,Descrição,Entrada(R$),Saída(R$),Saldo do Dia(R$)",
    "08/08/2026,08/08/2026,\"DEBITO DE CARTAO \",ATILA LIMA FORTALEZA BRA,0.00,14.00,1000.00  ",
    "09/08/2026,09/08/2026,Pix enviado para RESERVE IMOBILIARIA,Aluguel agosto,0.00,454.16,545.84  ",
    "10/08/2026,10/08/2026,Pix recebido de WELLNESS SERVICES,Pix recebido de WELLNESS SERVICES,345.00,0.00,890.84  ",
    "11/08/2026,11/08/2026,Pix enviado para J R ESTACIONAMENTO LTDA,TRANSF ENVIADA PIX OB,0.00,17.50,873.34  ",
    "12/08/2026,12/08/2026,UNIMED FORTALEZA SOCIEDADE COOP,Boleto,0.00,1909.92,-1036.58  ",
  ].join("\n");

  it("é reconhecido, usa o detalhe nas compras no débito e anexa a mensagem do Pix", () => {
    expect(detectarPerfilCSV(extrato)).toEqual({ builtinKey: "c6-debito", nome: "C6 Bank — Extrato Débito" });
    const perfil: PerfilCompleto = { ...perfilCsv, delimitador: ",", builtin: "c6-debito" };
    expect(importar(extrato, "extrato.csv", perfil, new Map(), null).map(({ descricao, valor }) => ({ descricao, valor }))).toEqual([
      { descricao: "ATILA LIMA FORTALEZA BRA", valor: -14 },
      { descricao: "Pix enviado para RESERVE IMOBILIARIA · Aluguel agosto", valor: -454.16 },
      { descricao: "Pix recebido de WELLNESS SERVICES", valor: 345 },
      { descricao: "Pix enviado para J R ESTACIONAMENTO LTDA", valor: -17.5 },
      { descricao: "UNIMED FORTALEZA SOCIEDADE COOP", valor: -1909.92 },
    ]);
  });

  it("não confunde com a fatura do cartão C6", () => {
    const fatura = "Data;Cartão;Final do Cartão;Categoria;Descrição;Parcela;Valor (em US$);Cotação (em R$);Valor (em R$)";
    expect(detectarPerfilCSV(fatura).builtinKey).toBe("c6-cartao-csv");
  });
});

describe("fatura de cartão em OFX (Nubank)", () => {
  // Estrutura real do arquivo "Nubank_AAAA-MM-DD.ofx", com dados fictícios
  const fatura = [
    "OFXHEADER:100", "DATA:OFXSGML", "<OFX>",
    "<SIGNONMSGSRSV1><SONRS><FI><ORG>NU PAGAMENTOS S.A.</ORG><FID>260</FID></FI></SONRS></SIGNONMSGSRSV1>",
    "<CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><BANKTRANLIST>",
    "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260902000000[-3:BRT]<TRNAMT>-22.45<MEMO>STREAMING XYZ</STMTTRN>",
    "<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260828000000[-3:BRT]<TRNAMT>208.26<MEMO>Pagamento recebido</STMTTRN>",
    "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260810000000[-3:BRT]<TRNAMT>-313.08<MEMO>Valor pendente do mês anterior</STMTTRN>",
    "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260803000000[-3:BRT]<TRNAMT>-195.05<MEMO>Loja X - NuPay - Parcela 3/4</STMTTRN>",
    "</BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>",
  ].join("\n");
  const conta = fatura.replace("<CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS>", "<BANKMSGSRSV1><STMTTRNRS><STMTRS>")
    .replace("</CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1>", "</STMTRS></STMTTRNRS></BANKMSGSRSV1>");

  it("é identificada como fatura, não como conta corrente", () => {
    expect(detectarBancoOFX(fatura).builtinKey).toBe("nubank-cartao-ofx");
    expect(detectarBancoOFX(conta).builtinKey).toBe("nubank-corrente-ofx");
  });

  it("descarta o saldo carregado e marca o pagamento como pagamento do cartão", () => {
    const perfil: PerfilCompleto = { ...perfilCsv, formato: "ofx", conta: "Nubank Crédito", usaMesReferencia: true, builtin: "nubank-cartao-ofx" };
    const itens = importar(fatura, "Nubank_2026-09-10.ofx", perfil, new Map(), new Date(2026, 8, 1));
    expect(itens.map(({ descricao, valor, categoria }) => ({ descricao, valor, categoria }))).toEqual([
      { descricao: "STREAMING XYZ", valor: -22.45, categoria: "" },
      { descricao: "Pagamento recebido", valor: 208.26, categoria: "Pagamento de Cartão de Crédito" },
      { descricao: "Loja X - NuPay - Parcela 3/4", valor: -195.05, categoria: expect.any(String) },
    ]);
    expect(itens.every((l) => l.mesReferencia.getMonth() === 8)).toBe(true);
  });
});

describe("Pix para as próprias contas", () => {
  it("reconhece as grafias do nome como transferência entre contas", async () => {
    const { mapearCategoria } = await import("../categorias");
    for (const d of ["Pix recebido de GERSON V ALBUQUERQUE NT", "Pix recebido de Gerson Vieira Albuquerque Neto", "Pix enviado para GERSON NETO · transferência entre contas"]) {
      expect(mapearCategoria(d, "", "Entrada"), d).toBe("Transferência entre Contas");
    }
  });
});

describe("CSV do Nubank", () => {
  const fatura = "date,title,amount\n2026-09-02,Streaming XYZ,22.45\n2026-08-28,Pagamento recebido,-208.26\n2026-08-20,Loja Y,-15.00";
  const conta = "Data,Valor,Identificador,Descrição\n03/09/2026,-22.45,abc-1,Pagamento de fatura\n06/09/2026,68000.00,abc-2,Transferência recebida pelo Pix - FULANO";

  it("reconhece fatura e conta pelo cabeçalho", () => {
    expect(detectarPerfilCSV(fatura).builtinKey).toBe("nubank-credito");
    expect(detectarPerfilCSV(conta).builtinKey).toBe("nubank-debito");
  });

  it("fatura usa o mês informado, inverte o sinal e ignora o pagamento", () => {
    const perfil: PerfilCompleto = { ...perfilCsv, delimitador: ",", usaMesReferencia: true, builtin: "nubank-credito" };
    const itens = importar(fatura, "qualquer-nome.csv", perfil, new Map(), new Date(2026, 8, 1));
    expect(itens.map(({ descricao, valor }) => ({ descricao, valor }))).toEqual([
      { descricao: "Streaming XYZ", valor: -22.45 },
      { descricao: "Loja Y", valor: 15 },
    ]);
    expect(itens.every((l) => l.mesReferencia.getMonth() === 8 && l.conta === "Nubank Crédito")).toBe(true);
  });

  it("conta lê data BR e valor com sinal", () => {
    const perfil: PerfilCompleto = { ...perfilCsv, delimitador: ",", builtin: "nubank-debito" };
    const itens = importar(conta, "NU_x.csv", perfil, new Map(), null);
    expect(itens.map(({ descricao, valor, conta }) => ({ descricao, valor, conta }))).toEqual([
      { descricao: "Pagamento de fatura", valor: -22.45, conta: "Nubank Débito" },
      { descricao: "Transferência recebida pelo Pix - FULANO", valor: 68000, conta: "Nubank Débito" },
    ]);
  });
});

describe("formatos atuais dos CSV (arquivos reais de 09/2026, dados fictícios)", () => {
  it("fatura Nubank com vírgula decimal e sinal separado", () => {
    const fatura = 'date,title,amount\n2026-09-02,Streaming XYZ,"22,45"\n2026-08-28,Pagamento recebido,"- 208,26"\n' +
      '2026-08-14,Juros por fatura atrasada,"5,62"\n2026-08-10,Valor pendente do mês anterior,"313,08"\n2026-08-05,Estorno Loja,"- 10,00"';
    const perfil: PerfilCompleto = { ...perfilCsv, delimitador: ",", usaMesReferencia: true, builtin: "nubank-credito" };
    expect(importar(fatura, "Nubank_2026-09-10.csv", perfil, new Map(), new Date(2026, 8, 1))
      .map(({ descricao, valor, categoria }) => ({ descricao, valor, categoria }))).toEqual([
      { descricao: "Streaming XYZ", valor: -22.45, categoria: "" },
      { descricao: "Juros por fatura atrasada", valor: -5.62, categoria: "Taxas e Anuidades" },
      { descricao: "Estorno Loja", valor: 10, categoria: "Estorno" },
    ]);
  });

  it("extrato BB em Latin-1: junta tipo e detalhe, descarta saldos", async () => {
    const { decodificarTexto } = await import("./arquivo");
    const csv = [
      '"Data","Lançamento","Detalhes","N° documento","Valor","Tipo Lançamento"',
      '"28/08/2026","Saldo Anterior","","","0,00",""',
      '"08/09/2026","Recebimento de Proventos","EMPRESA X","4505","176,55","Entrada"',
      '"08/09/2026","BB Rende Fácil","Rende Facil","9903","-187,85","Saída"',
      '"08/09/2026","Saldo do dia","","","0,00",""',
      '"24/09/2026","TED","336 0001 123 GERSON VIEIRA ALB","92402","-1.800,00","Saída"',
      '"28/09/2026","S A L D O","","","0,00",""',
    ].join("\n");
    const texto = decodificarTexto(Buffer.from(csv, "latin1"));
    expect(detectarPerfilCSV(texto).builtinKey).toBe("bb-corrente-csv");
    const perfil: PerfilCompleto = { ...perfilCsv, delimitador: ",", conta: "BB Corrente", builtin: "bb-corrente-csv" };
    expect(importar(texto, "bb.csv", perfil, new Map(), null).map(({ descricao, valor, categoria }) => ({ descricao, valor, categoria }))).toEqual([
      { descricao: "Recebimento de Proventos · EMPRESA X", valor: 176.55, categoria: "Outras Entradas" },
      { descricao: "BB Rende Fácil · Rende Facil", valor: -187.85, categoria: "Transferência entre Contas" },
      { descricao: "TED · 336 0001 123 GERSON VIEIRA ALB", valor: -1800, categoria: "Transferência entre Contas" },
    ]);
  });
});

describe("extrato da conta Nubank (formato real)", () => {
  it("mantém vírgulas na descrição e categoriza aplicação RDB", () => {
    const csv = "Data,Valor,Identificador,Descrição\n06/09/2026,-10000.00,id-1,Aplicação RDB\n" +
      "10/09/2026,-60.45,id-2,Compra no débito - LOJA X, UNIDADE 2";
    const perfil: PerfilCompleto = { ...perfilCsv, delimitador: ",", builtin: "nubank-debito" };
    expect(importar(csv, "NU.csv", perfil, new Map(), null).map(({ descricao, categoria }) => ({ descricao, categoria }))).toEqual([
      { descricao: "Aplicação RDB", categoria: "Investimentos (Aportes)" },
      { descricao: "Compra no débito - LOJA X, UNIDADE 2", categoria: "" },
    ]);
  });
});

describe("Memória Local ignora data, hora e parcela", () => {
  it("uma regra aprendida vale para todas as variações", async () => {
    const { chaveMemoria, mapearCategoria } = await import("../categorias");
    expect(chaveMemoria("99* POP 25Set 13h37min SP            BRA")).toBe(chaveMemoria("99* POP 01Out 08h05min SP            BRA"));
    expect(chaveMemoria("Pix - Enviado · 19/09 12:51 FULANO DE TAL")).toBe("pix - enviado · fulano de tal");
    expect(chaveMemoria("Amazon BR VI - NuPay - Parcela 3/4")).toBe(chaveMemoria("Amazon BR VI - NuPay - Parcela 4/4"));
    expect(chaveMemoria("LOJA X (2/10)")).toBe("loja x");
    expect(chaveMemoria("Pix enviado para PADARIA 2000")).toBe("pix enviado para padaria 2000");

    const memoria = new Map([[chaveMemoria("Pix - Enviado · 19/09 12:51 FULANO DE TAL"), "Serviços Domésticos"]]);
    expect(mapearCategoria("Pix - Enviado · 03/10 09:12 FULANO DE TAL", "", "Saída", memoria)).toBe("Serviços Domésticos");
    expect(mapearCategoria("99* POP 22Set 13h53min SP BRA", "", "Saída")).toBe("Transporte por App");
  });
});

describe("categorização: chave do estabelecimento, histórico e regras", () => {
  it("o mesmo estabelecimento cai na mesma chave em qualquer banco e formato", async () => {
    const { chaveMemoria } = await import("../categorias");
    expect(chaveMemoria("MK ALDEOTA             FORTALEZA     BRA")).toBe("mk aldeota");
    expect(chaveMemoria("99* POP 25Set 13h37min SP            BRA")).toBe("99* pop");
    expect(chaveMemoria("Pix no Crédito - CATA ALENTO EDUCACAO")).toBe("cata alento educacao");
    expect(chaveMemoria("Compra no débito - ATILA LIMA")).toBe("atila lima");
    expect(chaveMemoria("Amazon BR VI - NuPay - Parcela 1/4")).toBe("amazon br vi");
    expect(chaveMemoria("GRAN EDUCACAO (6/12)")).toBe(chaveMemoria("GRAN EDUCACAO (1/12)"));
    // nome com número continua inteiro; linha fora da largura fixa do C6 não é cortada
    expect(chaveMemoria("Pix enviado para PADARIA 2000")).toBe("pix enviado para padaria 2000");
    expect(chaveMemoria("LOJA BRA")).toBe("loja bra");
  });

  it("histórico só vale com 75% das vezes na mesma categoria e nunca sugere o coringa", async () => {
    const { montarHistorico, chaveHistorico } = await import("../categorias");
    const h = montarHistorico([
      { descricao: "PADARIA X", tipo: "Saída", categoria: "Supermercado e Mercearia", n: 3 },
      { descricao: "PADARIA X", tipo: "Saída", categoria: "Restaurantes e Lanches", n: 1 },
      { descricao: "LOJA Y (1/2)", tipo: "Saída", categoria: "Compras", n: 1 },
      { descricao: "LOJA Y (2/2)", tipo: "Saída", categoria: "Presentes", n: 1 },
      { descricao: "Pix enviado para FULANO", tipo: "Saída", categoria: "Transferência para Terceiros", n: 5 },
      { descricao: "Pix recebido de FULANO", tipo: "Entrada", categoria: "Transferência Recebida", n: 1 },
    ]);
    expect(h.get(chaveHistorico("Saída", "PADARIA X"))).toBe("Supermercado e Mercearia");
    expect(h.has(chaveHistorico("Saída", "LOJA Y"))).toBe(false);
    expect(h.has(chaveHistorico("Saída", "Pix enviado para FULANO"))).toBe(false);
    expect(h.has(chaveHistorico("Saída", "Pix recebido de FULANO"))).toBe(false); // entrada e saída separadas
  });

  it("ordem: Memória → delivery → histórico → regras", async () => {
    const { categorizarComOrigem, chaveMemoria, chaveHistorico } = await import("../categorias");
    const fonte = {
      memoria: new Map([[chaveMemoria("LOJA Z"), "Presentes"]]),
      historico: new Map([
        [chaveHistorico("Saída", "LOJA Z"), "Compras"],
        [chaveHistorico("Saída", "CHOPP TO GO DELIVERY D"), "Restaurantes e Lanches"],
        [chaveHistorico("Saída", "DROGASIL 2460"), "Compras"],
      ]),
    };
    expect(categorizarComOrigem("LOJA Z", "", "Saída", fonte)).toEqual({ categoria: "Presentes", origem: "memoria" });
    expect(categorizarComOrigem("CHOPP TO GO DELIVERY D (2/2)", "", "Saída", fonte)).toEqual({ categoria: "Delivery e iFood", origem: "regra" });
    expect(categorizarComOrigem("DROGASIL 2460 (2/2)", "", "Saída", fonte)).toEqual({ categoria: "Compras", origem: "historico" });
    expect(categorizarComOrigem("Drogasil", "", "Saída", fonte)).toEqual({ categoria: "Farmácia", origem: "regra" });
    expect(categorizarComOrigem("IFOOD CLUB", "", "Saída", fonte).categoria).toBe("Assinaturas Digitais");
  });

  it("regras para os formatos que escapavam", async () => {
    const { mapearCategoria } = await import("../categorias");
    const casos: [string, string][] = [
      ["POP 13AGO 17H41MIN", "Transporte por App"],
      ["PARKFOR IMPRENSA       FORTALEZA     BRA", "Automóvel"],
      ["MP *NONREPARK          FORTALEZA     BRA", "Automóvel"],
      ["ANCAR NORDESTE ESTACIO FORTALEZA     BRA", "Automóvel"],
      ["Zé Delivery - NuPay", "Delivery e iFood"],
      ["Rezza Pizzaria", "Restaurantes e Lanches"],
      ["Churrascaria Chimarra", "Restaurantes e Lanches"],
      ["RESTAURANTES DEL PRIMO FORTALEZA     BRA", "Restaurantes e Lanches"],
      ["DROGASIL 2460          FORTALEZA     BRA", "Farmácia"],
      ["Sams Club Fortalez", "Supermercado e Mercearia"],
      ["MERCADOLIVRE*MERCADOL (2/3)", "Compras"],
      ["Amazon BR VI - NuPay - Parcela 1/4", "Compras"],
      ["Amazon Prime Canais", "Assinaturas Digitais"],
      ["Br1*Preffortaleza", "Impostos e Tributos"],
      ["Recorrência Pix enviada para FULANO DE TAL", "Transferência para Terceiros"],
      ["Pix enviado para FULANO DE TAL · Emprestimo", "Empréstimo"],
    ];
    for (const [d, esperado] of casos) expect(mapearCategoria(d, "", "Saída"), d).toBe(esperado);
    expect(mapearCategoria("Pix enviado para IFOOD.COM AGENCIA DE RESTAURANTES ONLINE S.A.", "", "Saída")).toBe("Delivery e iFood");
    for (const d of ["PARKSHOPPING", "Pix enviado para PARK ALIMENTACOES", "ALPEN PARK"])
      expect(mapearCategoria(d, "", "Saída"), d).not.toBe("Automóvel");
  });
});

describe("fatura C6 em CSV no formato antigo (; e Valor em US$)", () => {
  const cabecalho = "Data de Compra;Nome no Cartão;Final do Cartão;Categoria;Descrição;Parcela;Valor (em US$);Cotação (em R$);Valor (em R$)";
  const linhas = [
    cabecalho,
    "12/03/2026;FULANO DE TAL;6906;Educacional;GRAN EDUCACAO;3/12;0;0;54.90",
    "03/06/2026;FULANO DE TAL;6906;-;\"Encargos                 \";Única;0;0;53.34",
  ].join("\r\n");

  it("é reconhecida tanto em UTF-8 quanto em Latin-1", async () => {
    const { decodificarBytes } = await import("./decodificar");
    const { detectarPerfilCSV } = await import("./detectar");
    const utf8 = new TextEncoder().encode(linhas);
    const latin1 = Uint8Array.from([...linhas].map((c) => c.charCodeAt(0)));
    expect(detectarPerfilCSV(decodificarBytes(utf8)).builtinKey).toBe("c6-cartao-csv");
    expect(detectarPerfilCSV(decodificarBytes(latin1)).builtinKey).toBe("c6-cartao-csv");
    expect(decodificarBytes(utf8)).toContain("Final do Cartão");
  });
});
