import { describe, expect, it } from "vitest";
import { aprenderPadroes, chaveContraparte, sugerirGasto, sugerirVarios, valorCompativel } from "./reembolso-padroes";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const tim = (id: number, data: string, reembolsado = 0) =>
  ({ id, descricao: "Pix enviado para TIM S A", data: d(data), valor: -334.99, valorReembolsado: reembolsado });

describe("contraparte", () => {
  it("o mesmo pagador ou empresa em qualquer formato de banco", () => {
    expect(chaveContraparte("Pix recebido de JANAINA MARIA M VIEIRA")).toBe("janaina maria m vieira");
    expect(chaveContraparte("PIX RECEBIDO · JANAINA MARIA M VIEIRA")).toBe("janaina maria m vieira");
    expect(chaveContraparte("Pix enviado para TIM S A")).toBe("tim");
    expect(chaveContraparte("TIM SA")).toBe("tim");
    expect(chaveContraparte("Pix - Enviado · 10/08 09:50 CATA ALENTO")).toBe("cata alento");
    expect(chaveContraparte("Transferência Recebida - Janaina Maria Martins Vieira - •••.489.143-•• - NU PAGAMENTOS")).toBe("janaina maria martins vieira");
    expect(chaveContraparte("Pix enviado para FULANO · Emprestimo")).toBe("fulano");
    expect(chaveContraparte("DROGASIL 2460          FORTALEZA     BRA")).toBe("drogasil 2460");
  });
});

describe("padrões de reembolso", () => {
  const padroes = aprenderPadroes([
    { pix: { descricao: "Pix recebido de MARGARET M VIEIRA", valor: 76.25 }, gastos: [{ descricao: "Pix enviado para TIM S A" }] },
    { pix: { descricao: "Pix recebido de JANAINA MARIA M VIEIRA", valor: 76.25 }, gastos: [{ descricao: "Pix enviado para TIM S A" }] },
    // Pix ligado a dois gastos não ensina padrão
    { pix: { descricao: "Pix recebido de FULANO", valor: 100 }, gastos: [{ descricao: "A" }, { descricao: "B" }] },
  ]);

  it("aprende um padrão por pagador", () => {
    expect([...padroes.keys()].sort()).toEqual(["janaina maria m vieira", "margaret m vieira"]);
    expect(padroes.get("margaret m vieira")).toMatchObject({ chaveGasto: "tim", valorTipico: 76.25, vezes: 1 });
  });

  it("valor precisa ser parecido (±10%)", () => {
    expect(valorCompativel(80, 76.25)).toBe(true);
    expect(valorCompativel(394.45, 76.25)).toBe(false);
  });

  it("escolhe a TIM mais próxima da data do Pix, com saldo a reembolsar", () => {
    const gastos = [tim(1, "2026-08-07"), tim(2, "2026-09-08"), tim(3, "2026-10-08")];
    const pix = { descricao: "Pix recebido de JANAINA MARIA M VIEIRA", valor: 76.25, data: d("2026-09-13") };
    expect(sugerirGasto(pix, padroes, gastos)?.id).toBe(2);
    // a de setembro já foi toda reembolsada → a de agosto (dentro da janela)
    expect(sugerirGasto(pix, padroes, [tim(1, "2026-08-07"), tim(2, "2026-09-08", 334.99)])?.id).toBe(1);
    // a TIM do mês escrita de outro jeito ("TIM SA") continua sendo a TIM
    expect(sugerirGasto(pix, padroes, [tim(1, "2026-08-07"), { ...tim(2, "2026-09-08"), descricao: "TIM SA" }])?.id).toBe(2);
    // Pix de valor diferente ou de outro pagador: nada
    expect(sugerirGasto({ ...pix, valor: 394.45 }, padroes, gastos)).toBeNull();
    expect(sugerirGasto({ ...pix, descricao: "Pix recebido de OUTRA PESSOA" }, padroes, gastos)).toBeNull();
  });

  it("vários Pix do mesmo mês dividem a mesma conta sem estourar o saldo", () => {
    const gastos = [{ ...tim(2, "2026-09-08"), valor: -150 }];
    const pares = sugerirVarios([
      { id: 10, descricao: "Pix recebido de MARGARET M VIEIRA", valor: 76.25, data: d("2026-09-05") },
      { id: 11, descricao: "Pix recebido de JANAINA MARIA M VIEIRA", valor: 76.25, data: d("2026-09-13") },
    ], padroes, gastos);
    // a Margaret usa 76,25; sobram 73,75 para a Janaina — ainda cabe
    expect(pares).toEqual([{ entradaId: 10, saidaId: 2 }, { entradaId: 11, saidaId: 2 }]);
    // com a conta já quase toda paga, o segundo Pix não encontra saldo
    const cheia = sugerirVarios([
      { id: 10, descricao: "Pix recebido de MARGARET M VIEIRA", valor: 76.25, data: d("2026-09-05") },
      { id: 11, descricao: "Pix recebido de JANAINA MARIA M VIEIRA", valor: 76.25, data: d("2026-09-13") },
    ], padroes, [{ ...tim(2, "2026-09-08"), valor: -76.25 }]);
    expect(cheia).toEqual([{ entradaId: 10, saidaId: 2 }]);
  });
});
