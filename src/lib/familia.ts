// Plano da família: as pessoas da casa (adultos, dependentes e "outros", como um
// imóvel alugado que tem renda e contas próprias), a renda de cada um e as contas
// fixas com quem paga e para quem são. Um cenário principal e cópias dele para
// simular alternativas (ex.: escola integral × um turno). Fica nas finanças de
// quem criou (model PlanoFamilia); os outros adultos veem ou ajudam pelo
// compartilhamento. Funções puras — a rota /api/familia só guarda e confere.
import { z } from "zod";
import { GRUPOS_CATEGORIAS } from "./categorias";
import { grupoDaCategoria, type Catalogo } from "./catalogo-categorias";
import { fatiaDaCategoria } from "./fatias";

export type TipoPessoa = "adulto" | "dependente" | "outro";
export type Periodicidade = "mensal" | "anual";

export interface Pessoa { chave: string; nome: string; tipo: TipoPessoa }

export interface ItemFamilia {
  chave: string;
  tipo: "conta" | "renda";
  descricao: string;
  valor: number;              // na periodicidade (anual = o ano inteiro)
  periodicidade: Periodicidade;
  pessoa: string;             // renda: de quem; conta: quem paga
  para: string | null;        // conta: de quem é (null = da casa)
  categoria: string | null;   // conta: categoria do usuário (grupo e 50/30/20)
  grupo: string | null;       // conta: agrupamento livre (ex.: "Apartamento Passaré"); null = o da categoria
  origem: string | null;      // num cenário: o item do principal que ele copia
}

export interface Cenario { chave: string; nome: string; principal: boolean; itens: ItemFamilia[] }
export interface DadosFamilia { pessoas: Pessoa[]; cenarios: Cenario[] }

export const TIPOS_PESSOA: { v: TipoPessoa; rotulo: string }[] = [
  { v: "adulto", rotulo: "Adulto" },
  { v: "dependente", rotulo: "Filho(a) ou dependente" },
  { v: "outro", rotulo: "Outro (imóvel, empresa…)" },
];
/** Quem tem renda e paga contas: adultos e "outros" (o imóvel que se paga). */
export const pagaContas = (p: Pessoa) => p.tipo !== "dependente";

export const novaChave = () => Math.random().toString(36).slice(2, 10);
export const dadosVazios = (): DadosFamilia => ({
  pessoas: [],
  cenarios: [{ chave: "principal", nome: "Plano principal", principal: true, itens: [] }],
});

// ─── Validação (servidor) ─────────────────────────────────────────────────────

const chave = z.string().regex(/^[a-z0-9-]{1,40}$/i, "Chave inválida");
const texto = (max: number) => z.string().trim().min(1).max(max);
const itemSchema = z.object({
  chave, tipo: z.enum(["conta", "renda"]),
  descricao: texto(80),
  valor: z.number().finite().positive().max(10_000_000),
  periodicidade: z.enum(["mensal", "anual"]),
  pessoa: chave, para: chave.nullable(),
  categoria: z.string().trim().max(60).nullable(),
  grupo: z.string().trim().max(40).nullable(),
  origem: chave.nullable(),
});
export const dadosFamiliaSchema = z.object({
  pessoas: z.array(z.object({ chave, nome: texto(40), tipo: z.enum(["adulto", "dependente", "outro"]) })).max(20),
  cenarios: z.array(z.object({ chave, nome: texto(60), principal: z.boolean(), itens: z.array(itemSchema).max(300) })).min(1).max(10),
}).superRefine((d, ctx) => {
  const problema = (message: string) => ctx.addIssue({ code: "custom", message });
  const pessoas = new Map(d.pessoas.map((p) => [p.chave, p]));
  if (pessoas.size !== d.pessoas.length) problema("Pessoas repetidas");
  if (d.cenarios.filter((c) => c.principal).length !== 1) problema("Tem de haver exatamente um plano principal");
  if (new Set(d.cenarios.map((c) => c.chave)).size !== d.cenarios.length) problema("Cenários repetidos");
  for (const c of d.cenarios) {
    if (new Set(c.itens.map((i) => i.chave)).size !== c.itens.length) problema(`Itens repetidos em "${c.nome}"`);
    for (const i of c.itens) {
      const quem = pessoas.get(i.pessoa);
      if (!quem || !pagaContas(quem)) problema(`"${i.descricao}": ${i.tipo === "renda" ? "a renda" : "quem paga"} tem de ser um adulto ou um "outro"`);
      if (i.tipo === "conta" && i.para !== null && !pessoas.has(i.para)) problema(`"${i.descricao}": "para quem" não existe`);
      if (i.tipo === "renda" && (i.para !== null || i.categoria !== null)) problema(`"${i.descricao}": renda não tem "para quem" nem categoria`);
    }
  }
});

// ─── Cálculos ─────────────────────────────────────────────────────────────────

const arred = (n: number) => Math.round(n * 100) / 100;
export const mensal = (i: Pick<ItemFamilia, "valor" | "periodicidade">) => (i.periodicidade === "anual" ? i.valor / 12 : i.valor);

/** Onde a conta aparece na lista: o grupo escolhido, senão o da categoria. */
export function grupoDoItem(i: ItemFamilia, c: Catalogo): string {
  return i.grupo?.trim() || (i.categoria ? grupoDaCategoria(c, i.categoria) : null) || "Outras";
}
const ORDEM_GRUPO = new Map(GRUPOS_CATEGORIAS.map((g, i) => [g.grupo, i]));

export interface ResumoPessoa { chave: string; nome: string; tipo: TipoPessoa; renda: number; pagaCasa: number; pagaIndividual: number; sobra: number }
export interface ResumoCenario {
  renda: number;
  contas: number;
  sobra: number;
  porPessoa: ResumoPessoa[];                         // quem tem renda ou paga contas
  porDependente: { chave: string; nome: string; total: number; itens: { descricao: string; valor: number }[] }[];
  grupos: { grupo: string; total: number }[];
  fatias: { necessidades: number; desejos: number; semFatia: number; futuro: number }; // R$/mês; futuro = sobra
}

/**
 * Tudo por mês (anual ÷ 12). Conta "da casa" = sem "para quem" ou para um
 * dependente; "individual" = para um adulto ou "outro". Sobra de cada um = a
 * renda dele menos o que ele paga.
 */
export function resumirCenario(dados: DadosFamilia, cenario: Cenario, c: Catalogo): ResumoCenario {
  const tipoDe = new Map(dados.pessoas.map((p) => [p.chave, p.tipo]));
  const contas = cenario.itens.filter((i) => i.tipo === "conta");
  const rendas = cenario.itens.filter((i) => i.tipo === "renda");
  const individual = (i: ItemFamilia) => i.para !== null && tipoDe.get(i.para) !== "dependente";

  const porPessoa = dados.pessoas.filter(pagaContas).map((p): ResumoPessoa => {
    const renda = rendas.filter((i) => i.pessoa === p.chave).reduce((a, i) => a + mensal(i), 0);
    const minhas = contas.filter((i) => i.pessoa === p.chave);
    const pagaIndividual = minhas.filter(individual).reduce((a, i) => a + mensal(i), 0);
    const pagaCasa = minhas.filter((i) => !individual(i)).reduce((a, i) => a + mensal(i), 0);
    return { chave: p.chave, nome: p.nome, tipo: p.tipo, renda: arred(renda), pagaCasa: arred(pagaCasa), pagaIndividual: arred(pagaIndividual), sobra: arred(renda - pagaCasa - pagaIndividual) };
  });

  const porDependente = dados.pessoas.filter((p) => p.tipo === "dependente").map((p) => {
    const itens = contas.filter((i) => i.para === p.chave).map((i) => ({ descricao: i.descricao, valor: arred(mensal(i)) }));
    return { chave: p.chave, nome: p.nome, total: arred(itens.reduce((a, i) => a + i.valor, 0)), itens };
  });

  const porGrupo = new Map<string, number>();
  for (const i of contas) porGrupo.set(grupoDoItem(i, c), (porGrupo.get(grupoDoItem(i, c)) ?? 0) + mensal(i));
  const grupos = [...porGrupo].map(([grupo, total]) => ({ grupo, total: arred(total) }))
    .sort((a, b) => (ORDEM_GRUPO.get(a.grupo) ?? 99) - (ORDEM_GRUPO.get(b.grupo) ?? 99) || b.total - a.total);

  const renda = arred(rendas.reduce((a, i) => a + mensal(i), 0));
  const totalContas = arred(contas.reduce((a, i) => a + mensal(i), 0));
  const fatias = { necessidades: 0, desejos: 0, semFatia: 0, futuro: arred(renda - totalContas) };
  for (const i of contas) {
    const f = i.categoria ? fatiaDaCategoria(c, i.categoria) : null;
    // conta da casa marcada como "futuro" (previdência, consórcio) é dinheiro guardado: fica na sobra
    if (f === "necessidades" || f === "desejos") fatias[f] += mensal(i);
    else if (f !== "futuro") fatias.semFatia += mensal(i);
  }
  fatias.necessidades = arred(fatias.necessidades);
  fatias.desejos = arred(fatias.desejos);
  fatias.semFatia = arred(fatias.semFatia);
  return { renda, contas: totalContas, sobra: arred(renda - totalContas), porPessoa, porDependente, grupos, fatias };
}

export interface Mudanca { tipo: "novo" | "removido" | "alterado"; item: string; antes: number | null; depois: number | null; detalhe?: string }

/** O que um cenário muda em relação ao principal (pela origem de cada item copiado). */
export function compararCenarios(dados: DadosFamilia, principal: Cenario, outro: Cenario, c: Catalogo) {
  const nome = new Map(dados.pessoas.map((p) => [p.chave, p.nome]));
  const doPrincipal = new Map(principal.itens.map((i) => [i.chave, i]));
  const copiados = new Set(outro.itens.map((i) => i.origem).filter(Boolean));
  const mudancas: Mudanca[] = [];
  for (const i of outro.itens) {
    const base = i.origem ? doPrincipal.get(i.origem) : undefined;
    if (!base) { mudancas.push({ tipo: "novo", item: i.descricao, antes: null, depois: arred(mensal(i)) }); continue; }
    const detalhes = [
      base.pessoa !== i.pessoa && `${i.tipo === "renda" ? "de" : "paga"}: ${nome.get(base.pessoa)} → ${nome.get(i.pessoa)}`,
      base.para !== i.para && `para: ${base.para ? nome.get(base.para) : "casa"} → ${i.para ? nome.get(i.para) : "casa"}`,
      base.descricao !== i.descricao && `era "${base.descricao}"`,
    ].filter(Boolean).join(" · ");
    if (Math.abs(mensal(base) - mensal(i)) >= 0.005 || detalhes) {
      mudancas.push({ tipo: "alterado", item: i.descricao, antes: arred(mensal(base)), depois: arred(mensal(i)), ...(detalhes && { detalhe: detalhes }) });
    }
  }
  for (const i of principal.itens) if (!copiados.has(i.chave)) mudancas.push({ tipo: "removido", item: i.descricao, antes: arred(mensal(i)), depois: null });

  const a = resumirCenario(dados, principal, c);
  const b = resumirCenario(dados, outro, c);
  return {
    mudancas,
    renda: arred(b.renda - a.renda),
    contas: arred(b.contas - a.contas),
    sobra: arred(b.sobra - a.sobra),
    porPessoa: b.porPessoa.map((p) => ({ chave: p.chave, nome: p.nome, sobra: arred(p.sobra - (a.porPessoa.find((x) => x.chave === p.chave)?.sobra ?? 0)) })),
  };
}

/** Novo cenário a partir de outro: cópia dos itens, cada um lembrando o original do principal. */
export function duplicarCenario(dados: DadosFamilia, fonte: Cenario, nome: string): Cenario {
  return {
    chave: novaChave(), nome, principal: false,
    itens: fonte.itens.map((i) => ({ ...i, chave: novaChave(), origem: fonte.principal ? i.chave : i.origem })),
  };
}
