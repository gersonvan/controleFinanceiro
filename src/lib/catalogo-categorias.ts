// As categorias de cada usuário: a lista nativa (lib/categorias.ts) menos as que
// ele ocultou, mais as personalizadas que criou (model CategoriaUsuario). Puro:
// serve ao servidor (validação, regras) e à tela (seletores, Configurações).
import { CATEGORIAS, CATEGORIAS_DO_SISTEMA, GRUPOS_CATEGORIAS } from "./categorias";
import { CATEGORIA_LIVRE } from "./planejamento-sugestoes";
import type { Grupo as GrupoFotografia } from "./planejamento";

export const GRUPO_OUTRAS = "Outras";
/** Onde o usuário pode criar categorias: Transferências e Empresa só têm as do sistema. */
export const GRUPOS_PERSONALIZAVEIS = [
  ...GRUPOS_CATEGORIAS.map((g) => g.grupo).filter((g) => g !== "Transferências" && g !== "Empresa"),
  GRUPO_OUTRAS,
];
export const MAX_PERSONALIZADAS = 50;

/** Uma linha de CategoriaUsuario, como vem do banco (e como a tela recebe). */
export interface LinhaCategoriaUsuario { nome: string; nativa: boolean; grupo: string | null; destino: string | null }

export interface Catalogo {
  grupos: { grupo: string; categorias: string[] }[]; // o que aparece nos seletores, por grupo
  ocultas: Map<string, string | null>;               // nativa oculta → destino (null = sem categoria)
  personalizadas: { nome: string; grupo: string }[];
  validas: Set<string>;                              // o que pode ser gravado
  entradas: Set<string>;                             // as de entrada (grupo Entradas)
}

const NATIVAS = new Set<string>(CATEGORIAS);
const GRUPO_NATIVO = new Map(GRUPOS_CATEGORIAS.flatMap((g) => g.categorias.map((c): [string, string] => [c, g.grupo])));

export function montarCatalogo(linhas: LinhaCategoriaUsuario[]): Catalogo {
  const ocultas = new Map(linhas
    .filter((l) => l.nativa && NATIVAS.has(l.nome) && !CATEGORIAS_DO_SISTEMA.has(l.nome))
    .map((l): [string, string | null] => [l.nome, l.destino]));
  const personalizadas = linhas
    .filter((l) => !l.nativa && !NATIVAS.has(l.nome))
    .map((l) => ({ nome: l.nome, grupo: GRUPOS_PERSONALIZAVEIS.includes(l.grupo ?? "") ? l.grupo! : GRUPO_OUTRAS }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const grupos = [...GRUPOS_CATEGORIAS.map((g) => g.grupo), GRUPO_OUTRAS]
    .map((grupo) => ({
      grupo,
      categorias: [
        ...(GRUPOS_CATEGORIAS.find((g) => g.grupo === grupo)?.categorias ?? []).filter((c) => !ocultas.has(c)),
        ...personalizadas.filter((p) => p.grupo === grupo).map((p) => p.nome),
      ],
    }))
    .filter((g) => g.categorias.length > 0);
  return {
    grupos, ocultas, personalizadas,
    validas: new Set(grupos.flatMap((g) => g.categorias)),
    entradas: new Set(grupos.find((g) => g.grupo === "Entradas")?.categorias ?? []),
  };
}

export const CATALOGO_PADRAO = montarCatalogo([]);

/** Grupo de qualquer categoria conhecida — nativa (mesmo oculta) ou personalizada. */
export function grupoDaCategoria(c: Catalogo, nome: string): string | null {
  return GRUPO_NATIVO.get(nome) ?? c.personalizadas.find((p) => p.nome === nome)?.grupo ?? null;
}
export const ehDeEntrada = (c: Catalogo, nome: string) => grupoDaCategoria(c, nome) === "Entradas";

export const podeOcultar = (nome: string) => NATIVAS.has(nome) && !CATEGORIAS_DO_SISTEMA.has(nome);

/** A categoria como o usuário a vê: ela mesma, o destino de uma oculta, ou null. */
export function resolverCategoria(c: Catalogo, nome: string): string | null {
  if (c.validas.has(nome)) return nome;
  return c.ocultas.get(nome) ?? null;
}

/** Categoria de um item livre da Fotografia, que sempre precisa de uma. */
export function categoriaLivre(c: Catalogo, grupo: GrupoFotografia): string {
  const livre = resolverCategoria(c, CATEGORIA_LIVRE[grupo]);
  if (livre) return livre;
  const entrada = grupo === "entrada";
  return c.grupos.flatMap((g) => g.categorias).find((n) => c.entradas.has(n) === entrada) ?? CATEGORIA_LIVRE[grupo];
}

/** Para comparar nomes: sem acento, maiúsculas nem espaços repetidos. */
export const normalizarNome = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export const limparNome = (s: string) => s.replace(/\s+/g, " ").trim();

/** Por que o nome não serve para uma categoria personalizada (null = serve). */
export function problemaNoNome(nome: string, c: Catalogo, atual?: string): string | null {
  const limpo = limparNome(nome);
  if (limpo.length < 2 || limpo.length > 40) return "Use de 2 a 40 caracteres.";
  if (!/^[\p{L}\p{N} ()&/,.'+-]+$/u.test(limpo)) return "Use só letras, números, espaços e ( ) & / , . ' + -";
  const n = normalizarNome(limpo);
  if (CATEGORIAS.some((x) => normalizarNome(x) === n)) {
    return c.ocultas.has(CATEGORIAS.find((x) => normalizarNome(x) === n)!)
      ? "Essa categoria do app está oculta: mostre-a de novo em vez de criar outra."
      : "Já existe uma categoria do app com esse nome.";
  }
  if (c.personalizadas.some((p) => p.nome !== atual && normalizarNome(p.nome) === n)) return "Você já tem uma categoria com esse nome.";
  return null;
}

/** Para onde dá para mover o que está em `origem`: outra categoria sua, do mesmo lado (entrada/saída). */
export function destinosPossiveis(c: Catalogo, origem: string): string[] {
  const entrada = ehDeEntrada(c, origem);
  return c.grupos.flatMap((g) => g.categorias).filter((n) => n !== origem && c.entradas.has(n) === entrada);
}
