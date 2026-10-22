import { describe, expect, it } from "vitest";
import { dividirMes, fatiaDaCategoria, FORA_DA_DIVISAO } from "./fatias";
import { CATALOGO_PADRAO, montarCatalogo } from "./catalogo-categorias";
import { CATEGORIAS_SAIDA } from "./categorias";

const l = (valor: number, categoria: string | null) => ({ valor, categoria });

describe("50/30/20", () => {
  it("toda categoria nativa de gasto tem fatia, fica fora da divisão ou é o coringa do Pix", () => {
    const semLugar = CATEGORIAS_SAIDA.filter((c) => !fatiaDaCategoria(CATALOGO_PADRAO, c) && !FORA_DA_DIVISAO.has(c));
    expect(semLugar).toEqual(["Transferência para Terceiros"]);
  });

  it("divide a renda; o futuro é o aplicado mais o que ficou na conta", () => {
    const d = dividirMes([
      l(10000, "Salário"),
      l(-4000, "Aluguel"), l(-1000, "Supermercado e Mercearia"),
      l(-2000, "Restaurantes e Lanches"),
      l(-1500, "Investimentos (Aportes)"), l(500, "Investimentos (Aportes)"), // resgate abate o aplicado
      l(-300, "Transferência para Terceiros"), l(-200, null),                 // sem fatia
      l(-5000, "Pagamento de Cartão de Crédito"), l(3000, "Transferência entre Contas"), // fora
      l(150, "Estorno"), l(800, "Recebimento de Empréstimo"),                  // não são renda
    ], CATALOGO_PADRAO);
    expect(d.renda).toBe(10000);
    expect(d.necessidades).toMatchObject({ valor: 5000, percentual: 50 });
    expect(d.desejos).toMatchObject({ valor: 2000, percentual: 20 });
    expect(d.semFatia).toEqual({ valor: 500, categorias: [{ categoria: "Transferência para Terceiros", valor: 300 }, { categoria: "Sem categoria", valor: 200 }] });
    expect(d.futuro).toMatchObject({ aplicado: 1000, naConta: 1500, valor: 2500, percentual: 25 });
  });

  it("gastar mais do que entrou deixa o futuro negativo; sem renda não há percentual", () => {
    expect(dividirMes([l(1000, "Salário"), l(-1500, "Compras")], CATALOGO_PADRAO).futuro).toMatchObject({ naConta: -500, valor: -500, percentual: -50 });
    expect(dividirMes([l(-100, "Compras")], CATALOGO_PADRAO).desejos.percentual).toBeNull();
  });

  it("categoria própria: a fatia escolhida, senão a do grupo; a de entrada é renda", () => {
    const c = montarCatalogo([
      { nome: "Previdência privada", nativa: false, grupo: "Financeiro", destino: null, fatia: "futuro" },
      { nome: "Cachorro", nativa: false, grupo: "Pessoal e Lazer", destino: null, fatia: null },
      { nome: "Escola de inglês", nativa: false, grupo: "Educação", destino: null, fatia: null },
      { nome: "Bico", nativa: false, grupo: "Entradas", destino: null, fatia: null },
    ]);
    const d = dividirMes([l(2000, "Bico"), l(-300, "Previdência privada"), l(-100, "Cachorro"), l(-400, "Escola de inglês")], c);
    expect(d.renda).toBe(2000);
    expect(d.futuro.aplicado).toBe(300);
    expect(d.desejos.categorias).toEqual([{ categoria: "Cachorro", valor: 100 }]);
    expect(d.necessidades.categorias).toEqual([{ categoria: "Escola de inglês", valor: 400 }]);
  });
});
