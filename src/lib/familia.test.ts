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
