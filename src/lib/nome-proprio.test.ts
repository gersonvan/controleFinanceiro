import { describe, expect, it } from "vitest";
import { ehNomeProprio } from "./nome-proprio";

const NOME = "Maria Clara de Souza Neto";

describe("ehNomeProprio", () => {
  it.each([
    "Pix enviado para MARIA NETO",
    "Pix enviado para Maria Clara de Souza Neto",
    "TED · 336 0001 89523822349 MARIA CLARA SOU",
    "Pix recebido de MARIA C SOUZA NT",
    "Envio de transferência via PIX - Para MARIA XXXXXX XXXXXXXXXXX NETO",
    "Transferência recebida pelo Pix - MÁRIA CLARA SOUZA NETO - •••.238.223-•• - BCO C6 S.A.",
  ])("reconhece %s", (d) => expect(ehNomeProprio(d, NOME)).toBe(true));

  it.each([
    "WELLHUB MARIA CLARA",                              // cobrança em nome dela: só primeiro + meio
    "Pix enviado para ANA · Viagem Maria e Pedro",      // só o primeiro nome
    "Pix recebido de PEDRO CLARA SOUZA · Maria",        // mesma família, outra pessoa
    "Pix enviado para MARIA SILVA",                     // xará
  ])("não confunde %s", (d) => expect(ehNomeProprio(d, NOME)).toBe(false));

  it("sem nome informado (ou só o primeiro) não reconhece nada", () => {
    expect(ehNomeProprio("Pix enviado para MARIA NETO", "")).toBe(false);
    expect(ehNomeProprio("Pix enviado para MARIA NETO", "Maria")).toBe(false);
  });
});
