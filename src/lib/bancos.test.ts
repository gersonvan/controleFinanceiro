import { describe, expect, it } from "vitest";
import { contaDoPerfilNativo, interpretarNomeAntigo, nomeDaConta } from "./bancos";

const nome = (n: string, tipo?: "corrente" | "cartao") => nomeDaConta(interpretarNomeAntigo(n, tipo));

describe("bancos e nomes de conta", () => {
  it("monta o nome sempre igual", () => {
    expect(nomeDaConta({ banco: "nubank", tipo: "corrente", apelido: "" })).toBe("Nubank · Débito");
    expect(nomeDaConta({ banco: "nubank", tipo: "cartao", apelido: "final 1234" })).toBe("Nubank · Crédito · final 1234");
    expect(nomeDaConta({ banco: "outro", tipo: "corrente", apelido: "Carteira" })).toBe("Outro · Carteira");
  });

  it("perfil nativo diz banco e tipo pela chave", () => {
    expect(nomeDaConta(contaDoPerfilNativo("nubank-cartao-pdf"))).toBe("Nubank · Crédito");
    expect(nomeDaConta(contaDoPerfilNativo("nubank-credito"))).toBe("Nubank · Crédito");
    expect(nomeDaConta(contaDoPerfilNativo("nubank-corrente-ofx"))).toBe("Nubank · Débito");
    expect(nomeDaConta(contaDoPerfilNativo("itau-poupanca-ofx"))).toBe("Itaú · Débito · Poupança");
    expect(nomeDaConta(contaDoPerfilNativo("sofisa-extrato-pdf"))).toBe("Sofisa · Débito");
    expect(nomeDaConta(contaDoPerfilNativo("bb-cartao-ofx"))).toBe("BB · Crédito");
  });

  it("migra os nomes antigos: formatos diferentes do mesmo banco viram a mesma conta", () => {
    expect(nome("Nubank Débito")).toBe("Nubank · Débito");
    expect(nome("Nubank Conta")).toBe("Nubank · Débito");
    expect(nome("Nubank Crédito")).toBe("Nubank · Crédito");
    expect(nome("Nubank Cartão")).toBe("Nubank · Crédito");
    expect(nome("C6 Crédito")).toBe("C6 · Crédito");
    expect(nome("BB Corrente")).toBe("BB · Débito");
    expect(nome("BB Cartão")).toBe("BB · Crédito");
    expect(nome("Banco do Brasil")).toBe("BB · Débito");
    expect(nome("Itaú Poupança")).toBe("Itaú · Débito · Poupança");
    expect(nome("Sofisa")).toBe("Sofisa · Débito");
    expect(nome("Bradesco")).toBe("Bradesco · Débito");
    expect(nome("Carteira")).toBe("Outro · Carteira");
  });

  it("respeita o tipo que o usuário já escolheu e é idempotente", () => {
    expect(nome("Bradesco", "cartao")).toBe("Bradesco · Crédito");
    for (const n of ["Nubank · Débito", "Itaú · Débito · Poupança", "Outro · Carteira", "C6 · Crédito"]) expect(nome(n)).toBe(n);
  });
});
