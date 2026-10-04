import { describe, expect, it } from "vitest";
import { planejarMigracao } from "./migracao-contas";

describe("plano da migração de contas", () => {
  const estado = {
    lancamentosPorConta: new Map([["Nubank Débito", 300], ["Nubank Conta", 10], ["Nubank Crédito", 60], ["Sofisa", 28], ["Bradesco", 5]]),
    reservas: [{ id: 1, conta: "Sofisa" }, { id: 2, conta: "Nubank Débito" }, { id: 3, conta: null }],
    perfis: [
      { id: 10, builtin: "nubank-cartao-pdf", conta: "Nubank Cartão" },
      { id: 11, builtin: null, conta: "Bradesco" },
    ],
    contas: [{ nome: "Bradesco", tipo: "corrente" }, { nome: "Sofisa", tipo: "corrente" }],
  };

  it("formatos diferentes do mesmo banco viram uma conta só, com as contagens", () => {
    const p = planejarMigracao(estado);
    const debito = p.itens.filter((i) => i.novo === "Nubank · Débito");
    expect(debito.map((i) => i.antigo).sort()).toEqual(["Nubank Conta", "Nubank Débito"]);
    expect(debito.reduce((a, i) => a + i.lancamentos, 0)).toBe(310);
    expect(p.itens.find((i) => i.antigo === "Sofisa")).toMatchObject({ novo: "Sofisa · Débito", reservas: 1 });
    expect(p.contasFinais.map((c) => c.nome).sort()).toEqual(["Bradesco · Débito", "Nubank · Crédito", "Nubank · Débito", "Sofisa · Débito"]);
  });

  it("perfil nativo segue a chave; personalizado segue o nome da conta dele", () => {
    const p = planejarMigracao(estado);
    expect(p.perfis).toEqual([
      { id: 10, conta: "Nubank · Crédito", banco: "nubank", tipoConta: "cartao" },
      { id: 11, conta: "Bradesco · Débito", banco: "bradesco", tipoConta: "corrente" },
    ]);
  });

  it("respeita o tipo escolhido pelo usuário no registro de contas", () => {
    const p = planejarMigracao({ ...estado, contas: [{ nome: "Bradesco", tipo: "cartao" }] });
    expect(p.itens.find((i) => i.antigo === "Bradesco")!.novo).toBe("Bradesco · Crédito");
  });
});
