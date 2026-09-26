import { describe, expect, it } from "vitest";
import { distribuirReembolso, valorLiquido } from "./reembolso";

describe("reembolso", () => {
  it("valor líquido desconta o reembolsado e nunca fica positivo", () => {
    expect(valorLiquido({ valor: -334.99, valorReembolsado: 152.5 })).toBeCloseTo(-182.49);
    expect(valorLiquido({ valor: -100, valorReembolsado: 150 })).toBe(0);
    expect(valorLiquido({ valor: -100, valorReembolsado: 0 })).toBe(-100);
    expect(valorLiquido({ valor: 76.25, valorReembolsado: 0 })).toBe(76.25);
    expect(valorLiquido({ valor: -50 })).toBe(-50);
  });

  it("vários Pix para uma conta: cada um só usa o que falta", () => {
    const tim = { id: 1, valor: -334.99, jaReembolsado: 76.25 }; // a Margaret já pagou
    expect(distribuirReembolso(76.25, [tim])).toEqual({ partes: [{ saidaId: 1, valor: 76.25 }], sobra: 0 });
  });

  it("um Pix para vários gastos: proporcional ao que falta, somando exatamente o Pix", () => {
    const r = distribuirReembolso(100, [
      { id: 1, valor: -200, jaReembolsado: 0 },
      { id: 2, valor: -100, jaReembolsado: 0 },
    ]);
    expect(r.partes).toEqual([{ saidaId: 1, valor: 66.67 }, { saidaId: 2, valor: 33.33 }]);
    expect(r.sobra).toBe(0);
  });

  it("Pix maior que o total em aberto: reembolsa tudo e informa a sobra", () => {
    const r = distribuirReembolso(500, [
      { id: 1, valor: -120, jaReembolsado: 20 },
      { id: 2, valor: -80, jaReembolsado: 80 }, // já quitado
    ]);
    expect(r.partes).toEqual([{ saidaId: 1, valor: 100 }]);
    expect(r.sobra).toBe(400);
  });

  it("sem gastos em aberto, nada é distribuído", () => {
    expect(distribuirReembolso(50, [])).toEqual({ partes: [], sobra: 50 });
  });
});
