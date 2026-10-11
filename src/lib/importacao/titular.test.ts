import { describe, expect, it } from "vitest";
import { documentoDeOutraPessoa, nomeParaConferir, titularDoDocumento } from "./titular";

// layouts reais, dados fictícios
const nomad = [
  "Resumo da sua fatura",
  "Fulana Paiva De Tal **** **** **** 0001",
  "Nome: Fulana Paiva De Tal",
  "Cartão: **** **** **** 0001 VISA",
  "28/08/2026 PIX RECEBIDO DE CICLANO SOUZA R$ 90,00",
].join("\n");

describe("titular do documento", () => {
  it("lê o nome depois do rótulo e para antes de número/cartão", () => {
    expect(titularDoDocumento(nomad)).toBe("Fulana Paiva De Tal");
    expect(titularDoDocumento("Titular: CICLANO DE SOUZA 123.456.789-00")).toBe("CICLANO DE SOUZA");
    expect(titularDoDocumento("Cliente:  Beltrana Lima\nAgência 1")).toBe("Beltrana Lima");
    // rótulo de outra coisa não é titular
    expect(titularDoDocumento("Nome do favorecido: LOJA X")).toBeNull();
    expect(titularDoDocumento("Nome: Fulana")).toBeNull(); // uma palavra só não basta
  });

  it("titular diferente: avisa com o nome; o mesmo (sem acento, maiúsculo), não", () => {
    expect(documentoDeOutraPessoa(nomad, "pdf", "Ciclano Souza")).toEqual({ nome: "Fulana Paiva De Tal" });
    expect(documentoDeOutraPessoa(nomad, "pdf", "Fulána de Tal")).toBeNull();
  });

  it("o titular manda: o nome do usuário num Pix não faz o documento ser dele", () => {
    expect(documentoDeOutraPessoa(nomad, "pdf", "Ciclano")).toEqual({ nome: "Fulana Paiva De Tal" });
  });

  it("sem titular: em PDF, o primeiro nome do usuário tem de aparecer; OFX/CSV não são conferidos", () => {
    const pdf = "Olá, Fulana\nFatura de setembro\n05/09 LOJA 10,00";
    expect(documentoDeOutraPessoa(pdf, "pdf", "Fulana de Tal")).toBeNull();
    expect(documentoDeOutraPessoa(pdf, "pdf", "Ciclano")).toEqual({ nome: null });
    expect(documentoDeOutraPessoa("date,title,amount\n2026-09-01,LOJA,10", "csv", "Ciclano")).toBeNull();
    expect(documentoDeOutraPessoa("<OFX><MEMO>LOJA</MEMO>", "ofx", "Ciclano")).toBeNull();
    // "Ana" não casa dentro de "Banana"
    expect(documentoDeOutraPessoa("Banana nanica 10,00", "pdf", "Ana")).toEqual({ nome: null });
  });

  it("sem nome do usuário não há o que conferir; o dos extratos vem antes do de exibição", () => {
    expect(documentoDeOutraPessoa(nomad, "pdf", "")).toBeNull();
    expect(nomeParaConferir({ nomeCompleto: "Fulana de Tal", nome: "Fu" })).toBe("Fulana de Tal");
    expect(nomeParaConferir({ nomeCompleto: "", nome: "Fulana" })).toBe("Fulana");
    expect(nomeParaConferir(null)).toBe("");
  });
});
