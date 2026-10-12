import { describe, expect, it } from "vitest";
import {
  avaliar, categoriaAceitaTeto, contasPendentes, diaDeHoje, economiaAcumulada, fechar, medir, metaMaisFacil,
  montarBase, ocupamVaga, opcoesDeTeto, periodoDo, referenciaDo, repetido, sugerirDesafios, tituloDoDesafio,
  type Desafio, type LancamentoDesafio,
} from "./desafios";
import type { TipoConta } from "./financas";

const dia = (s: string) => new Date(`${s}T00:00:00Z`);
/** O Intl separa "R$" do número com espaço sem quebra. */
const txt = (s: string) => s.replace(/\u00a0/g, " ");
const HOJE = dia("2026-10-07");

function l(p: Partial<Omit<LancamentoDesafio, "data" | "mesReferencia" | "createdAt">> & {
  data: string; mesReferencia?: string; createdAt?: string;
}): LancamentoDesafio {
  const valor = p.valor ?? -10;
  return {
    descricao: "COMPRA", categoria: null, conta: "Banco · Débito", tipo: valor >= 0 ? "Entrada" : "Saída",
    fonte: "Importado Banco (OFX)", ...p, valor,
    data: dia(p.data),
    mesReferencia: p.mesReferencia ? dia(p.mesReferencia) : null,
    createdAt: p.createdAt ? new Date(p.createdAt) : dia(p.data),
  };
}

function desafio(p: Partial<Desafio> & Pick<Desafio, "modelo">): Desafio {
  return {
    id: 1, categoria: null, meta: 0, referencia: 0, inicio: dia("2026-10-01"), fim: new Date("2026-10-31T23:59:59.999Z"),
    status: "ativo", resultado: null, economia: null, parcial: false, encerradoEm: null, ...p,
  };
}

/** Seis meses (abr–set/2026) com salário, aluguel e o que vier em `extra(mes)`. */
function seisMeses(extra: (mes: string) => LancamentoDesafio[] = () => []): LancamentoDesafio[] {
  return ["04", "05", "06", "07", "08", "09"].flatMap((m) => [
    l({ data: `2026-${m}-05`, valor: 5000, categoria: "Salário" }),
    l({ data: `2026-${m}-10`, valor: -1500, categoria: "Aluguel" }),
    ...extra(m),
  ]);
}

describe("período", () => {
  it("semana: hoje e os 6 dias seguintes", () => {
    const p = periodoDo("semana-sem-delivery", HOJE);
    expect(p.inicio).toEqual(dia("2026-10-07"));
    expect(p.fim).toEqual(new Date("2026-10-13T23:59:59.999Z"));
  });

  it("mês: o corrente até o dia 10, depois o seguinte", () => {
    expect(periodoDo("teto-categoria", dia("2026-10-10")).inicio).toEqual(dia("2026-10-01"));
    const depois = periodoDo("teto-categoria", dia("2026-10-11"));
    expect(depois.inicio).toEqual(dia("2026-11-01"));
    expect(depois.fim).toEqual(new Date("2026-11-30T23:59:59.999Z"));
    expect(periodoDo("sobra", dia("2026-12-20")).inicio).toEqual(dia("2027-01-01"));
  });

  it("hoje é o dia no Brasil, não em UTC", () => {
    expect(diaDeHoje(new Date("2026-10-08T02:00:00Z"))).toEqual(dia("2026-10-07"));
    expect(diaDeHoje(new Date("2026-10-08T04:00:00Z"))).toEqual(dia("2026-10-08"));
  });
});

describe("referência (o normal do usuário)", () => {
  it("média dos meses com dados, pela competência; semana é 7/30,4 do mês", () => {
    const ls = [
      // só 3 meses com lançamentos: a média divide por 3, não por 6
      ...["07", "08", "09"].flatMap((m) => [
        l({ data: `2026-${m}-03`, valor: -300, categoria: "Delivery e iFood", conta: "Cartão", mesReferencia: `2026-${m}-01` }),
      ]),
      // compra de setembro na fatura de outubro: competência outubro, fora da base
      l({ data: "2026-09-28", valor: -999, categoria: "Delivery e iFood", conta: "Cartão", mesReferencia: "2026-10-01" }),
    ];
    const base = montarBase(ls, HOJE);
    expect(base.meses).toEqual(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
    expect(base.mesesComDados).toBe(3);
    expect(referenciaDo("teto-categoria", "Delivery e iFood", base)).toBe(300);
    expect(referenciaDo("semana-sem-delivery", "Delivery e iFood", base)).toBeCloseTo((300 * 7) / 30.4375, 2);
  });

  it("encargos descontam devoluções; sobra ignora movimentação interna e aportes", () => {
    const base = montarBase(seisMeses((m) => [
      l({ data: `2026-${m}-15`, valor: -40, descricao: "JUROS CHEQUE ESPECIAL", categoria: "Taxas e Anuidades" }),
      l({ data: `2026-${m}-16`, valor: 10, descricao: "ESTORNO JUROS", categoria: "Estorno" }),
      l({ data: `2026-${m}-20`, valor: -2000, categoria: "Transferência entre Contas" }),
      l({ data: `2026-${m}-21`, valor: -500, categoria: "Investimentos (Aportes)" }),
    ]), HOJE);
    expect(referenciaDo("zero-encargos", null, base)).toBe(30);
    // 5000 + 10 − 1500 − 40
    expect(referenciaDo("sobra", null, base)).toBe(3470);
  });
});

describe("sugestões", () => {
  it("sem histórico não sugere nada", () => {
    const base = montarBase([l({ data: "2026-09-05", valor: -100, categoria: "Compras" })], HOJE);
    expect(sugerirDesafios(base, [], HOJE)).toEqual([]);
  });

  it("vermelho e juros primeiro; delivery frequente vira semana sem; teto nas categorias do dia a dia", () => {
    const ls = seisMeses((m) => [
      l({ data: `2026-${m}-12`, valor: -25, descricao: "IOF", categoria: "Taxas e Anuidades" }),
      ...Array.from({ length: 5 }, (_, i) => l({ data: `2026-${m}-${10 + i}`, valor: -40, categoria: "Delivery e iFood" })),
      l({ data: `2026-${m}-18`, valor: m === "09" ? -900 : -600, categoria: "Restaurantes e Lanches" }),
      l({ data: `2026-${m}-19`, valor: -200, categoria: "Compras" }),
      l({ data: `2026-${m}-20`, valor: -2000, categoria: "Plano de Saúde" }), // fixa: nunca vira teto
      ...(m === "09" ? [l({ data: "2026-09-25", valor: -3000, categoria: "Viagem" })] : []),
    ]);
    const s = sugerirDesafios(montarBase(ls, HOJE), [], HOJE);
    // nível 2 (vermelho antes dos juros), depois nível 3 pela economia esperada;
    // Viagem teve gasto em um mês só e Plano de Saúde é fixa: nenhuma vira teto
    expect(s.map((x) => [x.modelo, x.categoria, x.potencial])).toEqual([
      ["sobra", null, 0],
      ["zero-encargos", null, 25],
      ["teto-categoria", "Restaurantes e Lanches", 100],
      ["semana-sem-delivery", "Delivery e iFood", 46],
      ["teto-categoria", "Compras", 20],
    ]);
    expect(txt(s[0].motivo)).toBe("Em setembro as saídas passaram as entradas em R$ 2.825.");
    expect(txt(s[1].motivo)).toBe("Você pagou R$ 75 em juros e encargos nos últimos 3 meses.");
    // média 650 e setembro 900, acima dela: teto 15% abaixo
    expect(s[2]).toMatchObject({ meta: 550, referencia: 650, inicio: dia("2026-10-01") });
    expect(txt(s[2].titulo)).toBe("Até R$ 550 em Restaurantes e Lanches no mês");
    expect(txt(s[2].motivo)).toBe("Em setembro foram R$ 900, acima da sua média de R$ 650.");
    expect(s[3]).toMatchObject({ meta: 0, titulo: "Semana sem delivery" });
    expect(txt(s[3].motivo)).toBe("Você pede delivery umas 5 vezes por mês (R$ 200 em média).");
    // na média: 10% abaixo
    expect(s[4].meta).toBe(180);
    expect(txt(s[4].motivo)).toBe("Sua média é de R$ 200 por mês.");
  });

  it("não repete o que já está em andamento", () => {
    const ls = seisMeses((m) => [l({ data: `2026-${m}-12`, valor: -25, descricao: "IOF", categoria: "Taxas e Anuidades" })]);
    const base = montarBase(ls, HOJE);
    expect(sugerirDesafios(base, [], HOJE).map((s) => s.modelo)).toContain("zero-encargos");
    const ativo = desafio({ modelo: "zero-encargos" });
    expect(sugerirDesafios(base, [ativo], HOJE).map((s) => s.modelo)).not.toContain("zero-encargos");
    // terminado (mesmo aguardando extrato) libera a sugestão
    const terminado = desafio({ modelo: "zero-encargos", inicio: dia("2026-09-01"), fim: new Date("2026-09-30T23:59:59.999Z") });
    expect(sugerirDesafios(base, [terminado], HOJE).map((s) => s.modelo)).toContain("zero-encargos");
  });

  it("opções de teto: categorias de gasto do usuário, com média e teto 10% abaixo", () => {
    const base = montarBase(seisMeses((m) => [l({ data: `2026-${m}-18`, valor: -333, categoria: "Restaurantes e Lanches" })]), HOJE);
    expect(opcoesDeTeto(base)).toEqual([
      { categoria: "Aluguel", media: 1500, meta: 1350 },
      { categoria: "Restaurantes e Lanches", media: 333, meta: 300 },
    ]);
  });

  it("teto só em categorias de gasto", () => {
    expect(categoriaAceitaTeto("Restaurantes e Lanches")).toBe(true);
    expect(categoriaAceitaTeto("Pagamento de Cartão de Crédito")).toBe(false);
    expect(categoriaAceitaTeto("Investimentos (Aportes)")).toBe(false);
    expect(categoriaAceitaTeto("Salário")).toBe(false);
    // categoria própria de gasto: só quando o catálogo do usuário diz que é dele
    expect(categoriaAceitaTeto("Cachorro")).toBe(false);
    expect(categoriaAceitaTeto("Cachorro", new Set(["Cachorro"]))).toBe(true);
  });

  it("opções de teto incluem as categorias próprias de gasto, mas as sugestões automáticas não", () => {
    const base = montarBase(seisMeses((m) => [l({ data: `2026-${m}-18`, valor: -300, categoria: "Cachorro" })]), HOJE);
    expect(opcoesDeTeto(base).map((o) => o.categoria)).not.toContain("Cachorro");
    expect(opcoesDeTeto(base, new Set(["Cachorro"]))).toContainEqual({ categoria: "Cachorro", media: 300, meta: 270 });
    expect(sugerirDesafios(base, [], HOJE).map((s) => s.categoria)).not.toContain("Cachorro");
  });
});

describe("medição", () => {
  const outubro = { inicio: dia("2026-10-01"), fim: new Date("2026-10-31T23:59:59.999Z") };

  it("gasto conta pela data da compra, com estornos, só na categoria", () => {
    const ls = [
      l({ data: "2026-10-03", valor: -100, categoria: "Restaurantes e Lanches", conta: "Cartão", mesReferencia: "2026-11-01" }),
      l({ data: "2026-10-20", valor: -80, categoria: "Restaurantes e Lanches" }),
      l({ data: "2026-10-21", valor: 30, categoria: "Restaurantes e Lanches" }), // estorno
      l({ data: "2026-09-30", valor: -500, categoria: "Restaurantes e Lanches", mesReferencia: "2026-10-01" }),
      l({ data: "2026-10-05", valor: -70, categoria: "Compras" }),
    ];
    expect(medir({ modelo: "teto-categoria", categoria: "Restaurantes e Lanches", ...outubro }, ls)).toBe(150);
  });

  it("encargos no período, descontadas as devoluções", () => {
    const ls = [
      l({ data: "2026-10-02", valor: -12.5, descricao: "IOF ADICIONAL" }),
      l({ data: "2026-10-02", valor: -30, descricao: "IOF COMPRA NO EXTERIOR" }), // não é dívida
      l({ data: "2026-10-03", valor: -3.85, descricao: "IOF SOBRE TRANSACAO INTERNACIONAL" }), // nem esta (fatura Nomad)
      l({ data: "2026-10-09", valor: -40, descricao: "Juros de mora" }),
      l({ data: "2026-10-10", valor: 40, descricao: "Estorno juros de mora" }),
    ];
    expect(medir({ modelo: "zero-encargos", categoria: null, ...outubro }, ls)).toBe(12.5);
  });

  it("sobra: entradas − saídas do mês pela competência, como o dashboard", () => {
    const ls = [
      l({ data: "2026-10-05", valor: 3000, categoria: "Salário" }),
      l({ data: "2026-09-20", valor: -800, categoria: "Compras", conta: "Cartão", mesReferencia: "2026-10-01" }),
      l({ data: "2026-10-25", valor: -900, categoria: "Compras", conta: "Cartão", mesReferencia: "2026-11-01" }),
      l({ data: "2026-10-10", valor: -1200, categoria: "Pagamento de Cartão de Crédito" }),
      l({ data: "2026-10-11", valor: -500, categoria: "Investimentos (Aportes)" }),
    ];
    expect(medir({ modelo: "sobra", categoria: null, ...outubro }, ls)).toBe(2200);
  });
});

describe("extratos do período", () => {
  const tipos = new Map<string, TipoConta>([["Cartão", "cartao"], ["Débito", "corrente"]]);
  const outubro = { modelo: "teto-categoria", inicio: dia("2026-10-01"), fim: new Date("2026-10-31T23:59:59.999Z") };

  it("conta corrente: lançamento no último dia ou extrato importado depois do fim", () => {
    const so28 = [l({ data: "2026-10-28", conta: "Débito", createdAt: "2026-10-29T12:00:00Z" })];
    expect(contasPendentes(outubro, so28, tipos)).toEqual([{ conta: "Débito", ate: dia("2026-10-28") }]);
    const importadoDepois = [l({ data: "2026-10-28", conta: "Débito", createdAt: "2026-11-02T12:00:00Z" })];
    expect(contasPendentes(outubro, importadoDepois, tipos)).toEqual([]);
    const lancadoAMao = [l({ data: "2026-10-28", conta: "Débito", fonte: null, createdAt: "2026-11-02T12:00:00Z" })];
    expect(contasPendentes(outubro, lancadoAMao, tipos)).toHaveLength(1);
    expect(contasPendentes(outubro, [l({ data: "2026-10-31", conta: "Débito" })], tipos)).toEqual([]);
  });

  it("cartão: compra depois do fim ou a fatura de dois meses à frente", () => {
    const faturaNov = [l({ data: "2026-10-20", conta: "Cartão", mesReferencia: "2026-11-01" })];
    expect(contasPendentes(outubro, faturaNov, tipos)).toHaveLength(1);
    const faturaDez = [...faturaNov, l({ data: "2026-10-30", conta: "Cartão", mesReferencia: "2026-12-01" })];
    expect(contasPendentes(outubro, faturaDez, tipos)).toEqual([]);
    // sobra é por competência: a fatura do próprio mês basta
    const faturaOut = [l({ data: "2026-09-20", conta: "Cartão", mesReferencia: "2026-10-01" })];
    expect(contasPendentes({ ...outubro, modelo: "sobra" }, faturaOut, tipos)).toEqual([]);
  });

  it("conta parada há mais de 60 dias não segura o resultado", () => {
    expect(contasPendentes(outubro, [l({ data: "2026-07-15", conta: "Débito" })], tipos)).toEqual([]);
  });
});

describe("avaliação e fechamento", () => {
  const tipos = new Map<string, TipoConta>([["Débito", "corrente"]]);
  const d = desafio({ modelo: "teto-categoria", categoria: "Compras", meta: 400, referencia: 600 });
  const ls = [
    l({ data: "2026-10-10", valor: -350, categoria: "Compras", conta: "Débito" }),
    l({ data: "2026-10-25", conta: "Débito" }),
  ];

  it("agendado antes do início; em andamento mostra o parcial", () => {
    expect(avaliar(d, ls, tipos, dia("2026-09-30")).estado).toBe("agendado");
    expect(avaliar(d, ls, tipos, dia("2026-10-31"))).toMatchObject({ estado: "andamento", resultado: 350, fechamento: null });
  });

  it("acabou sem os extratos: aguarda; com eles, fecha com a economia", () => {
    const aguardando = avaliar(d, ls, tipos, dia("2026-11-03"));
    expect(aguardando).toMatchObject({ estado: "aguardando", fechamento: null });
    expect(aguardando.pendentes.map((p) => p.conta)).toEqual(["Débito"]);
    const comExtrato = [...ls, l({ data: "2026-11-01", conta: "Débito" })];
    expect(avaliar(d, comExtrato, tipos, dia("2026-11-03")).fechamento)
      .toEqual({ status: "cumprido", resultado: 350, economia: 250, parcial: false });
  });

  it("encerrar à mão ou depois de 45 dias fecha como parcial", () => {
    expect(avaliar(d, ls, tipos, dia("2026-11-03"), true).fechamento).toMatchObject({ status: "cumprido", parcial: true });
    expect(avaliar(d, ls, tipos, dia("2026-12-16")).fechamento).toMatchObject({ parcial: true });
    expect(avaliar(d, ls, tipos, dia("2026-11-03"), true).estado).toBe("cumprido");
  });

  it("não cumprido ainda conta o que ficou abaixo do normal; sobra não soma economia", () => {
    expect(fechar(d, 500, false)).toEqual({ status: "nao_cumprido", resultado: 500, economia: 100, parcial: false });
    expect(fechar(d, 700, false).economia).toBe(0);
    expect(fechar({ modelo: "sobra", meta: 0, referencia: -300 }, 120, false)).toEqual({ status: "cumprido", resultado: 120, economia: null, parcial: false });
    expect(fechar({ modelo: "sobra", meta: 0, referencia: -300 }, -50, false).status).toBe("nao_cumprido");
  });
});

describe("depois do resultado", () => {
  const naoCumprido = (p: Partial<Desafio> & Pick<Desafio, "modelo">) => desafio({ status: "nao_cumprido", ...p });

  it("meta mais fácil: meio caminho, ainda abaixo do normal", () => {
    expect(metaMaisFacil(naoCumprido({ modelo: "teto-categoria", meta: 540, referencia: 620, resultado: 700 }))).toBe(590);
    expect(metaMaisFacil(naoCumprido({ modelo: "semana-sem-delivery", meta: 0, referencia: 90, resultado: 120 }))).toBe(60);
    expect(metaMaisFacil(naoCumprido({ modelo: "sobra", meta: 0, referencia: -900, resultado: -800 }))).toBe(-400);
    expect(metaMaisFacil(naoCumprido({ modelo: "zero-encargos", meta: 0, referencia: 30, resultado: 4 }))).toBe(0);
    expect(metaMaisFacil(desafio({ modelo: "zero-encargos", status: "cumprido", resultado: 0 }))).toBeNull();
  });

  it("títulos acompanham a meta", () => {
    expect(txt(tituloDoDesafio({ modelo: "zero-encargos", categoria: null, meta: 20 }))).toBe("Juros abaixo de R$ 20 no mês");
    expect(txt(tituloDoDesafio({ modelo: "sobra", categoria: null, meta: -400 }))).toBe("Reduzir o vermelho do mês a R$ 400");
    expect(txt(tituloDoDesafio({ modelo: "semana-sem-delivery", categoria: null, meta: 60 }))).toBe("Semana com até R$ 60 de delivery");
  });

  it("economia acumulada, vagas e repetição", () => {
    const lista = [
      desafio({ modelo: "teto-categoria", status: "cumprido", economia: 120.5 }),
      desafio({ modelo: "teto-categoria", status: "nao_cumprido", economia: 30 }),
      desafio({ modelo: "zero-encargos", status: "abandonado", economia: 99 }),
      desafio({ modelo: "sobra", status: "ativo" }),
    ];
    expect(economiaAcumulada(lista)).toBe(150.5);
    expect(ocupamVaga(lista, HOJE)).toBe(1);
    expect(ocupamVaga(lista, dia("2026-11-01"))).toBe(0);
    const novo = { modelo: "sobra", categoria: null, inicio: dia("2026-10-01"), fim: new Date("2026-10-31T23:59:59.999Z") };
    expect(repetido(lista, novo)).toBe(true);
    expect(repetido(lista, { ...novo, modelo: "zero-encargos" })).toBe(false); // o igual foi abandonado
  });
});
