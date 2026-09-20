import { describe, expect, it } from "vitest";
import { numeroParcela, planejadoPorCategoria, totaisMensais, valorMensal, type ItemPlanejado } from "./planejamento";

const item = (parcial: Partial<ItemPlanejado>): ItemPlanejado => ({
  grupo: "fixo", descricao: "x", categoria: "Contas de Consumo", valor: 100, periodicidade: "mensal", ...parcial,
});

describe("valorMensal", () => {
  it("mensaliza semanal (×52/12) e anual (/12)", () => {
    expect(valorMensal(item({ grupo: "variavel", periodicidade: "semanal", valor: 120 }))).toBeCloseTo(520, 5);
    expect(valorMensal(item({ grupo: "sazonal", periodicidade: "anual", valor: 2400 }))).toBe(200);
    expect(valorMensal(item({ valor: 90 }))).toBe(90);
  });

  it("parcela pesa até a última e depois some", () => {
    const p = item({ grupo: "parcela", valor: 50, parcelaAtual: 4, parcelaTotal: 5 });
    expect(valorMensal(p, 0)).toBe(50);   // parcela 4 este mês
    expect(valorMensal(p, 1)).toBe(50);   // parcela 5 mês que vem
    expect(valorMensal(p, 2)).toBe(0);    // quitou
    expect(numeroParcela(p, 1)).toBe(5);
    expect(numeroParcela(p, 2)).toBeNull();
  });
});

describe("totaisMensais", () => {
  it("calcula saídas, margem sobre entradas e sobra", () => {
    const t = totaisMensais([
      item({ grupo: "entrada", categoria: "Salário", valor: 5000 }),
      item({ grupo: "fixo", valor: 1500 }),
      item({ grupo: "variavel", periodicidade: "semanal", valor: 120 }),  // 520
      item({ grupo: "sazonal", periodicidade: "anual", valor: 1200 }),    // 100
      item({ grupo: "parcela", valor: 200, parcelaAtual: 1, parcelaTotal: 3 }),
    ], 20);
    expect(t.entradas).toBe(5000);
    expect(t.saidas).toBeCloseTo(1500 + 520 + 100 + 200, 5);
    expect(t.margem).toBe(1000);
    expect(t.sobra).toBeCloseTo(5000 - 2320 - 1000, 5);
  });
});

describe("planejadoPorCategoria", () => {
  it("agrupa saídas mensalizadas por categoria e ignora entradas", () => {
    const r = planejadoPorCategoria([
      item({ grupo: "entrada", categoria: "Salário", valor: 5000 }),
      item({ grupo: "fixo", categoria: "Contas de Consumo", valor: 300 }),
      item({ grupo: "sazonal", categoria: "Contas de Consumo", periodicidade: "anual", valor: 1200 }),
      item({ grupo: "parcela", categoria: "Compras", valor: 80, parcelaAtual: 2, parcelaTotal: 2 }),
    ]);
    expect(r).toEqual({ "Contas de Consumo": 400, Compras: 80 });
    expect(planejadoPorCategoria([item({ grupo: "parcela", categoria: "Compras", valor: 80, parcelaAtual: 2, parcelaTotal: 2 })], 1)).toEqual({});
  });
});
