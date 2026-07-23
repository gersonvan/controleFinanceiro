import { describe, expect, it } from "vitest";
import { dadosAtualizaveisDoUsuario, dadosDoUsuario, escopoDoUsuario } from "./tenant";

describe("escopoDoUsuario", () => {
  it("acrescenta o usuário autenticado ao filtro", () => {
    expect(escopoDoUsuario("ana@example.com", { categoria: "Alimentação" })).toEqual({
      categoria: "Alimentação",
      userId: "ana@example.com",
    });
  });

  it("rejeita filtro que tente trocar o tenant", () => {
    expect(() => escopoDoUsuario("ana@example.com", { userId: "bia@example.com" }))
      .toThrow("outro usuário");
  });
});

describe("dadosDoUsuario", () => {
  it("atribui o tenant autenticado aos dados criados", () => {
    expect(dadosDoUsuario("ana@example.com", { descricao: "Mercado" })).toEqual({
      descricao: "Mercado",
      userId: "ana@example.com",
    });
  });

  it("rejeita dados para outro tenant", () => {
    expect(() => dadosDoUsuario("ana@example.com", { userId: "bia@example.com" }))
      .toThrow("outro usuário");
  });
});

describe("dadosAtualizaveisDoUsuario", () => {
  it("remove userId dos dados atualizáveis", () => {
    expect(dadosAtualizaveisDoUsuario("ana@example.com", {
      categoria: "Moradia",
      userId: "ana@example.com",
    })).toEqual({ categoria: "Moradia" });
  });
});
