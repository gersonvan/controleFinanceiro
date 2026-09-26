import { describe, expect, it } from "vitest";
import { extrairSaldoFinal } from "./saldo";

const dia = (s: { data: Date } | null) => s?.data.toISOString().slice(0, 10);

describe("saldo final do extrato", () => {
  it("C6: última linha da coluna Saldo do Dia", () => {
    const t = [
      "﻿EXTRATO DE CONTA CORRENTE C6 BANK", "", "Agência: 1 / Conta: 170633756", "",
      "Data Lançamento,Data Contábil,Título,Descrição,Entrada(R$),Saída(R$),Saldo do Dia(R$)",
      "30/03/2026,30/03/2026,Pix enviado para J R,TRANSF ENVIADA PIX OB,0.00,17.50,506.09",
      "25/09/2026,25/09/2026,\"DEBITO DE CARTAO \",PADARIA IDEAL HERACLI  FORTALEZA     BRA,0.00,28.37,-301.91",
    ].join("\n");
    const s = extrairSaldoFinal(t);
    expect(s?.saldo).toBe(-301.91);
    expect(dia(s)).toBe("2026-09-25");
  });

  it("Bradesco: última linha com data e saldo", () => {
    const t = [
      "﻿Extrato de: Ag: 600 | Conta: 33798-6;;;;;",
      "Data;Histórico;Docto.;Crédito (R$);Débito (R$);Saldo (R$)",
      "18/09/2026;CREDITO DE SALARIO;3203;428,54; ;428,55",
      ";;;;;", "Últimos Lancamentos;;;;;",
      "Data;Histórico;Docto.;Crédito (R$);Débito (R$);",
      "24/09/2026;DEP DINHEIRO ATM;6906750;1.900,00; ;2.328,55",
      "25/09/2026;PIX ENVIADO;821336; ;200,00;1.845,25",
      ";;Total;1.900,00;483,30;1.845,25;",
    ].join("\n");
    const s = extrairSaldoFinal(t);
    expect(s?.saldo).toBe(1845.25);
    expect(dia(s)).toBe("2026-09-25");
  });

  it("BB: último \"Saldo do dia\" / \"S A L D O\"", () => {
    const t = [
      '"Data","Lançamento","Detalhes","N° documento","Valor","Tipo Lançamento"',
      '"28/08/2026","Saldo Anterior","","","150,00",""',
      '"25/09/2026","BB Rende Fácil","","9903","1.786,01","Entrada"',
      '"25/09/2026","Saldo do dia","","","0,00",""',
      '"28/09/2026","S A L D O","","","12,34",""',
    ].join("\n");
    const s = extrairSaldoFinal(t);
    expect(s?.saldo).toBe(12.34);
    expect(dia(s)).toBe("2026-09-28");
  });

  it("arquivo sem saldo (Nubank, fatura) devolve null", () => {
    expect(extrairSaldoFinal("Data,Valor,Identificador,Descrição\n01/09/2026,-10.00,x,Compra")).toBeNull();
    expect(extrairSaldoFinal("date,title,amount\n2026-09-01,Loja,10.00")).toBeNull();
  });
});
