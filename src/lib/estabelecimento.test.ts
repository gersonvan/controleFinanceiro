import { describe, expect, it } from "vitest";
import { nomeDoEstabelecimento, semRuido } from "./estabelecimento";
import { categorizarComOrigem, chaveMemoria, montarHistorico } from "./categorias";

describe("nomeDoEstabelecimento", () => {
  it.each([
    ["Pagamento de Boleto - FINANCEIRA TESTE  CREDITO - Data balanc.: 01", "FINANCEIRA TESTE CREDITO"],
    ["Pagamento de Boleto - FINANCEIRA TESTE  CREDITO - Data balanc.: 0", "FINANCEIRA TESTE CREDITO"],
    ["Pagamento de Boleto - ESCOLA FICTICIA INFANTIL LTDA - Data balanc", "ESCOLA FICTICIA INFANTIL"],
    ["Pagamento de Boleto - ESCOLA FICTICIA INFANTIL", "ESCOLA FICTICIA INFANTIL"],
    ["Pix - Enviado - 04/09 12:18 ESCOLA FICTICIA", "ESCOLA FICTICIA"],
    ["Pix - Enviado - 18/11 09:49 ESCOLA FICTICIA CRECHE - Data balanc.: 18/11/2025", "ESCOLA FICTICIA CRECHE"],
    ["Pix enviado para TIM S A", "TIM"],
    ["TIM SA", "TIM"],
    ["Transferência enviada pelo Pix - LOJA X S/A", "LOJA X"],
    ["MERCADO FICTICIO", "MERCADO FICTICIO"],
  ])("%s → %s", (entrada, esperado) => expect(nomeDoEstabelecimento(entrada)).toBe(esperado));

  it("não fica vazio quando a descrição é só o prefixo", () => {
    expect(nomeDoEstabelecimento("Pagamento de Boleto - ")).toBe("Pagamento de Boleto -");
  });

  it("na chave, o Pix mantém a direção (regra de enviado não vale para recebido)", () => {
    expect(semRuido("Pix - Enviado - 04/09 12:18 ESCOLA FICTICIA")).toBe("Pix enviado para ESCOLA FICTICIA");
    expect(chaveMemoria("Pix - Enviado - 04/09 12:18 ESCOLA FICTICIA")).toBe(chaveMemoria("Pix enviado para ESCOLA FICTICIA"));
    expect(chaveMemoria("Pix - Recebido - 04/09 12:18 MARIA TESTE")).not.toBe(chaveMemoria("Pix - Enviado - 04/09 12:18 MARIA TESTE"));
  });

  it("variações do mesmo boleto caem na mesma chave da Memória/histórico", () => {
    const chaves = new Set([
      "Pagamento de Boleto - ESCOLA FICTICIA INFANTIL",
      "Pagamento de Boleto - ESCOLA FICTICIA INFANTIL LTDA - Data balanc",
      "Pagamento de Boleto - ESCOLA FICTICIA INFANTIL - Data balanc.: 04",
    ].map(chaveMemoria));
    expect([...chaves]).toEqual(["escola ficticia infantil"]);
  });

  it("mesmo pagamento: a categoria de AYMORE vale para SANTANDER no histórico", () => {
    const aymore = "Pagamento de Boleto - FINANCEIRA A CREDITO - Data balanc.: 01";
    const santander = "Pagamento de Boleto - BANCO B SOCIEDADE DE CREDITO";
    const apelidos = new Map([[chaveMemoria(aymore), "Financiamento do carro"], [chaveMemoria(santander), "Financiamento do carro"]]);
    const historico = montarHistorico([{ descricao: aymore, tipo: "Saída", categoria: "Automóvel", n: 4 }], apelidos);
    expect(categorizarComOrigem(santander, "", "Saída", { memoria: new Map(), historico, apelidos }))
      .toEqual({ categoria: "Automóvel", origem: "historico" });
    // sem o agrupamento, nada liga os dois nomes
    expect(categorizarComOrigem(santander, "", "Saída", { memoria: new Map(), historico: montarHistorico([{ descricao: aymore, tipo: "Saída", categoria: "Automóvel", n: 4 }]) }).origem)
      .not.toBe("historico");
  });
});
