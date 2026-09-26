import { describe, expect, it } from "vitest";
import { calcularPrevisao, parcelaDe, type LancamentoPrevisao } from "./previsao";
import type { ItemPlanejado } from "./planejamento";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const l = (mes: string, valor: number, categoria: string, descricao = categoria): LancamentoPrevisao =>
  ({ descricao, categoria, valor, data: d(`${mes}-10`), mesReferencia: null });
const hoje = d("2026-09-01"); // previsão de out/2026 em diante; histórico = mar–ago/2026

const lancamentos: LancamentoPrevisao[] = [
  // aluguel todo mês
  ...["03", "04", "05", "06", "07", "08"].map((m) => l(`2026-${m}`, -3500, "Aluguel", "HIS EMP IMOBILIARIOS")),
  // restaurante em alguns meses
  l("2026-06", -600, "Restaurantes e Lanches"), l("2026-08", -600, "Restaurantes e Lanches"),
  // prestação que parou em abril (sem gasto nos últimos 3 meses fechados)
  l("2026-03", -2000, "Prestação de Imóvel"), l("2026-04", -1000, "Prestação de Imóvel"),
  // curso parcelado: parcelas não entram na média de Mensalidades
  { descricao: "GRAN EDUCACAO (5/12)", categoria: "Mensalidades e Cursos", valor: -54.9, data: d("2026-07-12"), mesReferencia: d("2026-08-01") },
  { descricao: "GRAN EDUCACAO (4/12)", categoria: "Mensalidades e Cursos", valor: -54.9, data: d("2026-06-12"), mesReferencia: d("2026-07-01") },
  // neutras, aportes e entradas não entram
  l("2026-08", -68000, "Investimentos (Aportes)"), l("2026-08", -5000, "Pagamento de Cartão de Crédito"), l("2026-08", 12000, "Outras Entradas"),
];
const planejados: ItemPlanejado[] = [
  { grupo: "fixo", descricao: "Aluguel", categoria: "Aluguel", valor: 3400, periodicidade: "mensal" },
  { grupo: "variavel", descricao: "Restaurantes", categoria: "Restaurantes e Lanches", valor: 900, periodicidade: "mensal" },
  { grupo: "sazonal", descricao: "IPVA", categoria: "Impostos e Tributos", valor: 1200, periodicidade: "anual" },
  { grupo: "entrada", descricao: "Salário", categoria: "Salário", valor: 9000, periodicidade: "mensal" },
];
const doMes = <T extends { mes: string }>(itens: T[], mes = "10/2026") => itens.filter((i) => i.mes === mes);

describe("previsão", () => {
  it("reconhece parcelas nos dois formatos", () => {
    expect(parcelaDe("GRAN EDUCACAO (5/12)")).toEqual({ atual: 5, total: 12, base: "GRAN EDUCACAO" });
    expect(parcelaDe("Amazon - Parcela 3/4")).toEqual({ atual: 3, total: 4, base: "Amazon" });
    expect(parcelaDe("MERCADO")).toBeNull();
  });

  it("base fotografia: só o plano + parcelas; histórico aparece só como referência", () => {
    const r = calcularPrevisao({ lancamentos, planejados, encerradas: new Set(), base: "fotografia", hoje });
    const out = doMes(r.itens);
    expect(out.map((i) => [i.tipoPrevisao, i.categoria, i.valor])).toEqual([
      ["Planejado", "Aluguel", 3400],
      ["Planejado", "Restaurantes e Lanches", 900],
      ["Planejado", "Impostos e Tributos", 100],
      ["Parcelamento", "Mensalidades e Cursos", 54.9],
    ]);
    expect(out[0].referencia).toEqual({ planejado: 3400, historico: 3500 });
    expect(out[1].referencia).toEqual({ planejado: 900, historico: 200 });
    // parcela 5/12 em ago → outubro é a 7/12
    expect(out[3].detalhe).toBe("Parcela 7/12");
  });

  it("base histórico: média de 6 meses de toda categoria ativa, sem parcelas e sem categorias paradas", () => {
    const r = calcularPrevisao({ lancamentos, planejados, encerradas: new Set(), base: "historico", hoje });
    const out = doMes(r.itens);
    expect(out.map((i) => [i.tipoPrevisao, i.categoria, i.valor])).toEqual([
      ["Histórico", "Aluguel", 3500],
      ["Histórico", "Restaurantes e Lanches", 200],
      ["Parcelamento", "Mensalidades e Cursos", 54.9],
    ]);
    // prestação parou em abril: não é prevista; parcelas não viram "Mensalidades" na média
    expect(out.some((i) => i.categoria === "Prestação de Imóvel")).toBe(false);
    expect(out.some((i) => i.tipoPrevisao === "Histórico" && i.categoria === "Mensalidades e Cursos")).toBe(false);
    expect(out[0].historico).toHaveLength(6);
  });

  it("parcelas acabam na última", () => {
    const r = calcularPrevisao({ lancamentos, planejados, encerradas: new Set(), base: "historico", hoje });
    const gran = r.itens.filter((i) => i.tipoPrevisao === "Parcelamento");
    expect(gran.map((i) => i.detalhe)).toEqual(["Parcela 6/12", "Parcela 7/12", "Parcela 8/12", "Parcela 9/12", "Parcela 10/12", "Parcela 11/12", "Parcela 12/12"].slice(1));
  });

  it("categoria encerrada vale zero nas duas bases", () => {
    const encerradas = new Set(["Aluguel"]);
    for (const base of ["fotografia", "historico"] as const) {
      const r = calcularPrevisao({ lancamentos, planejados, encerradas, base, hoje });
      expect(r.itens.some((i) => i.categoria === "Aluguel"), base).toBe(false);
    }
  });

  it("sem fotografia, usa o histórico; com fotografia, lista o que ficou fora do plano", () => {
    expect(calcularPrevisao({ lancamentos, planejados: [], encerradas: new Set(), base: "fotografia", hoje }).base).toBe("historico");
    const extra = [...lancamentos, l("2026-08", -300, "Farmácia")];
    const r = calcularPrevisao({ lancamentos: extra, planejados, encerradas: new Set(), base: "fotografia", hoje });
    expect(r.foraDaFotografia).toEqual([{ categoria: "Farmácia", historico: 50 }]);
  });
});
