import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), findFirst: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { conta: { findMany: mocks.findMany, findFirst: mocks.findFirst } } }));

import { bancoTipoDoPerfil, padronizarConta, resolverConta } from "./contas";

describe("destino das importações (banco + tipo)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sem conta desse banco e tipo: vai para a padrão (criada quando os lançamentos chegam)", async () => {
    mocks.findMany.mockResolvedValue([]);
    expect(await resolverConta("ana@example.com", "nubank", "cartao")).toEqual({ ok: true, nome: "Nubank · Crédito" });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "ana@example.com", banco: "nubank", tipo: "cartao" } }));
  });

  it("uma conta: usa essa; duas (apelidos): exige escolher entre elas", async () => {
    mocks.findMany.mockResolvedValue([{ nome: "Nubank · Crédito" }]);
    expect(await resolverConta("ana@example.com", "nubank", "cartao")).toEqual({ ok: true, nome: "Nubank · Crédito" });

    mocks.findMany.mockResolvedValue([{ nome: "Nubank · Crédito" }, { nome: "Nubank · Crédito · final 1234" }]);
    expect(await resolverConta("ana@example.com", "nubank", "cartao")).toEqual({ ok: false, opcoes: ["Nubank · Crédito", "Nubank · Crédito · final 1234"] });
    expect(await resolverConta("ana@example.com", "nubank", "cartao", "Nubank · Crédito · final 1234")).toEqual({ ok: true, nome: "Nubank · Crédito · final 1234" });
    // não dá para mandar para uma conta de outro banco/tipo
    expect((await resolverConta("ana@example.com", "nubank", "cartao", "BB · Débito")).ok).toBe(false);
  });

  it("perfil sem banco gravado é lido pelo nome da conta", () => {
    expect(bancoTipoDoPerfil({ banco: null, tipoConta: null, conta: "Bradesco cartão" })).toEqual({ banco: "bradesco", tipo: "cartao" });
    expect(bancoTipoDoPerfil({ banco: "nubank", tipoConta: "corrente", conta: "x" })).toEqual({ banco: "nubank", tipo: "corrente" });
  });

  it("nome digitado vira o padrão; nome que já existe no registro fica", async () => {
    mocks.findFirst.mockResolvedValue(null);
    expect((await padronizarConta("ana@example.com", "Carteira")).conta).toBe("Outro · Carteira");
    expect((await padronizarConta("ana@example.com", "Bradesco cartão")).conta).toBe("Bradesco · Crédito");
    mocks.findFirst.mockResolvedValue({ nome: "Nubank · Crédito · final 1234", banco: "nubank", tipo: "cartao" });
    expect(await padronizarConta("ana@example.com", "Nubank · Crédito · final 1234")).toEqual({ conta: "Nubank · Crédito · final 1234", banco: "nubank", tipoConta: "cartao" });
  });
});
