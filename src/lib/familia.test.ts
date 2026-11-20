import { describe, expect, it } from "vitest";
import { compararCenarios, dadosFamiliaSchema, duplicarCenario, resumirCenario, trazerDaFotografia, type DadosFamilia, type ItemFamilia } from "./familia";
import { CATALOGO_PADRAO } from "./catalogo-categorias";

const item = (p: Partial<ItemFamilia> & Pick<ItemFamilia, "chave" | "tipo" | "descricao" | "valor" | "pessoa">): ItemFamilia =>
  ({ periodicidade: "mensal", para: null, categoria: null, grupo: null, origem: null, ...p });

// casal com dois filhos e um apartamento alugado que paga as próprias contas (dados fictícios)
const dados: DadosFamilia = {
  pessoas: [
    { chave: "ana", nome: "Ana", tipo: "adulto" },
    { chave: "bruno", nome: "Bruno", tipo: "adulto" },
    { chave: "leo", nome: "Léo", tipo: "dependente" },
    { chave: "bia", nome: "Bia", tipo: "dependente" },
    { chave: "apto", nome: "Apartamento", tipo: "outro" },
  ],
  cenarios: [{
    chave: "principal", nome: "Plano principal", principal: true, itens: [
      item({ chave: "r1", tipo: "renda", descricao: "Salário", valor: 10000, pessoa: "ana" }),
      item({ chave: "r2", tipo: "renda", descricao: "Salário", valor: 8000, pessoa: "bruno" }),
      item({ chave: "r3", tipo: "renda", descricao: "Aluguel recebido", valor: 1500, pessoa: "apto" }),
      item({ chave: "c1", tipo: "conta", descricao: "Aluguel", valor: 3000, pessoa: "ana", categoria: "Aluguel" }),
      item({ chave: "c2", tipo: "conta", descricao: "Escola Léo", valor: 1600, pessoa: "bruno", para: "leo", categoria: "Mensalidades e Cursos" }),
      item({ chave: "c3", tipo: "conta", descricao: "Escola Bia", valor: 1200, pessoa: "ana", para: "bia", categoria: "Mensalidades e Cursos" }),
      item({ chave: "c4", tipo: "conta", descricao: "Plano de saúde dos pais", valor: 460, pessoa: "ana", para: "ana", categoria: "Plano de Saúde" }),
      item({ chave: "c5", tipo: "conta", descricao: "IPVA", valor: 3600, periodicidade: "anual", pessoa: "bruno", categoria: "Impostos e Tributos", grupo: "Carro" }),
      item({ chave: "c6", tipo: "conta", descricao: "Condomínio do apartamento", valor: 434, pessoa: "apto", categoria: "Condomínio", grupo: "Apartamento" }),
      item({ chave: "c7", tipo: "conta", descricao: "Streaming", valor: 60, pessoa: "bruno", para: "bruno", categoria: "Assinaturas Digitais" }),
    ],
  }],
};

describe("plano da família", () => {
  it("resume por pessoa: renda, o que paga da casa e o que é individual, e a sobra", () => {
    const r = resumirCenario(dados, dados.cenarios[0], CATALOGO_PADRAO);
    expect(r.porPessoa).toEqual([
      { chave: "ana", nome: "Ana", tipo: "adulto", renda: 10000, pagaCasa: 4200, pagaIndividual: 460, sobra: 5340 },
      { chave: "bruno", nome: "Bruno", tipo: "adulto", renda: 8000, pagaCasa: 1900, pagaIndividual: 60, sobra: 6040 }, // IPVA 3600/12 = 300
      { chave: "apto", nome: "Apartamento", tipo: "outro", renda: 1500, pagaCasa: 434, pagaIndividual: 0, sobra: 1066 },
    ]);
    expect(r.porDependente.map((d) => [d.nome, d.total])).toEqual([["Léo", 1600], ["Bia", 1200]]);
    expect(r).toMatchObject({ renda: 19500, contas: 7054, sobra: 12446 });
    expect(r.grupos.map((g) => g.grupo)).toEqual(["Moradia", "Saúde", "Educação", "Pessoal e Lazer", "Apartamento", "Carro"]);
    expect(r.fatias).toEqual({ necessidades: 6994, desejos: 60, semFatia: 0, futuro: 12446 });
  });

  it("cenário: copia o principal e a comparação mostra o que mudou e o efeito em cada um", () => {
    const umTurno = duplicarCenario(dados, dados.cenarios[0], "Escola um turno");
    const leo = umTurno.itens.find((i) => i.descricao === "Escola Léo")!;
    leo.valor = 1000;
    umTurno.itens = umTurno.itens.filter((i) => i.descricao !== "Streaming");
    umTurno.itens.push(item({ chave: "novo", tipo: "conta", descricao: "Natação Bia", valor: 250, pessoa: "ana", para: "bia" }));
    const d = { ...dados, cenarios: [...dados.cenarios, umTurno] };
    const comp = compararCenarios(d, d.cenarios[0], umTurno, CATALOGO_PADRAO);
    expect(comp.mudancas).toEqual([
      { tipo: "alterado", item: "Escola Léo", antes: 1600, depois: 1000 },
      { tipo: "novo", item: "Natação Bia", antes: null, depois: 250 },
      { tipo: "removido", item: "Streaming", antes: 60, depois: null },
    ]);
    expect(comp.contas).toBe(-410);
    expect(comp.porPessoa.find((p) => p.nome === "Bruno")?.sobra).toBe(660);
    expect(comp.porPessoa.find((p) => p.nome === "Ana")?.sobra).toBe(-250);
  });

  it("validação: renda só de quem paga contas, 'para quem' que existe e um único principal", () => {
    expect(dadosFamiliaSchema.safeParse(dados).success).toBe(true);
    const comItem = (i: ItemFamilia) => ({ ...dados, cenarios: [{ ...dados.cenarios[0], itens: [i] }] });
    expect(dadosFamiliaSchema.safeParse(comItem(item({ chave: "x", tipo: "renda", descricao: "Mesada", valor: 50, pessoa: "leo" }))).success).toBe(false);
    expect(dadosFamiliaSchema.safeParse(comItem(item({ chave: "x", tipo: "conta", descricao: "X", valor: 50, pessoa: "ana", para: "ninguem" }))).success).toBe(false);
    expect(dadosFamiliaSchema.safeParse({ ...dados, cenarios: [dados.cenarios[0], { ...dados.cenarios[0], chave: "outro" }] }).success).toBe(false);
  });
});

describe("trazer da Fotografia do mês", () => {
  it("entradas viram renda e fixos/sazonais/parcelas viram contas da pessoa; variáveis e repetidos ficam de fora", () => {
    const foto = [
      { grupo: "entrada" as const, descricao: "Salário", categoria: "Salário", valor: 10000, periodicidade: "mensal" as const },
      { grupo: "entrada" as const, descricao: "Consultorias", categoria: "Outras Entradas", valor: 3000, periodicidade: "mensal" as const },
      { grupo: "fixo" as const, descricao: "Aluguel", categoria: "Aluguel", valor: 3000, periodicidade: "mensal" as const },
      { grupo: "fixo" as const, descricao: "Feira", categoria: "Supermercado e Mercearia", valor: 150, periodicidade: "semanal" as const },
      { grupo: "sazonal" as const, descricao: "IPVA", categoria: "Impostos e Tributos", valor: 3600, periodicidade: "anual" as const },
      { grupo: "parcela" as const, descricao: "Geladeira", categoria: "Casa: Manutenção e Móveis", valor: 300, periodicidade: "mensal" as const, parcelaAtual: 3, parcelaTotal: 10 },
      { grupo: "parcela" as const, descricao: "Celular", categoria: "Compras", valor: 200, periodicidade: "mensal" as const, parcelaAtual: 11, parcelaTotal: 10 },
      { grupo: "variavel" as const, descricao: "Restaurantes", categoria: "Restaurantes e Lanches", valor: 800, periodicidade: "mensal" as const },
    ];
    // "Salário" e "Aluguel" da Ana já estão no plano principal
    const r = trazerDaFotografia(foto, "ana", dados.cenarios[0], CATALOGO_PADRAO);
    expect(r.novos.map((i) => [i.tipo, i.descricao, i.valor, i.periodicidade, i.pessoa, i.categoria])).toEqual([
      ["renda", "Consultorias", 3000, "mensal", "ana", null],
      ["conta", "Feira", 650, "mensal", "ana", "Supermercado e Mercearia"], // 150 × 52/12
      ["conta", "IPVA", 3600, "anual", "ana", "Impostos e Tributos"],
      ["conta", "Geladeira (3/10)", 300, "mensal", "ana", "Casa: Manutenção e Móveis"],
    ]);
    expect(r).toMatchObject({ repetidos: 2, variaveis: 1, quitadas: 1 });
  });
});

describe("conferência antes de salvar", async () => {
  const { problemasDoPlano, semLinhasVazias } = await import("./familia");
  it("linha em branco sai; linha pela metade vira mensagem em português", () => {
    const comItens = (itens: ItemFamilia[]) => ({ ...dados, cenarios: [{ ...dados.cenarios[0], itens }] });
    const branco = item({ chave: "b", tipo: "renda", descricao: "", valor: 0, pessoa: "ana" });
    expect(semLinhasVazias(comItens([branco])).cenarios[0].itens).toEqual([]);
    expect(problemasDoPlano(comItens([
      item({ chave: "x", tipo: "conta", descricao: "Aluguel", valor: 0, pessoa: "ana" }),
      item({ chave: "y", tipo: "renda", descricao: "", valor: 500, pessoa: "bruno" }),
      item({ chave: "z", tipo: "renda", descricao: "Mesada", valor: 50, pessoa: "leo" }),
    ])).map((p) => p.texto)).toEqual([
      "“Aluguel”: falta o valor",
      "Renda de Bruno: falta a descrição",
      "“Mesada”: Léo é dependente: não tem renda nem paga contas",
    ]);
    expect(problemasDoPlano(dados)).toEqual([]);
  });
});

describe("Fotografia: o que mudou desde a última vez", async () => {
  const { novidadesDaFotografia, aplicarDaFotografia } = await import("./familia");
  const foto = (salario: number, parcela = 3) => [
    { grupo: "entrada" as const, descricao: "Salário", categoria: "Salário", valor: salario, periodicidade: "mensal" as const },
    { grupo: "parcela" as const, descricao: "Geladeira", categoria: "Casa: Manutenção e Móveis", valor: 300, periodicidade: "mensal" as const, parcelaAtual: parcela, parcelaTotal: 10 },
    { grupo: "fixo" as const, descricao: "Internet", categoria: "Internet e Telefonia", valor: 120, periodicidade: "mensal" as const },
  ];
  const vazio = { ...dados.cenarios[0], itens: [] as ItemFamilia[] };

  it("salário que subiu vem como valor alterado; a parcela do mês seguinte não se repete", () => {
    const primeira = trazerDaFotografia(foto(10000), "ana", vazio, CATALOGO_PADRAO, "Ana");
    expect(primeira.novos.map((i) => [i.descricao, i.por, i.fonte])).toEqual([
      ["Salário", "Ana", "fotografia"], ["Geladeira (3/10)", "Ana", "fotografia"], ["Internet", "Ana", "fotografia"],
    ]);
    const cenario = structuredClone(vazio);
    aplicarDaFotografia(cenario, primeira);

    const depois = trazerDaFotografia(foto(11000, 4), "ana", cenario, CATALOGO_PADRAO, "Ana");
    expect(depois.novos).toEqual([]);
    expect(depois.alterados.map((a) => [a.descricao, a.antes, a.valor])).toEqual([["Salário", 10000, 11000]]);
    expect(depois.repetidos).toBe(2); // geladeira (4/10) é a mesma conta; internet igual
    aplicarDaFotografia(cenario, depois);
    expect(cenario.itens.find((i) => i.descricao === "Salário")?.valor).toBe(11000);
  });

  it("só avisa do que não foi trazido nem dispensado; quem nunca trouxe vê tudo", () => {
    const previa = trazerDaFotografia(foto(10000), "ana", vazio, CATALOGO_PADRAO);
    expect(novidadesDaFotografia(previa, null).novos).toHaveLength(3);
    expect(novidadesDaFotografia(previa, previa.assinaturas).novos).toHaveLength(0);
    // dispensou com salário 10.000; a Fotografia passou a 11.000: só o salário volta a aparecer
    const nova = trazerDaFotografia(foto(11000), "ana", vazio, CATALOGO_PADRAO);
    expect(novidadesDaFotografia(nova, previa.assinaturas).novos.map((i) => i.descricao)).toEqual(["Salário"]);
  });
});

describe("plano compartilhado", async () => {
  const { mesclarPlanos, categoriasDoPlano, pessoaSugerida } = await import("./familia");
  const copia = () => structuredClone(dados);
  const itens = (d: DadosFamilia) => d.cenarios[0].itens;

  it("edições em linhas (ou campos) diferentes se juntam", () => {
    const base = copia(), meu = copia(), deles = copia();
    itens(meu).find((i) => i.chave === "c1")!.valor = 3200;                  // eu: aluguel
    itens(meu).push(item({ chave: "n1", tipo: "conta", descricao: "Academia", valor: 120, pessoa: "ana", para: "ana" }));
    itens(deles).find((i) => i.chave === "c1")!.categoria = "Condomínio";    // ela: mesma linha, outro campo
    itens(deles).find((i) => i.chave === "r2")!.valor = 9000;                // ela: salário do Bruno
    deles.cenarios[0].itens = itens(deles).filter((i) => i.chave !== "c7");  // ela: tirou o streaming
    const { dados: m, conflitos } = mesclarPlanos(base, meu, deles);
    expect(conflitos).toEqual([]);
    const c1 = itens(m).find((i) => i.chave === "c1")!;
    expect([c1.valor, c1.categoria]).toEqual([3200, "Condomínio"]);
    expect(itens(m).find((i) => i.chave === "r2")?.valor).toBe(9000);
    expect(itens(m).some((i) => i.chave === "c7")).toBe(false);
    expect(itens(m).some((i) => i.chave === "n1")).toBe(true);
    expect(dadosFamiliaSchema.safeParse(m).success).toBe(true);
  });

  it("os dois mexeram no mesmo campo: fica o que foi salvo antes e vira aviso; alterar vence tirar", () => {
    const base = copia(), meu = copia(), deles = copia();
    itens(meu).find((i) => i.chave === "c1")!.valor = 3200;
    itens(deles).find((i) => i.chave === "c1")!.valor = 3100;
    meu.cenarios[0].itens = itens(meu).filter((i) => i.chave !== "c2");      // eu tirei a escola…
    itens(deles).find((i) => i.chave === "c2")!.valor = 1700;                // …que ela reajustou
    const { dados: m, conflitos } = mesclarPlanos(base, meu, deles);
    expect(itens(m).find((i) => i.chave === "c1")?.valor).toBe(3100);
    expect(itens(m).find((i) => i.chave === "c2")?.valor).toBe(1700);
    expect(conflitos).toEqual(["“Aluguel”", "“Escola Léo”"]);
  });

  it("categorias: as nativas e as personalizadas de qualquer membro", () => {
    const linhas = categoriasDoPlano([
      [{ nome: "Pets", nativa: false, grupo: "Pessoal e Lazer", destino: null, fatia: "desejos" }, { nome: "Academia", nativa: true, grupo: null, destino: null }],
      [{ nome: "pets", nativa: false, grupo: "Outras", destino: null }, { nome: "Igreja", nativa: false, grupo: "Outras", destino: null }],
    ]);
    expect(linhas.map((l) => l.nome)).toEqual(["Pets", "Igreja"]); // a nativa oculta por um membro não some do plano
  });

  it("sugere como pessoa do membro o adulto com o mesmo nome, se ninguém o escolheu", () => {
    expect(pessoaSugerida(dados, "bruno", [])).toBe("bruno");
    expect(pessoaSugerida(dados, "Bruno", ["bruno"])).toBeNull();
    expect(pessoaSugerida(dados, "Léo", [])).toBeNull(); // dependente não paga contas
  });
});

describe("privacidade: renda e contas pessoais", async () => {
  const { semOcultos, reporOcultos, problemasDePrivacidade, transferirPrivados } = await import("./familia");
  const ana = { pessoa: "ana", renda: true, pessoais: true }; // o que a Ana esconde do Bruno
  const chaves = (d: DadosFamilia, c = 0) => d.cenarios[c].itens.map((i) => i.chave);

  it("quem não é a Ana não recebe a renda nem as contas pessoais dela; as da casa continuam", () => {
    const visao = semOcultos(dados, [ana]);
    expect(chaves(visao)).toEqual(["r2", "r3", "c1", "c2", "c3", "c5", "c6", "c7"]); // sem r1 (salário) e c4 (pessoal)
    expect(semOcultos(dados, [{ ...ana, pessoais: false }]).cenarios[0].itens.some((i) => i.chave === "c4")).toBe(true);
  });

  it("ao salvar, os itens privados voltam ao lugar; cenário novo recebe cópia dos privados do principal", () => {
    const visao = structuredClone(semOcultos(dados, [ana]));
    visao.cenarios[0].itens.find((i) => i.chave === "c1")!.valor = 3100;
    visao.cenarios[0].itens = visao.cenarios[0].itens.filter((i) => i.chave !== "c3");
    visao.cenarios.push({ chave: "turno", nome: "Um turno", principal: false, itens: visao.cenarios[0].itens.map((i) => ({ ...i, chave: `t-${i.chave}`, origem: i.chave })) });
    const salvo = reporOcultos(visao, dados, [ana]);
    expect(chaves(salvo)).toEqual(["r1", "r2", "r3", "c1", "c2", "c4", "c5", "c6", "c7"]); // c4 ficou depois do c2 (o c3 saiu)
    expect(salvo.cenarios[0].itens.find((i) => i.chave === "c1")?.valor).toBe(3100);
    const copias = salvo.cenarios[1].itens.filter((i) => i.origem === "r1" || i.origem === "c4");
    expect(copias.map((i) => i.descricao)).toEqual(["Salário", "Plano de saúde dos pais"]);
    expect(dadosFamiliaSchema.safeParse(salvo).success).toBe(true);
  });

  it("outro membro não inclui a renda nem conta pessoal da Ana", () => {
    const visao = structuredClone(semOcultos(dados, [ana]));
    visao.cenarios[0].itens.push(item({ chave: "x", tipo: "renda", descricao: "Bônus", valor: 500, pessoa: "ana" }));
    visao.cenarios[0].itens.push(item({ chave: "y", tipo: "conta", descricao: "Academia", valor: 100, pessoa: "ana", para: "ana" }));
    visao.cenarios[0].itens.push(item({ chave: "z", tipo: "conta", descricao: "Luz", valor: 200, pessoa: "ana" })); // da casa: pode
    expect(problemasDePrivacidade(visao, [ana]).map((p) => p.texto)).toEqual([
      "“Bônus”: a renda de Ana é privada — só Ana inclui a própria",
      "“Academia”: as contas pessoais de Ana são privadas — só Ana inclui as próprias (ou deixe como da casa)",
    ]);
  });

  it("quem troca de pessoa leva os privados; quem sai os leva embora", () => {
    const moveu = transferirPrivados(dados, ana, "apto");
    expect(moveu.cenarios[0].itens.filter((i) => i.pessoa === "apto").map((i) => i.chave)).toEqual(["r1", "r3", "c4", "c6"]);
    expect(moveu.cenarios[0].itens.find((i) => i.chave === "c4")?.para).toBe("apto");
    expect(moveu.cenarios[0].itens.find((i) => i.chave === "c1")?.pessoa).toBe("ana"); // a da casa fica
    expect(chaves(transferirPrivados(dados, ana, null))).toEqual(["r2", "r3", "c1", "c2", "c3", "c5", "c6", "c7"]);
  });
});
