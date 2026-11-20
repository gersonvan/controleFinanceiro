// Plano da família: as pessoas da casa (adultos, dependentes e "outros", como um
// imóvel alugado que tem renda e contas próprias), a renda de cada um e as contas
// fixas com quem paga e para quem são. Um cenário principal e cópias dele para
// simular alternativas (ex.: escola integral × um turno). O plano não é das
// finanças de ninguém: tem membros (model MembroPlano), cada um ligado a uma pessoa
// do plano, que trazem a própria Fotografia do mês e editam juntos (edições
// simultâneas em linhas diferentes se juntam: mesclarPlanos). Funções puras — as
// rotas /api/familia só guardam e conferem.
import { z } from "zod";
import { GRUPOS_CATEGORIAS } from "./categorias";
import { grupoDaCategoria, type Catalogo } from "./catalogo-categorias";
import { fatiaDaCategoria } from "./fatias";
import { resolverCategoria, type LinhaCategoriaUsuario } from "./catalogo-categorias";
import { numeroParcela, valorMensal, type ItemPlanejado } from "./planejamento";

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
  por?: string | null;        // quem incluiu (nome do membro)
  fonte?: "fotografia" | null; // veio da Fotografia do mês de quem incluiu
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
  por: z.string().trim().max(60).nullable().optional(),
  fonte: z.enum(["fotografia"]).nullable().optional(),
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

// ─── Da Fotografia do mês ─────────────────────────────────────────────────────

/** "Geladeira (3/10)" e "Geladeira (4/10)" são a mesma conta: o número da parcela muda todo mês. */
const semParcela = (descricao: string) => descricao.trim().replace(/\s*\(\d+\/\d+\)$/, "").toLowerCase();
const chaveRepeticao = (i: Pick<ItemFamilia, "tipo" | "descricao" | "pessoa">) => `${i.tipo}|${semParcela(i.descricao)}|${i.pessoa}`;

/**
 * Identifica um item da Fotografia com o valor: o que o membro já trouxe ou
 * dispensou fica guardado (MembroPlano.vistos) e só o que é novo ou mudou de
 * valor vira aviso.
 */
export const assinaturaFotografia = (i: Pick<ItemFamilia, "tipo" | "descricao" | "valor" | "periodicidade">) =>
  `${i.tipo}|${semParcela(i.descricao)}|${i.valor.toFixed(2)}|${i.periodicidade}`;

/** Item que já está no plano, mas com outro valor na Fotografia (ex.: salário que subiu). */
export interface Alterado { chave: string; descricao: string; tipo: ItemFamilia["tipo"]; antes: number; valor: number; periodicidade: Periodicidade }
export interface DaFotografia {
  novos: ItemFamilia[];
  alterados: Alterado[];
  repetidos: number;  // já estão no plano, com o mesmo valor
  variaveis: number;
  quitadas: number;
  assinaturas: string[]; // tudo o que a Fotografia oferece agora (para marcar como visto)
}

/**
 * A Fotografia do mês de uma pessoa vira renda e contas pagas por ela no plano da
 * família: entradas → renda; fixos e sazonais → contas (semanal vira mensal; anual
 * continua anual); parcelas só enquanto faltam prestações. Os variáveis (o dia a
 * dia) ficam de fora — não são contas fixas. O que o cenário já tem (mesmo tipo,
 * descrição e pessoa) não se repete; se o valor mudou, vem como "alterado". Tudo
 * entra como "da casa": o usuário ajusta.
 */
export function trazerDaFotografia(fotografia: ItemPlanejado[], pessoa: string, cenario: Cenario, c: Catalogo, por: string | null = null): DaFotografia {
  const existentes = new Map(cenario.itens.map((i) => [chaveRepeticao(i), i]));
  const r: DaFotografia = { novos: [], alterados: [], repetidos: 0, variaveis: 0, quitadas: 0, assinaturas: [] };
  const vistos = new Set<string>();
  for (const f of fotografia) {
    if (f.grupo === "variavel") { r.variaveis++; continue; }
    let descricao = f.descricao.trim();
    if (f.grupo === "parcela") {
      const n = numeroParcela(f);
      if (n === null) { r.quitadas++; continue; }
      descricao = `${descricao} (${n}/${f.parcelaTotal})`;
    }
    const anual = f.periodicidade === "anual" && f.grupo !== "parcela";
    const valor = Math.round((anual ? f.valor : valorMensal(f)) * 100) / 100;
    if (valor <= 0 || !descricao) continue;
    const item: ItemFamilia = {
      chave: novaChave(), tipo: f.grupo === "entrada" ? "renda" : "conta",
      descricao: descricao.slice(0, 80), valor, periodicidade: anual ? "anual" : "mensal",
      pessoa, para: null,
      categoria: f.grupo === "entrada" ? null : resolverCategoria(c, f.categoria),
      grupo: null, origem: null, por, fonte: "fotografia",
    };
    if (vistos.has(chaveRepeticao(item))) continue; // repetido dentro da própria Fotografia
    vistos.add(chaveRepeticao(item));
    r.assinaturas.push(assinaturaFotografia(item));
    const ja = existentes.get(chaveRepeticao(item));
    if (!ja) { r.novos.push(item); continue; }
    if (Math.abs(ja.valor - item.valor) < 0.005 && ja.periodicidade === item.periodicidade) { r.repetidos++; continue; }
    r.alterados.push({ chave: ja.chave, descricao: ja.descricao, tipo: ja.tipo, antes: ja.valor, valor: item.valor, periodicidade: item.periodicidade });
  }
  return r;
}

/** Só o que o membro ainda não trouxe nem dispensou (vistos = null: nunca trouxe nada, tudo é novo). */
export function novidadesDaFotografia(d: DaFotografia, vistos: string[] | null): DaFotografia {
  if (!vistos) return d;
  const ja = new Set(vistos);
  return {
    ...d,
    novos: d.novos.filter((i) => !ja.has(assinaturaFotografia(i))),
    alterados: d.alterados.filter((a) => !ja.has(assinaturaFotografia(a))),
  };
}

/** Aplica no cenário o que veio da Fotografia: inclui os novos e atualiza o valor dos alterados. */
export function aplicarDaFotografia(cenario: Cenario, d: Pick<DaFotografia, "novos" | "alterados">) {
  for (const a of d.alterados) {
    const i = cenario.itens.find((x) => x.chave === a.chave);
    if (i) { i.valor = a.valor; i.periodicidade = a.periodicidade; }
  }
  cenario.itens.push(...d.novos);
}

// ─── Plano compartilhado ──────────────────────────────────────────────────────

/**
 * As categorias que o plano aceita: as nativas e as personalizadas de qualquer
 * membro (cada um tem as suas). As nativas que um membro ocultou continuam valendo
 * aqui — o plano é de todos.
 */
export function categoriasDoPlano(linhasPorMembro: LinhaCategoriaUsuario[][]): LinhaCategoriaUsuario[] {
  const vistas = new Map<string, LinhaCategoriaUsuario>();
  for (const linhas of linhasPorMembro) {
    for (const l of linhas) {
      if (!l.nativa && !vistas.has(l.nome.toLowerCase())) vistas.set(l.nome.toLowerCase(), { ...l, destino: null });
    }
  }
  return [...vistas.values()];
}

/** A pessoa do plano com o mesmo nome do membro (sugestão para "quem é você na casa"), se ninguém a escolheu. */
export function pessoaSugerida(d: DadosFamilia, nome: string, jaEscolhidas: (string | null)[]): string | null {
  const n = nome.trim().toLowerCase();
  if (!n) return null;
  const p = d.pessoas.find((x) => pagaContas(x) && x.nome.trim().toLowerCase() === n && !jaEscolhidas.includes(x.chave));
  return p?.chave ?? null;
}

// ─── Privacidade ──────────────────────────────────────────────────────────────
// As contas da casa (sem "para quem" ou para um dependente, ou para outra pessoa)
// são de todos. A renda de um membro e as contas pessoais dele (pagas por ele,
// para ele) só aparecem para os outros se ele quiser. O servidor tira esses itens
// antes de enviar o plano (semOcultos) e os repõe quando outro membro salva
// (reporOcultos) — esconder só na tela não bastaria.

/** O que um membro esconde dos outros: a pessoa do plano que ele é e o que fica privado. */
export interface Ocultacao { pessoa: string; renda: boolean; pessoais: boolean }

/** Conta pessoal: paga pela pessoa e para ela mesma (academia, streaming…). */
export const contaPessoal = (i: Pick<ItemFamilia, "tipo" | "pessoa" | "para">) => i.tipo === "conta" && i.para === i.pessoa;

export function itemOculto(i: ItemFamilia, ocultas: Ocultacao[]): boolean {
  const o = ocultas.find((x) => x.pessoa === i.pessoa);
  return !!o && ((i.tipo === "renda" && o.renda) || (contaPessoal(i) && o.pessoais));
}

/** O plano como um membro o vê: sem a renda e as contas pessoais que os outros mantêm privadas. */
export function semOcultos(d: DadosFamilia, ocultas: Ocultacao[]): DadosFamilia {
  if (ocultas.length === 0) return d;
  return { ...d, cenarios: d.cenarios.map((c) => ({ ...c, itens: c.itens.filter((i) => !itemOculto(i, ocultas)) })) };
}

/**
 * O que um membro salvou (sem os itens privados dos outros) + os itens privados
 * que já estavam no plano, cada um de volta ao lugar. Cenário novo criado por ele
 * recebe uma cópia dos privados do principal, para a comparação continuar certa.
 */
export function reporOcultos(enviado: DadosFamilia, atual: DadosFamilia, ocultas: Ocultacao[]): DadosFamilia {
  if (ocultas.length === 0) return enviado;
  const principal = atual.cenarios.find((c) => c.principal);
  const cenarios = enviado.cenarios.map((c) => {
    const antes = atual.cenarios.find((x) => x.chave === c.chave);
    if (!antes) {
      const copias = (principal?.itens ?? []).filter((i) => itemOculto(i, ocultas)).map((i) => ({ ...i, chave: novaChave(), origem: i.chave }));
      return { ...c, itens: [...c.itens, ...copias] };
    }
    const itens = [...c.itens];
    let anterior: string | null = null;
    for (const i of antes.itens) {
      if (itemOculto(i, ocultas)) {
        // logo depois do item que vinha antes dele (se ainda existir), senão no começo
        itens.splice(anterior === null ? 0 : itens.findIndex((x) => x.chave === anterior) + 1, 0, i);
      }
      if (itens.some((x) => x.chave === i.chave)) anterior = i.chave;
    }
    return { ...c, itens };
  });
  return { ...enviado, cenarios };
}

/** Itens que um membro não pode incluir nem alterar: a renda e as contas pessoais que outro mantém privadas. */
export function problemasDePrivacidade(d: DadosFamilia, ocultas: Ocultacao[]): Problema[] {
  const nome = new Map(d.pessoas.map((p) => [p.chave, p.nome]));
  const varios = d.cenarios.length > 1;
  const problemas: Problema[] = [];
  for (const c of d.cenarios) {
    for (const i of c.itens) {
      if (!itemOculto(i, ocultas)) continue;
      const quem = nome.get(i.pessoa) ?? "essa pessoa";
      const rotulo = `${i.descricao.trim() ? `“${i.descricao.trim()}”` : i.tipo === "renda" ? `Renda de ${quem}` : "Conta sem descrição"}${varios ? ` (cenário “${c.nome}”)` : ""}`;
      problemas.push({
        cenario: c.chave, item: i.chave,
        texto: i.tipo === "renda"
          ? `${rotulo}: a renda de ${quem} é privada — só ${quem} inclui a própria`
          : `${rotulo}: as contas pessoais de ${quem} são privadas — só ${quem} inclui as próprias (ou deixe como da casa)`,
      });
    }
  }
  return problemas;
}

/**
 * Os itens privados de um membro quando ele deixa de ser `de`: vão para a nova
 * pessoa dele (`para`) ou, se ele sai do plano, saem junto — senão ficariam à vista.
 */
export function transferirPrivados(d: DadosFamilia, o: Ocultacao, para: string | null): DadosFamilia {
  const meu = (i: ItemFamilia) => itemOculto(i, [o]);
  return {
    ...d,
    cenarios: d.cenarios.map((c) => ({
      ...c,
      itens: para === null
        ? c.itens.filter((i) => !meu(i))
        : c.itens.map((i) => (meu(i) ? { ...i, pessoa: para, para: i.tipo === "conta" ? para : null } : i)),
    })),
  };
}

const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Junta campo a campo o que cada lado mudou desde a base. Campo mudado pelos dois,
 * de jeitos diferentes, é conflito: fica o que foi salvo antes ("deles").
 */
function mesclarCampos<T extends object>(base: T, meu: T, deles: T, rotulo: string, conflitos: string[], ignorar: string[] = []): T {
  const out = { ...deles } as Record<string, unknown>;
  const b = base as Record<string, unknown>, m = meu as Record<string, unknown>, d = deles as Record<string, unknown>;
  let conflito = false;
  for (const k of new Set([...Object.keys(b), ...Object.keys(m), ...Object.keys(d)])) {
    if (ignorar.includes(k)) continue;
    if (igual(m[k], b[k]) || igual(m[k], d[k])) continue; // eu não mudei, ou mudamos igual
    if (igual(d[k], b[k])) { out[k] = m[k]; continue; }   // só eu mudei
    conflito = true;
  }
  if (conflito) conflitos.push(rotulo);
  return out as T;
}

/**
 * Junta duas listas pela chave: o que cada lado incluiu entra; o que um lado tirou
 * sai, a não ser que o outro tenha alterado (aí fica, e vira aviso).
 */
function mesclarLista<T extends { chave: string }>(
  base: T[], meu: T[], deles: T[], rotulo: (x: T) => string, conflitos: string[],
  mesclar: (b: T, m: T, d: T) => T,
): T[] {
  const B = new Map(base.map((x) => [x.chave, x]));
  const M = new Map(meu.map((x) => [x.chave, x]));
  const D = new Map(deles.map((x) => [x.chave, x]));
  const out: T[] = [];
  for (const d of deles) {
    const b = B.get(d.chave), m = M.get(d.chave);
    if (!b) { out.push(m && !igual(m, d) ? mesclar(d, m, d) : d); continue; } // incluído por eles
    if (!m) {                                    // eu tirei
      if (!igual(b, d)) { conflitos.push(rotulo(d)); out.push(d); }
      continue;
    }
    out.push(mesclar(b, m, d));
  }
  for (const m of meu) {
    if (D.has(m.chave)) continue;
    const b = B.get(m.chave);
    if (!b) { out.push(m); continue; }           // incluído por mim
    if (!igual(b, m)) { conflitos.push(rotulo(m)); out.push(m); } // eles tiraram, eu alterei
  }
  return out;
}

export interface Mescla { dados: DadosFamilia; conflitos: string[] }

/**
 * Edição simultânea: "base" é o plano que eu carreguei, "meu" é como deixei e
 * "deles" é o que outra pessoa salvou nesse meio-tempo. O que cada um mudou em
 * linhas (ou campos) diferentes se junta; o que os dois mudaram no mesmo campo
 * fica como a outra pessoa salvou e é listado em `conflitos`.
 */
export function mesclarPlanos(base: DadosFamilia, meu: DadosFamilia, deles: DadosFamilia): Mescla {
  const conflitos: string[] = [];
  const pessoas = mesclarLista(base.pessoas, meu.pessoas, deles.pessoas, (p) => p.nome, conflitos,
    (b, m, d) => mesclarCampos(b, m, d, m.nome, conflitos));
  const cenarios = mesclarLista(base.cenarios, meu.cenarios, deles.cenarios, (c) => `cenário “${c.nome}”`, conflitos,
    (b, m, d) => {
      const onde = d.principal ? "" : ` (cenário “${d.nome}”)`;
      const c = mesclarCampos(b, m, d, `cenário “${d.nome}”`, conflitos, ["itens"]);
      c.itens = mesclarLista(b.itens, m.itens, d.itens, (i) => `“${i.descricao || "item sem descrição"}”${onde}`, conflitos,
        (bi, mi, di) => mesclarCampos(bi, mi, di, `“${di.descricao || mi.descricao || "item sem descrição"}”${onde}`, conflitos));
      return c;
    });
  // exatamente um principal (os dois lados não trocam o principal, mas por garantia)
  if (cenarios.filter((c) => c.principal).length !== 1) {
    const p = deles.cenarios.find((c) => c.principal)?.chave;
    for (const c of cenarios) c.principal = c.chave === p;
  }
  return { dados: { pessoas, cenarios }, conflitos: [...new Set(conflitos)] };
}

// ─── Conferência antes de salvar ──────────────────────────────────────────────

/** Linha que o usuário adicionou e deixou em branco (sem descrição e sem valor): sai ao salvar. */
export function semLinhasVazias(d: DadosFamilia): DadosFamilia {
  return { ...d, cenarios: d.cenarios.map((c) => ({ ...c, itens: c.itens.filter((i) => i.descricao.trim() || i.valor > 0) })) };
}

export interface Problema { cenario: string; item: string | null; texto: string }

/** O que impede salvar, em palavras do usuário (a validação do servidor é a mesma, em termos técnicos). */
export function problemasDoPlano(d: DadosFamilia): Problema[] {
  const pessoas = new Map(d.pessoas.map((p) => [p.chave, p]));
  const varios = d.cenarios.length > 1;
  const problemas: Problema[] = [];
  for (const c of d.cenarios) {
    const onde = varios ? ` (cenário “${c.nome}”)` : "";
    for (const i of c.itens) {
      const quem = pessoas.get(i.pessoa);
      const nome = i.descricao.trim() ? `“${i.descricao.trim()}”` : i.tipo === "renda" ? `Renda de ${quem?.nome ?? "alguém"}` : "Conta sem descrição";
      const add = (texto: string) => problemas.push({ cenario: c.chave, item: i.chave, texto: `${nome}${onde}: ${texto}` });
      if (!i.descricao.trim()) add("falta a descrição");
      if (!(i.valor > 0)) add("falta o valor");
      if (!quem) add(i.tipo === "renda" ? "escolha de quem é a renda" : "escolha quem paga");
      else if (!pagaContas(quem)) add(`${quem.nome} é dependente: não tem renda nem paga contas`);
      if (i.tipo === "conta" && i.para !== null && !pessoas.has(i.para)) add("escolha para quem é");
    }
    if (!c.nome.trim()) problemas.push({ cenario: c.chave, item: null, texto: "Um cenário está sem nome" });
  }
  return problemas;
}
