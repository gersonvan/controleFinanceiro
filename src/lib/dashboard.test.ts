import { describe, expect, it } from "vitest";
import { agregarDashboard, mesesDoGrafico, montarAvisos, projecaoDasSaidas, type LancamentoDashboard } from "./dashboard";

const l = (data: string, valor: number, categoria: string | null, extra: Partial<LancamentoDashboard> = {}): LancamentoDashboard => ({
  data: new Date(`${data}T12:00:00Z`), mesReferencia: null, valor, tipo: valor >= 0 ? "Entrada" : "Saída", categoria, conta: "Nubank · Débito", ...extra,
});
const HOJE = new Date("2026-11-23T12:00:00Z");

// dados fictícios
const lancamentos = [
  l("2026-11-05", 6000, "Salário"),
  l("2026-11-06", -1800, "Aluguel"),
  l("2026-11-08", -300, null),
  l("2026-11-09", -500, "Investimentos (Aportes)"),                   // aporte: fora das saídas
  l("2026-11-10", -1000, "Transferência entre Contas"),      // movimentação interna
  // compra de outubro na fatura de novembro: conta em novembro
  l("2026-10-28", -420, "Restaurantes e Lanches", { mesReferencia: new Date("2026-11-01T00:00:00Z"), conta: "Nubank · Crédito" }),
  l("2026-10-05", 6000, "Salário"),
  l("2026-10-15", -7600, "Automóvel"),
  l("2026-05-15", -50, "Compras"),                           // fora dos 6 meses
];

describe("dashboard: totais do período", () => {
  it("no mês: totais, todas as categorias (sem categoria inclusive), por conta e os 6 meses até ele", () => {
    const d = agregarDashboard(lancamentos, 2026, 11, HOJE);
    expect(d).toMatchObject({ totalEntradas: 6000, totalSaidas: 2520, saldo: 3480, investido: 500 });
    expect(d.porCategoria).toEqual([["Aluguel", 1800], ["Restaurantes e Lanches", 420], ["Sem categoria", 300]]);
    expect(d.porCategoria.reduce((a, [, v]) => a + v, 0)).toBe(d.totalSaidas);
    expect(d.porConta).toEqual([["Nubank · Débito", 2100], ["Nubank · Crédito", 420]]);
    expect(d.porMes.map((m) => m.mes)).toEqual(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
    expect(d.porMes.slice(-2)).toEqual([
      { mes: "2026-10", entradas: 6000, saidas: 7600 },
      { mes: "2026-11", entradas: 6000, saidas: 2520 },
    ]);
  });

  it("no ano: de janeiro até o mês atual; ano passado vai até dezembro; janeiro cruza o ano", () => {
    expect(agregarDashboard(lancamentos, 2026, undefined, HOJE).porMes).toHaveLength(11);
    expect(mesesDoGrafico(2025, undefined, HOJE)).toHaveLength(12);
    expect(mesesDoGrafico(2026, 2, HOJE)).toEqual(["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(agregarDashboard([], 2026, 11, HOJE).porMes).toEqual([]); // nada: sem gráfico
  });
});

describe("projeção das saídas do mês", () => {
  it("o que já saiu + o que a média gasta nos dias que faltam; sem média ou fora do mês: nada", () => {
    expect(projecaoDasSaidas(5180.4, { projecao: 4500, gastoAteHoje: 3140, mesesNaMedia: 5 })).toBe(6540.4);
    expect(projecaoDasSaidas(5180.4, { projecao: null, gastoAteHoje: 3140, mesesNaMedia: 5 })).toBeNull();
    expect(projecaoDasSaidas(5180.4, { projecao: 4500, gastoAteHoje: 3140, mesesNaMedia: 0 })).toBeNull();
  });
});

describe("Fique de olho", () => {
  const base = { mesLongo: "novembro", query: "?ano=2026&mes=11", divida: null, semFatia: null, reserva: null, desafios: null };

  it("nada a dizer: lista vazia", () => {
    expect(montarAvisos(base)).toEqual([]);
  });

  it("do mais grave ao informativo, com a ação de cada um", () => {
    const avisos = montarAvisos({
      ...base,
      divida: { mes: { total: 87.3 }, principal: { origem: "Cheque especial" } },
      semFatia: 1240.4,
      reserva: { emConta: -2337.26, disponivel: 13000, bloqueado: 0 },
      desafios: { economiaAcumulada: 0, emCurso: [{ titulo: "Gastar menos do que ganha", estado: "andamento", medida: "sobra", meta: 0, resultado: 819.6 }], sugestoes: [] },
    });
    expect(avisos.map((a) => [a.id, a.nivel, a.acao])).toEqual([
      ["divida", "alerta", "Ver detalhes"], ["reserva", "alerta", "Ver reserva"], ["sem-fatia", "atencao", "Revisar"], ["desafios", "info", "Ver desafio"],
    ]);
    const txt = (a: { titulo: string; texto: string }) => `${a.titulo} ${a.texto}`.replace(/ /g, " ");
    expect(txt(avisos[0])).toBe("R$ 87,30 em juros, IOF e multas em novembro — a maior parte vem de cheque especial.");
    expect(txt(avisos[1])).toBe("Contas no vermelho: -R$ 2.337,26 em conta. Aplicado: R$ 13.000,00.");
    expect(txt(avisos[3])).toBe("Desafios: 1 em andamento — Gastar menos do que ganha: sobra de R$ 819,60 até agora.");
  });

  it("no ano todo, os avisos do mês (dívida, sem fatia) não aparecem; reserva em dia e sugestão de desafio sim", () => {
    const avisos = montarAvisos({
      ...base, mesLongo: null, semFatia: 500, divida: { mes: { total: 10 }, principal: null },
      reserva: { emConta: 0, disponivel: 13000, bloqueado: 2000 },
      desafios: { economiaAcumulada: 150, emCurso: [], sugestoes: [{ titulo: "Mercado até R$ 900", motivo: "Em outubro passou da média." }] },
    });
    expect(avisos.map((a) => [a.id, a.nivel])).toEqual([["reserva", "info"], ["desafios", "info"]]);
    expect(avisos[0].texto.replace(/ /g, " ")).toBe("R$ 2.000,00 bloqueado · R$ 0,00 em conta.");
    expect(avisos[1].texto.replace(/ /g, " ")).toBe("— Em outubro passou da média. Economia acumulada: R$ 150,00.");
  });
});
