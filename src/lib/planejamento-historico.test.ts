import { describe, expect, it } from "vitest";
import { resumirHistorico, valorSugerido } from "./planejamento-historico";
import type { LancamentoFinancas } from "./financas";

const meses12 = ["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"];
const l = (mes: string, valor: number, categoria: string | null, descricao = "X", conta = "C6 Débito"): LancamentoFinancas => ({
  data: new Date(`${mes}-10T00:00:00Z`), mesReferencia: null, valor, categoria, descricao, conta,
});
const ultimos6 = meses12.slice(-6);

describe("histórico para a Fotografia do mês", () => {
  const dados: LancamentoFinancas[] = [
    // condomínio todo mês, estável, com um mês atípico
    ...ultimos6.map((m, i) => l(m, i === 2 ? -3000 : -1600, "Condomínio", "PJBANK PAGAMENTOS S A")),
    // energia e internet dividem a categoria
    ...ultimos6.map((m) => l(m, -380, "Contas de Consumo", "ENEL")),
    ...ultimos6.map((m) => l(m, -120, "Contas de Consumo", "BRISANET")),
    // restaurante: frequente, valor irregular
    l("2026-03", -100, "Restaurantes e Lanches"), l("2026-05", -900, "Restaurantes e Lanches"),
    l("2026-06", -50, "Restaurantes e Lanches"), l("2026-08", -450, "Restaurantes e Lanches"),
    // compras: todo mês, valor parecido — mas é variável por natureza (só aparece em Variáveis)
    ...ultimos6.map((m) => l(m, -2000, "Compras")),
    // mensalidade: todo mês, valor irregular — Fixos ou Sazonais nas sugestões → fixo
    ...ultimos6.map((m, i) => l(m, i % 2 ? -3000 : -900, "Mensalidades e Cursos")),
    // IPVA uma vez no ano (fora dos 6 últimos)
    l("2026-01", -1800, "Impostos e Tributos", "DETRAN"),
    // renda
    ...ultimos6.map((m) => l(m, 13000, "Outras Entradas", "Pix recebido de CLIENTE")),
    // ignorados: coringa, juros, transferência, estorno de loja
    l("2026-08", -5000, "Transferência para Terceiros"), l("2026-08", -300, "Taxas e Anuidades", "JUROS CHEQUE ESP"),
    l("2026-08", -9000, "Transferência entre Contas"), l("2026-08", 40, "Restaurantes e Lanches", "ESTORNO"),
    // ruído
    l("2026-08", -30, "Presentes"),
    // fora da janela
    l("2025-08", -999, "Viagem"),
  ];
  const h = resumirHistorico(dados, meses12);
  const cat = (c: string) => h.categorias.find((x) => x.categoria === c);

  it("classifica pelo comportamento e usa mediana nos fixos", () => {
    expect(h.mesesComDados).toBe(6);
    expect(cat("Condomínio")).toMatchObject({ grupo: "fixo", mediana: 1600, media: 1833 });
    expect(valorSugerido(cat("Condomínio")!, "fixo")).toBe(1600);
    expect(cat("Restaurantes e Lanches")).toMatchObject({ grupo: "variavel", media: 250, mesesComValor: 4 });
    expect(cat("Impostos e Tributos")).toMatchObject({ grupo: "sazonal", anual: 1800, media: 0 });
    expect(valorSugerido(cat("Impostos e Tributos")!, "sazonal")).toBe(1800);
    expect(cat("Compras")!.grupo).toBe("variavel");
    expect(cat("Mensalidades e Cursos")!.grupo).toBe("fixo");
    expect(cat("Outras Entradas")).toMatchObject({ grupo: "entrada", entrada: true, media: 13000 });
  });

  it("mostra os maiores estabelecimentos de categorias compartilhadas", () => {
    expect(cat("Contas de Consumo")!.maiores).toEqual([{ descricao: "ENEL", media: 380 }, { descricao: "BRISANET", media: 120 }]);
    expect(cat("Contas de Consumo")!.mediana).toBe(500);
  });

  it("deixa de fora coringa, juros, movimentação interna, ruído e o que está fora da janela", () => {
    for (const c of ["Transferência para Terceiros", "Taxas e Anuidades", "Transferência entre Contas", "Presentes", "Viagem"])
      expect(cat(c), c).toBeUndefined();
  });

  it("nome do estabelecimento sem o texto do banco", async () => {
    const { nomeCurto } = await import("./planejamento-historico");
    expect(nomeCurto("Pagamento de boleto efetuado - EDIFICIO LIVORNO")).toBe("EDIFICIO LIVORNO");
    expect(nomeCurto("Transferência enviada pelo Pix - Janaina Maria - ---.489.143-- - CAIXA")).toBe("Janaina Maria");
    expect(nomeCurto("DROGASIL 2460          FORTALEZA     BRA")).toBe("DROGASIL 2460");
    expect(nomeCurto("Pix enviado para FULANO · Emprestimo")).toBe("FULANO");
    expect(nomeCurto("UNIMED FORTALEZA SOCIEDADE COOPERATIVA MEDICA LTDA")).toBe("UNIMED FORTALEZA SOCIEDADE…");
  });

  it("sem lançamentos, não há histórico", () => {
    expect(resumirHistorico([], meses12)).toEqual({ meses: ultimos6, mesesComDados: 0, categorias: [] });
  });
});
