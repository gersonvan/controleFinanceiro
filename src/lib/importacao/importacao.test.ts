import { describe, expect, it } from "vitest";
import { parseCSVGenerico } from "./csv";
import {
  colunasDosPapeis, detectarBancoOFX, detectarFormato, detectarPerfilCSV, papeisDoPerfil, sugerirJuntarLinhas, sugerirPapeis,
} from "./detectar";
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

  it("o nome da coluna manda: Crédito/Débito, sem Docto. e Saldo; Detalhes é complemento", () => {
    const bradesco = [
      ["Extrato de: Ag: 1 | Conta: 2", "", "", "", "", ""],
      ["Data", "Histórico", "Docto.", "Crédito (R$)", "Débito (R$)", "Saldo (R$)"],
      ["25/09/2026", "PIX ENVIADO", "821336", " ", "200,00", "1.845,25"],
      ["26/09/2026", "DEP DINHEIRO ATM", "6906750", "1.900,00", " ", "3.745,25"],
    ];
    expect(sugerirPapeis(bradesco, 2)).toEqual(["data", "descricao", "", "entrada", "saida", ""]);

    const bb = [
      ["Data", "Lançamento", "Detalhes", "N° documento", "Valor", "Tipo Lançamento"],
      ["20/07/2026", "Transferência recebida", "18/07 22:43 FULANO DE TAL", "602925400006945", "170,79", "Entrada"],
      ["21/07/2026", "Pix - Enviado", "21/07 10:00 CICLANO", "1", "-50,00", "Saída"],
    ];
    expect(sugerirPapeis(bb, 1)).toEqual(["data", "descricao", "complemento", "", "valor", ""]);
  });

  it("papéis ↔ colunas do perfil, ida e volta", () => {
    const papeis = ["data", "descricao", "complemento", "", "entrada", "saida"] as const;
    const colunas = colunasDosPapeis([...papeis]);
    expect(colunas).toEqual({ colData: 0, colDescricao: 1, colComplemento: 2, colParcela: null, colValor: null, colEntrada: 4, colSaida: 5, modoValor: "separadas" });
    expect(papeisDoPerfil(colunas, 6)).toEqual([...papeis]);
    // coluna de valor guardada num perfil de colunas separadas não aparece
    expect(papeisDoPerfil({ ...colunas, colValor: 3 }, 6)).toEqual([...papeis]);
  });

  it("percebe a descrição em duas linhas (linha sem data, com texto e sem valor)", () => {
    const linhas = [
      ["Data", "Histórico", "Docto.", "Crédito (R$)", "Débito (R$)", "Saldo (R$)"],
      ["25/09/2026", "PIX ENVIADO", "1", "", "200,00", "1.845,25"],
      ["", "DES: FULANO 25/09", "", "", "", ""],
      ["26/09/2026", "PIX ENVIADO", "2", "", "50,00", "1.795,25"],
      ["", "DES: CICLANO 26/09", "", "", "", ""],
      ["", "", "Total", "0,00", "250,00", "1.795,25"],
    ];
    const papeis = sugerirPapeis(linhas, 1);
    expect(sugerirJuntarLinhas(linhas, 1, papeis)).toBe(true);
    expect(sugerirJuntarLinhas(linhas.filter((l) => !l[1].startsWith("DES")), 1, papeis)).toBe(false);
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

  it("coluna de complemento entra na descrição (\"Lançamento\" + \"Detalhes\")", () => {
    const itens = parseCSVGenerico(
      [
        '"Data","Lançamento","Detalhes","N° documento","Valor"',
        '"20/07/2026","Transferência recebida","18/07 22:43 FULANO DE TAL","6029","170,79"',
        '"21/07/2026","Pix - Enviado","Pix - Enviado","1","-50,00"', // complemento repetido não duplica
        '"22/07/2026","Tarifa pacote","","2","-35,00"',
      ].join("\n"),
      { ...perfilCsv, delimitador: ",", colDescricao: 1, colComplemento: 2, colValor: 4 },
      new Map(),
      null
    );
    expect(itens.map((i) => i.descricao)).toEqual(["Transferência recebida - 18/07 22:43 FULANO DE TAL", "Pix - Enviado", "Tarifa pacote"]);
  });

  it("linha sem data logo abaixo completa a descrição (e só quando o perfil pede)", () => {
    const texto = [
      "Data;Histórico;Docto.;Crédito (R$);Débito (R$);Saldo (R$)",
      "25/09/2026;PIX ENVIADO;821336; ;200,00;1.845,25",
      ";DES: FULANO DE TAL 25/09;;;;",
      "26/09/2026;COMPRA CARTAO;1; ;30,00;1.815,25",
      ";DROGASIL 2460;;;;",
      ";;;;;",
      "Últimos Lancamentos;;;;;",
      ";;Total;0,00;230,00;1.815,25;",
    ].join("\n");
    const bradesco = { ...perfilCsv, linhasPular: 1, colDescricao: 1, colValor: null, colEntrada: 3, colSaida: 4, modoValor: "separadas" as const };

    const juntando = parseCSVGenerico(texto, { ...bradesco, juntarLinhasSemData: true }, new Map(), null);
    expect(juntando.map(({ descricao, valor, categoria }) => ({ descricao, valor, categoria }))).toEqual([
      { descricao: "PIX ENVIADO - DES: FULANO DE TAL 25/09", valor: -200, categoria: expect.any(String) },
      // a categoria vem da descrição completa
      { descricao: "COMPRA CARTAO - DROGASIL 2460", valor: -30, categoria: "Farmácia" },
    ]);

    expect(parseCSVGenerico(texto, bradesco, new Map(), null).map((i) => i.descricao)).toEqual(["PIX ENVIADO", "COMPRA CARTAO"]);
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
    expect(detectarPerfilCSV(extrato)).toEqual({ builtinKey: "c6-debito", nome: "C6 — Extrato da Conta (CSV)" });
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

describe("fatura de cartão em OFX (Banco do Brasil e demais bancos)", () => {
  // Layout do OFX de fatura do BB (compras negativas; créditos positivos), dados fictícios
  const fatura = [
    "OFXHEADER:100", "DATA:OFXSGML", "<OFX>",
    "<SIGNONMSGSRSV1><SONRS><FI><ORG>Banco do Brasil</ORG><FID>001</FID></FI></SONRS></SIGNONMSGSRSV1>",
    "<CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><BANKTRANLIST>",
    "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20251005<TRNAMT>-89.90<MEMO>LOJA FICTICIA     SAO PAULO     BR</STMTTRN>",
    "<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20251010<TRNAMT>1500.00<MEMO>PGTO DEBITO CONTA 1234 000012345 200</STMTTRN>",
    "<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20251012<TRNAMT>39.90<MEMO>PG LOJA FICTICIA   0000000000 BR</STMTTRN>",
    "</BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>",
  ].join("\n");

  it("cada banco tem perfil de fatura em OFX; FID com ou sem zeros", () => {
    expect(detectarBancoOFX(fatura).builtinKey).toBe("bb-cartao-ofx");
    expect(detectarBancoOFX(fatura.replace("<FID>001", "<FID>0001")).builtinKey).toBe("bb-cartao-ofx");
    expect(detectarBancoOFX(fatura.replace("<FID>001", "<FID>").replace("Banco do Brasil", "Banco Itau S.A.")).builtinKey).toBe("itau-cartao-ofx");
    const conta = fatura.replace("<CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS>", "<BANKMSGSRSV1><STMTTRNRS><STMTRS>");
    expect(detectarBancoOFX(conta).builtinKey).toBe("bb-corrente-ofx");
  });

  it("parcela no formato do BB vira (NN/NN), que a Previsão reconhece", async () => {
    const { marcarParcela } = await import("./ofx");
    const { parcelaDe } = await import("../previsao");
    // os espaços ficam: a separação "LOJA   CIDADE   BR" é o que permite tirar a cidade da chave
    expect(marcarParcela("LOJA FICTICIA     -PARC 02/12 BR")).toBe("LOJA FICTICIA      (02/12) BR");
    expect(marcarParcela("LOJA 3463 PARC 01/03 FORTALEZA   BR")).toBe("LOJA 3463 (01/03) FORTALEZA   BR");
    expect(marcarParcela("LOJA FICTICIA 05/05 SAO PAULO   BR")).toBe("LOJA FICTICIA (05/05) SAO PAULO   BR");
    expect(parcelaDe(marcarParcela("LOJA FICTICIA 04/05 SAO PAULO   BR"))).toMatchObject({ atual: 4, total: 5 });
    // não inventa parcela: sem marcador, "parcela" 7/3 ou já no formato certo
    expect(marcarParcela("LOJA FICTICIA     SAO PAULO     BR")).toBe("LOJA FICTICIA     SAO PAULO     BR");
    expect(marcarParcela("LOJA 07/03 SAO PAULO BR")).toBe("LOJA 07/03 SAO PAULO BR");
    expect(marcarParcela("Loja X - Parcela 3/4")).toBe("Loja X - Parcela 3/4");
  });

  it("compra no cartão do BB: a cidade sai da chave, com ou sem parcela, como no C6", async () => {
    const { chaveMemoria } = await import("../categorias");
    // (o "SA" final sai junto, pela limpeza de razão social)
    expect(chaveMemoria("LOJAS FICTICIAS SA     SAO PAULO     BR")).toBe("lojas ficticias");
    expect(chaveMemoria("LOJAS FICTICIAS SA     FORTALEZA     BR")).toBe("lojas ficticias");
    expect(chaveMemoria("LOJA PARCELADA (02/12)    FORTALEZA     BR")).toBe("loja parcelada");
    expect(chaveMemoria("MK ALDEOTA             FORTALEZA     BRA")).toBe("mk aldeota"); // C6 continua
    expect(chaveMemoria("PADARIA  CENTRAL")).toBe("padaria central"); // 2 espaços sem país: não corta
  });

  it("Pix e boleto no formato do BB passam pelas regras (descrição limpa)", async () => {
    const { mapearCategoria } = await import("../categorias");
    expect(mapearCategoria("Pix - Enviado - 04/09 12:36 FULANO DE TAL", "", "Saída")).toBe("Transferência para Terceiros");
    expect(mapearCategoria("Pix - Recebido - 05/09 10:00 FULANO DE TAL", "", "Entrada")).toBe("Transferência Recebida");
    expect(mapearCategoria("Pagamento de Boleto - ENEL DISTRIBUICAO - Data balanc.: 03", "", "Saída")).toBe("Contas de Consumo");
    // o texto original ainda vem primeiro: "TIM S A" casa antes de o "S A" ser limpo
    expect(mapearCategoria("Pix enviado para TIM S A", "", "Saída")).toBe("Contas de Consumo");
  });

  it("extrato de conta do BB: pagamento da fatura, juros e conta de telefone", async () => {
    const { mapearCategoria } = await import("../categorias");
    expect(mapearCategoria("Pagto cartão crédito - ELO NANQUIM", "", "Saída")).toBe("Pagamento de Cartão de Crédito");
    expect(mapearCategoria("Cobrança de Juros - Juros Saldo Devedor Conta", "", "Saída")).toBe("Taxas e Anuidades");
    expect(mapearCategoria("Pagto conta telefone - VIVO CE", "", "Saída")).toBe("Contas de Consumo");
  });

  it("crédito na fatura não é renda: pagamento da fatura e estorno", () => {
    const perfil: PerfilCompleto = { ...perfilCsv, formato: "ofx", conta: "BB Cartão", usaMesReferencia: true, builtin: "bb-cartao-ofx" };
    const itens = importar(fatura, "fatura.ofx", perfil, new Map(), new Date(2025, 10, 1));
    expect(itens.map(({ valor, categoria }) => ({ valor, categoria }))).toEqual([
      { valor: -89.9, categoria: "" },
      { valor: 1500, categoria: "Pagamento de Cartão de Crédito" },
      { valor: 39.9, categoria: "Estorno" },
    ]);
    // no extrato da conta, o mesmo crédito seria uma entrada comum
    const conta = fatura.replace("<CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS>", "<BANKMSGSRSV1><STMTTRNRS><STMTRS>");
    expect(importar(conta, "conta.ofx", { ...perfil, usaMesReferencia: false, builtin: "bb-corrente-ofx" }, new Map(), null)[2].categoria).toBe("Outras Entradas");
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
  it("reconhece as grafias do nome do usuário como transferência entre contas", async () => {
    const { mapearCategoria } = await import("../categorias");
    const fonte = { memoria: new Map<string, string>(), nomeCompleto: "Maria Clara de Souza Neto" };
    for (const d of ["Pix recebido de MARIA C SOUZA NT", "Pix recebido de Maria Clara Souza Neto", "Pix enviado para MARIA NETO · transferência entre contas"]) {
      expect(mapearCategoria(d, "", "Entrada", fonte), d).toBe("Transferência entre Contas");
    }
    // o nome vem do perfil de cada usuário: sem ele (ou para outra pessoa), é um Pix comum
    expect(mapearCategoria("Pix recebido de MARIA NETO", "", "Entrada")).toBe("Transferência Recebida");
    expect(mapearCategoria("Pix recebido de MARIA NETO", "", "Entrada", { memoria: new Map(), nomeCompleto: "João Pedro Lima" })).toBe("Transferência Recebida");
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
    // a conta vem do perfil (lib/bancos.ts), não do leitor antigo
    const perfil: PerfilCompleto = { ...perfilCsv, conta: "Nubank · Crédito", delimitador: ",", usaMesReferencia: true, builtin: "nubank-credito" };
    const itens = importar(fatura, "qualquer-nome.csv", perfil, new Map(), new Date(2026, 8, 1));
    expect(itens.map(({ descricao, valor }) => ({ descricao, valor }))).toEqual([
      { descricao: "Streaming XYZ", valor: -22.45 },
      { descricao: "Loja Y", valor: 15 },
    ]);
    expect(itens.every((l) => l.mesReferencia.getMonth() === 8 && l.conta === "Nubank · Crédito")).toBe(true);
  });

  it("conta lê data BR e valor com sinal", () => {
    const perfil: PerfilCompleto = { ...perfilCsv, conta: "Nubank · Débito", delimitador: ",", builtin: "nubank-debito" };
    const itens = importar(conta, "NU_x.csv", perfil, new Map(), null);
    expect(itens.map(({ descricao, valor, conta }) => ({ descricao, valor, conta }))).toEqual([
      { descricao: "Pagamento de fatura", valor: -22.45, conta: "Nubank · Débito" },
      { descricao: "Transferência recebida pelo Pix - FULANO", valor: 68000, conta: "Nubank · Débito" },
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
      '"24/09/2026","TED","336 0001 123 MARIA CLARA SOU","92402","-1.800,00","Saída"',
      '"28/09/2026","S A L D O","","","0,00",""',
    ].join("\n");
    const texto = decodificarTexto(Buffer.from(csv, "latin1"));
    expect(detectarPerfilCSV(texto).builtinKey).toBe("bb-corrente-csv");
    const perfil: PerfilCompleto = { ...perfilCsv, delimitador: ",", conta: "BB Corrente", builtin: "bb-corrente-csv" };
    expect(importar(texto, "bb.csv", perfil, { memoria: new Map(), nomeCompleto: "Maria Clara de Souza Neto" }, null).map(({ descricao, valor, categoria }) => ({ descricao, valor, categoria }))).toEqual([
      { descricao: "Recebimento de Proventos · EMPRESA X", valor: 176.55, categoria: "Outras Entradas" },
      { descricao: "BB Rende Fácil · Rende Facil", valor: -187.85, categoria: "Transferência entre Contas" },
      { descricao: "TED · 336 0001 123 MARIA CLARA SOU", valor: -1800, categoria: "Transferência entre Contas" },
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

  it("descrição que só diz o tipo da transação não ensina o histórico", async () => {
    const { montarHistorico, chaveHistorico, descricaoGenerica } = await import("../categorias");
    for (const d of ["PIX ENVIADO", "PIX QR CODE DINAMICO", "PAGTO ELETRON  COBRANCA", "DEP DINHEIRO ATM", "TRANSF SALDO C/SAL P/CC", "TED 237 0001", "Pagamento de boleto"])
      expect(descricaoGenerica(d), d).toBe(true);
    for (const d of ["CREDITO DE SALARIO", "Pix enviado para FULANO", "PAGTO COBRANCA ESCOLA X", "DROGASIL 2460", "Tarifa bancária"])
      expect(descricaoGenerica(d), d).toBe(false);

    const linhas = [
      { descricao: "PIX ENVIADO", tipo: "Saída", categoria: "Presentes", n: 4 },
      { descricao: "PAGTO ELETRON COBRANCA", tipo: "Saída", categoria: "Empresa (PJ)", n: 2 },
      { descricao: "CREDITO DE SALARIO", tipo: "Entrada", categoria: "Salário", n: 1 },
    ];
    const h = montarHistorico(linhas);
    expect(h.has(chaveHistorico("Saída", "PIX ENVIADO"))).toBe(false);
    expect(h.has(chaveHistorico("Saída", "PAGTO ELETRON COBRANCA"))).toBe(false);
    expect(h.get(chaveHistorico("Entrada", "CREDITO DE SALARIO"))).toBe("Salário");
    // juntada pelo usuário num "mesmo pagamento", vale
    const apelidos = new Map([["pagto eletron cobranca", "Escola"]]);
    expect(montarHistorico(linhas, apelidos).get(chaveHistorico("Saída", "PAGTO ELETRON COBRANCA", apelidos))).toBe("Empresa (PJ)");
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
      ["PARKFOR IMPRENSA       FORTALEZA     BRA", "Estacionamento"],
      ["MP *NONREPARK          FORTALEZA     BRA", "Estacionamento"],
      ["ANCAR NORDESTE ESTACIO FORTALEZA     BRA", "Estacionamento"],
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
      ["Pix enviado para TIM S A", "Contas de Consumo"],
      ["GCI CAIXA  - HABITACAO", "Prestação de Imóvel"],
      ["CAIXA ECONOMICA FEDERAL - ENGENHARIA", "Compra e Venda de Bens"],
      ["SANTANDER SOC. CRED. FINANC. E", "Pagamento de Empréstimos"],
      ["Pix enviado para ZAMP S.A.", "Restaurantes e Lanches"],
      ["Pix enviado para VIBRA ENERGIA S.A", "Combustível"],
      ["Petrobras PremmiaRIO DE", "Combustível"],
      ["AUTO POSTO SAO JOSE     FORTALEZA     BRA", "Combustível"],
      ["IPIRANGA ABASTECE AI", "Combustível"],
      ["COND C *ESTACIONAMENTFO", "Estacionamento"],
      ["MP *PETROBRASPREM", "Combustível"],
      ["PREMMIA*BR", "Combustível"],
      ["MP *POSTOPALVES", "Combustível"],
      ["Pix enviado para POSTO EXEMPLO PETROLEO LTDA", "Combustível"],
      ["BIG PARK SHOPPING X", "Estacionamento"],
      ["BESTPARK", "Estacionamento"],
      ["ZUL 2 CARTOES 1P6GOB", "Estacionamento"],
      ["Compra no débito - ZUL 1 cartão 2DQOGA", "Estacionamento"],
      ["HC PNEUS ALDEOTA CE", "Automóvel"],
      ["Pix enviado para BOLSAKI EDUCACAO E TECNOLOGIA", "Mensalidades e Cursos"],
      ["PREFEITURA - ITBI 2026", "Compra e Venda de Bens"],
      ["Pix enviado para RESERVE IMOBILIARIA · comissão Apartamento Passaré imobiliária", "Compra e Venda de Bens"],
      ["TIM SA", "Contas de Consumo"],
      ["CLARO S.A.", "Contas de Consumo"],
      ["TELEFONICA BRASIL S A", "Contas de Consumo"],
    ];
    for (const [d, esperado] of casos) expect(mapearCategoria(d, "", "Saída"), d).toBe(esperado);
    expect(mapearCategoria("Pix enviado para IFOOD.COM AGENCIA DE RESTAURANTES ONLINE S.A.", "", "Saída")).toBe("Delivery e iFood");
    for (const d of ["PARKSHOPPING", "Pix enviado para PARK ALIMENTACOES", "ALPEN PARK"])
      expect(mapearCategoria(d, "", "Saída"), d).not.toBe("Estacionamento");
    // "posto" só como palavra: imposto não é combustível
    expect(mapearCategoria("PAGAMENTO IMPOSTO DE RENDA", "", "Saída")).not.toBe("Combustível");
    expect(mapearCategoria("CORREIOS POSTAGEM", "", "Saída")).not.toBe("Combustível");
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

describe("extrato do Sofisa (PDF)", () => {
  const texto = [
    "Banco Sofisa S.A. | Al. Santos, 1496 - São Paulo / SP",
    "www.sofisadireto.com.br",
    "Extrato do período de 01/01/2025 até 28/09/2026",
    "14/07/2025 Recebimento de transferência via PIX - De MARIA XXXXXX XXXXXXXXXXX NETO R$ 10.000,00",
    "14/07/2025 Saldo em 14/07/2025 R$ 10.000,00",
    "15/07/2025 Aplicação - Meus Investimentos - CDB DIRETO DI -R$ 10.000,00",
    "13/08/2025 Resgate Antecipado - Meus Investimentos - CDB DIRETO DI R$ 7.000,76",
    "13/08/2025 Envio de transferência via PIX - Para MARIA XXXXXX XXXXXXXXXXX NETO -R$ 7.000,76",
    "14/08/2026 Saldo em 14/08/2026 -R$ 0,01",
    "A - 26/09/2026 Saldo Disponível -R$ 0,01",
  ].join("\n");

  it("detecta o banco e lê entradas e saídas, sem as linhas de saldo", async () => {
    const { detectarBancoPDF, parseSofisa } = await import("./pdf");
    expect(detectarBancoPDF(texto).builtinKey).toBe("sofisa-extrato-pdf");
    // comprovante de aplicação/resgate não é extrato: não importa (duplicaria)
    const comprovante = "Sofisa Direto\nNovo Investimento\n15/07/2025 09:08 15/07/2028 105.00% do CDI CDB Direto DI Liquidez Diária R$ 10.000,00\nComprovante de Investimento";
    expect(detectarBancoPDF(comprovante).builtinKey).toBeNull();
    const perfil = { conta: "Sofisa", builtin: "sofisa-extrato-pdf" } as Parameters<typeof parseSofisa>[1];
    const ls = parseSofisa(texto, perfil, { memoria: new Map(), nomeCompleto: "Maria Clara de Souza Neto" });
    expect(ls.map((l) => [l.data.toISOString().slice(0, 10), l.valor, l.categoria])).toEqual([
      ["2025-07-14", 10000, "Transferência entre Contas"],
      ["2025-07-15", -10000, "Investimentos (Aportes)"],
      ["2025-08-13", 7000.76, "Investimentos (Aportes)"],
      ["2025-08-13", -7000.76, "Transferência entre Contas"],
    ]);
    expect(ls.every((l) => l.conta === "Sofisa" && l.mesReferencia.getUTCDate() === 1)).toBe(true);
  });
});

describe("Itaú (PDF)", () => {
  // Layout da exportação atual do app/internet banking do Itaú (pdf-parse v2)
  const extrato = [
    "saldo em conta Limite da Conta utilizado Limite da Conta disponível",
    "extrato conta / lançamentos",
    "período de visualização: 01/07/2026 até 31/07/2026",
    "data lançamentos valor (R$) saldo (R$)",
    "30/07/2026 PAGTO SALARIO 5.000,00",
    "30/07/2026 SALDO DO DIA 4.100,00",
    "29/07/2026 PIX TRANSF FULANO 29/07 150,00",
    "29/07/2026 PIX QRS PADARIA BO29/07 -20,00",
    "29/07/2026 PAG BOLETO NU PAGAMENTOS SA -300,00",
    "20/07/2026 FATURA PAGA Itau Uniclas -1.234,56",
    "20/07/2026 APLICACAO CDB DI -500,00",
    "20/07/2026 REND PAGO APLIC AUT MAIS 0,05",
    "20/07/2026 ITAU SEG VIDA PF 07/12 -71,74",
    "20/07/2026 INT /GPS 01091798211 -83,45",
    "01/07/2026 SALDO ANTERIOR 100,00",
    "Consulte a última versão das Condições Gerais da sua Conta em www.itau.com.br",
  ].join("\n");

  const fatura = [
    "Resumo da fatura em R$",
    "Total da fatura anterior 900,00",
    "Pagamento efetuado em 17/12/2025 -900,00",
    "Total desta fatura 480,00",
    "Vencimento: 17/01/2026",
    "Pagamentos efetuados",
    "DATA VALOR EM R$",
    "17/12 PAGAMENTO DEB AUTOMATIC -900,00",
    "Total dos pagamentos -900,00",
    "Lançamentos: compras e saques",
    "DATA ESTABELECIMENTO VALOR EM R$",
    "23/10 LOJA PARCELADA 03/06 100,00",
    "vestuário FORTALEZA",
    "18/12 HOTEL RESERVA 200,00",
    "outros SAO PAULO",
    "18/12 CANCELAMENTO DE COMPRA -200,00",
    "05/01 MERCADO 380,00",
    "Lançamentos no cartão 480,00",
    "Compras parceladas - próximas faturas",
    "DATA ESTABELECIMENTO VALOR EM R$",
    "23/10 LOJA PARCELADA 04/06 100,00",
    "Próxima fatura 100,00",
    "Consulte o site Itaú Cartões",
  ].join("\n");

  it("extrato da conta não é confundido com fatura Nubank por um boleto pago à Nu Pagamentos", async () => {
    const { detectarBancoPDF, parsePDF } = await import("./pdf");
    expect(detectarBancoPDF(extrato).builtinKey).toBe("itau-extrato-pdf");
    const ls = parsePDF(extrato, { conta: "Itaú Corrente", builtin: "itau-extrato-pdf" } as Parameters<typeof parsePDF>[1], new Map(), null);
    expect(ls.map((l) => [l.data.toISOString().slice(0, 10), l.descricao, l.valor, l.categoria])).toEqual([
      ["2026-07-30", "PAGTO SALARIO", 5000, "Salário"],
      ["2026-07-29", "PIX TRANSF FULANO 29/07", 150, "Transferência Recebida"],
      ["2026-07-29", "PIX QRS PADARIA BO 29/07", -20, ""],
      ["2026-07-29", "PAG BOLETO NU PAGAMENTOS SA", -300, ""],
      ["2026-07-20", "FATURA PAGA Itau Uniclas", -1234.56, "Pagamento de Cartão de Crédito"],
      ["2026-07-20", "APLICACAO CDB DI", -500, "Investimentos (Aportes)"],
      ["2026-07-20", "REND PAGO APLIC AUT MAIS", 0.05, "Rendimento Investimentos"],
      ["2026-07-20", "ITAU SEG VIDA PF 07/12", -71.74, "Seguros"],
      ["2026-07-20", "INT /GPS 01091798211", -83.45, "Impostos e Tributos"],
    ]);
    expect(ls.every((l) => l.mesReferencia.toISOString().startsWith("2026-07-01"))).toBe(true);
  });

  it("fatura: soma bate com o total, sem o pagamento anterior nem as parcelas futuras", async () => {
    const { detectarBancoPDF, parsePDF } = await import("./pdf");
    expect(detectarBancoPDF(fatura).builtinKey).toBe("itau-cartao-pdf");
    const ls = parsePDF(fatura, { conta: "Itaú Cartão", builtin: "itau-cartao-pdf" } as Parameters<typeof parsePDF>[1], new Map(), null);
    expect(ls.find((l) => l.valor > 0)?.categoria).toBe("Estorno");
    expect(ls.map((l) => [l.data.toISOString().slice(0, 10), l.descricao, l.valor])).toEqual([
      ["2025-10-23", "LOJA PARCELADA (03/06)", -100],
      ["2025-12-18", "HOTEL RESERVA", -200],
      ["2025-12-18", "CANCELAMENTO DE COMPRA", 200],
      ["2026-01-05", "MERCADO", -380],
    ]);
    expect(ls.reduce((a, l) => a + l.valor, 0)).toBe(-480);
    // sem mês informado, vale o vencimento impresso na fatura
    expect(ls.every((l) => l.mesReferencia.toISOString().startsWith("2026-01-01"))).toBe(true);
  });
});

describe("fatura Nomad (PDF)", () => {
  // Layout da fatura do cartão Nomad (emitido pela Afinz), pdf-parse v2 — dados fictícios
  const fatura = [
    "Outras formas de pagar sua fatura",
    "Pagamento mínimo do período:",
    "R$ 50,00",
    "Valor de entrada: R$ 120,00 +",
    "1x R$ 120,00",
    "Resumo da sua fatura",
    "Fulana De Tal **** **** **** 0001",
    "Saldo da fatura anterior R$ 6,83",
    "Pagamentos efetuados -R$ 6,83",
    "Despesas e créditos do mês R$ 253,29",
    "Extrato Referente ao mês de Setembro de 2026",
    "Cartão - Fulana De Tal **** **** **** 0002",
    "Data Descrição Valor",
    "28/08/2026 GOL LINHAEREAS S.A. Rio BR R$ 90,00",
    "29/08/2026 CAPSULA SHOP SAO PAULO (01/04) R$ 69,94",
    "19/09/2026 DISTRIBUIDORA DE ALIME FORTALEZA BR R$ 57,83",
    "19/09/2026 DISTRIBUIDORA DE ALIME FORTALEZA BR -R$ 57,83",
    "21/09/2026 PAGUE MENOS 0019 CE BR R$ 1.089,50",
    "22/09/2026 IOF SOBRE TRANSACAO INTERNACIONAL R$ 3,85",
    "Cartão - Fulana De Tal **** **** **** 0001",
    "Data Descrição Valor",
    "01/09/2026 PAGAMENTO DE FATURA - CNAB -R$ 6,83",
    "Taxas Taxa ao mês (%) Taxa ao ano (%) CET ao mês (%)",
    "Rotativo 13,99 391,90 14,79 423,16 13,99",
    "28/09/2026 0928023711 FT N 28/09/2026",
    "000 01 R$",
    "(11) 4200-0204 - support@nomadglobal.com",
  ].join("\n");

  it("é reconhecida antes do Itaú (boleto 341) e do Inter (\"internacional\")", () => {
    expect(detectarBancoPDF(fatura)).toEqual({ builtinKey: "nomad-cartao-pdf", bancoNome: "Nomad — Fatura do Cartão" });
  });

  it("compras viram gasto, estorno vira crédito; pagamento da fatura anterior, resumo e boleto ficam de fora", async () => {
    const { parsePDF } = await import("./pdf");
    const ls = parsePDF(fatura, { conta: "Nomad · Crédito", builtin: "nomad-cartao-pdf" } as Parameters<typeof parsePDF>[1], new Map(), new Date(2026, 9, 1));
    expect(ls.map((l) => [l.descricao, l.valor])).toEqual([
      ["GOL LINHAEREAS S.A. Rio BR", -90],
      ["CAPSULA SHOP SAO PAULO (01/04)", -69.94],
      ["DISTRIBUIDORA DE ALIME FORTALEZA BR", -57.83],
      ["DISTRIBUIDORA DE ALIME FORTALEZA BR", 57.83],
      ["PAGUE MENOS 0019 CE BR", -1089.5],
      ["IOF SOBRE TRANSACAO INTERNACIONAL", -3.85],
    ]);
    expect(ls[0].data).toEqual(new Date(2026, 7, 28));
    expect(ls.every((l) => l.mesReferencia.getTime() === new Date(2026, 9, 1).getTime() && l.fonte === "Importado Nomad (PDF)")).toBe(true);
  });
});

describe("extrato Bradesco (PDF do app Bradesco Celular)", () => {
  // layout real (pdf-parse v2), dados fictícios
  const cabecalho = (secao: string, folha: string) => [
    "Bradesco Celular", "Data: 11/10/2026 - 19h35", "Nome: FULANO DE TAL",
    `Extrato de: Agência: 1 | Conta: 2-3 | ${secao} Folha: ${folha}`,
    "Data Histórico Docto. Crédito (R$) Débito (R$) Saldo (R$)",
  ];
  const extrato = [
    ...cabecalho("Movimentação entre: 01/08/2026 e 11/10/2026", "1/2"),
    "31/07/2026 COD. LANC. 0 0,00 300,00",
    "02/08/2026 PIX RECEBIDO",
    "REM: CICLANO DE SOUZA 02/08 1634373 100,00 400,00",
    "COMPRA ELO DEBITO VISTA",
    "MERCADINHO SAO LUIZ 0500149 50,00 350,00",
    "PAGTO ELETRON COBRANCA",
    "BANCO C6 S.A. 0000450 1.000,00 650,00", // ficou negativo: o PDF perde o "-"
    "03/08/2026 RENTAB.INVEST FACILCRED* 3096128 0,01 649,99",
    "PIX RECEBIDO",
    "REM: EMPRESA X LTDA 03/08 1239048 1.000,00 350,01",
    "Total 1.100,01 1.050,00 350,01",
    "-- 1 of 2 --",
    ...cabecalho("Últimos Lancamentos", "2/2"),
    "03/08/2026 COD. LANC. 0 350,00",
    "RENTAB.INVEST FACILCRED* 3096128 0,01 350,01", // já veio no período
    "04/08/2026 PIX ENVIADO",
    "DES: BELTRANA LIMA 04/08 1130413 20,00 330,01",
    "Total 0,01 20,00 330,01",
    "-- 2 of 2 --",
  ].join("\n");

  it("é reconhecido pela estrutura, mesmo citando o C6 e \"cartão\" nos lançamentos", () => {
    expect(detectarBancoPDF(`${extrato}\nGASTOS CARTAO DE CREDITO`)).toEqual({ builtinKey: "bradesco-extrato-pdf", bancoNome: "Bradesco — Extrato da Conta" });
  });

  it("junta histórico e complemento, leva a data do dia e tira o sinal do saldo (inclusive negativo)", async () => {
    const { parsePDF } = await import("./pdf");
    const ls = parsePDF(extrato, { conta: "Bradesco · Débito", builtin: "bradesco-extrato-pdf" } as Parameters<typeof parsePDF>[1], new Map(), null);
    expect(ls.map((l) => [l.data.toISOString().slice(0, 10), l.descricao, l.valor])).toEqual([
      ["2026-08-02", "Pix recebido de CICLANO DE SOUZA", 100],
      ["2026-08-02", "Compra no débito - MERCADINHO SAO LUIZ", -50],
      ["2026-08-02", "Pagamento de boleto - BANCO C6 S.A.", -1000],
      ["2026-08-03", "RENTAB.INVEST FACILCRED*", 0.01],
      ["2026-08-03", "Pix recebido de EMPRESA X LTDA", 1000], // de -649,99 para 350,01
      ["2026-08-04", "Pix enviado para BELTRANA LIMA", -20], // o rendimento repetido nos últimos não entra de novo
    ]);
    expect(ls.every((l) => l.fonte === "Importado Bradesco (PDF)" && l.conta === "Bradesco · Débito")).toBe(true);
  });

  it("saldo final para a Reserva, depois dos últimos lançamentos", async () => {
    const { extrairSaldoFinal } = await import("./saldo");
    const s = extrairSaldoFinal(extrato);
    expect(s?.saldo).toBe(330.01);
    expect(s?.data.toISOString().slice(0, 10)).toBe("2026-08-04");
  });
});
