import { describe, expect, it } from "vitest";
import { sugerirMesReferencia, vencimentoNoTexto } from "./mes-referencia";

const dia = (s: string) => { const [a, m, d] = s.split("-").map(Number); return new Date(a, m - 1, d); };

describe("sugerirMesReferencia", () => {
  // Compra mais recente de cada fatura do C6 no histórico real → mês de referência gravado
  const historicoC6: [string, string][] = [
    ["2026-06-03", "2026-06"], ["2026-04-28", "2026-05"], ["2026-04-01", "2026-04"],
    ["2026-02-28", "2026-03"], ["2026-02-02", "2026-02"], ["2026-01-01", "2026-01"],
    ["2025-12-02", "2025-12"], ["2025-10-29", "2025-11"], ["2025-10-02", "2025-10"],
    ["2025-09-03", "2025-09"], ["2025-07-31", "2025-08"], ["2025-07-02", "2025-07"],
  ];

  it.each(historicoC6)("última compra %s → fatura %s", (ultima, esperado) => {
    expect(sugerirMesReferencia([dia("2025-01-15"), dia(ultima)])).toBe(esperado);
  });

  it("prefere o vencimento escrito na fatura", () => {
    const texto = "Resumo da fatura\nVencimento: 10/11/2026\nTotal R$ 1.234,56";
    expect(sugerirMesReferencia([dia("2026-10-28")], texto)).toBe("2026-11");
    expect(vencimentoNoTexto("Data de vencimento 05/01/27")).toBe("2027-01");
    expect(vencimentoNoTexto("Data de vencimento\n05/10/2026\nMês de referência: Setembro")).toBe("2026-10"); // Nomad
  });

  it("sem datas e sem vencimento não sugere", () => {
    expect(sugerirMesReferencia([], "sem nada aqui")).toBeNull();
  });
});

describe("vencimento no nome do arquivo", () => {
  it("usa a data do nome antes da heurística", async () => {
    const { vencimentoNoNome } = await import("./mes-referencia");
    expect(vencimentoNoNome("Nubank_2026-09-10.ofx")).toBe("2026-09");
    expect(vencimentoNoNome("c6 Fatura_2026-08-10 2.csv")).toBe("2026-08");
    expect(vencimentoNoNome("NU_47643011_01SET2026_24SET2026.ofx")).toBeNull();
    expect(sugerirMesReferencia([dia("2026-09-22")], undefined, "Nubank_2026-09-10.ofx")).toBe("2026-09");
  });
});
