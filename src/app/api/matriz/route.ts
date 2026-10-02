import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { CATEGORIAS_NEUTRAS, GRUPOS_CATEGORIAS, chaveMemoria } from "@/lib/categorias";
import { carregarApelidos } from "@/lib/apelidos";
import { CATEGORIA_INVESTIMENTO } from "@/lib/financas";
import { comValorLiquido } from "@/lib/reembolso";
import { nomeDoEstabelecimento } from "@/lib/estabelecimento";
import { getSessionUserId } from "@/lib/session";
import { escopoDoUsuario } from "@/lib/tenant";
import { filtroPeriodo, filtrosLancamentoSchema } from "@/lib/filtros";
import { lerQuery, validar } from "@/lib/validacao";

const matrizSchema = filtrosLancamentoSchema.pick({ tipo: true, dataInicio: true, dataFim: true });

export interface MatrizDescricao {
  descricao: string;
  porMes: Record<string, number>;
}

export interface MatrizLinha {
  categoria: string;
  totais: Record<string, number>;
  media: number;
  descricoes: MatrizDescricao[];
}

/** Grupo (Moradia, Transporte…) com a soma das suas categorias; a Matriz abre por aqui. */
export interface MatrizGrupo {
  grupo: string;
  totais: Record<string, number>;
  media: number;
  categorias: MatrizLinha[];
}

export interface MatrizData {
  meses: string[];
  linhas: MatrizLinha[];
  grupos: MatrizGrupo[];
  /** Pagamento de fatura, transferências entre contas, aplicações…: não são renda nem gasto */
  internas: MatrizLinha[];
}

/** Fica fora das linhas principais (mesma regra do dashboard): internas e aplicações. */
const ehInterna = (categoria: string) => CATEGORIAS_NEUTRAS.has(categoria) || categoria === CATEGORIA_INVESTIMENTO;

function toMesStr(d: Date): string {
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

// Nomes longos → forma canônica curta já usada em outros lançamentos
const CANONICOS: Record<string, string> = {
  "BRISANET SERVICOS DE TELECOMUNICACOES": "BRISANET",
  "UNIMED FORTALEZA SOCIEDADE COOPERATIVA MEDICA LTD": "UNIMED FORTALEZA SOCIEDADE COOP",
  "SEFAZ CEARA-DAE-COD": "SEFAZ CE DAE",
};

function normalizarDescricao(descricao: string): string {
  // Remove CNPJ e tudo depois (Nubank Pix: "VENDOR - 00.000.000/0000-00 - ...")
  let d = descricao;
  const cnpjIdx = d.search(/ - \d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
  if (cnpjIdx > 0) d = d.slice(0, cnpjIdx);
  // sem meio de pagamento, data/hora, "Data balanc." do BB e LTDA/S.A. (lib/estabelecimento)
  d = nomeDoEstabelecimento(d).toUpperCase();
  return CANONICOS[d] ?? d;
}

// média dos meses com valor — a mesma regra para categoria e grupo
function mediaDosMeses(totais: Record<string, number>, meses: string[]): number {
  const vals = meses.map((m) => totais[m] || 0).filter((v) => v > 0);
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

const GRUPO_DA_CATEGORIA = new Map(GRUPOS_CATEGORIAS.flatMap((g) => g.categorias.map((c): [string, string] => [c, g.grupo])));
const ORDEM_CATEGORIA = new Map(GRUPOS_CATEGORIAS.flatMap((g) => g.categorias.map((c, i): [string, number] => [c, i])));
const OUTROS = "Outros"; // categoria antiga, fora da lista atual

/** Na ordem dos seletores (estável de um mês para o outro); categorias também. */
function agruparPorGrupo(linhas: MatrizLinha[], meses: string[]): MatrizGrupo[] {
  const porGrupo = new Map<string, MatrizLinha[]>();
  for (const l of linhas) {
    const g = GRUPO_DA_CATEGORIA.get(l.categoria) ?? OUTROS;
    porGrupo.set(g, [...(porGrupo.get(g) ?? []), l]);
  }
  const ordem = [...GRUPOS_CATEGORIAS.map((g) => g.grupo), OUTROS];
  return ordem.filter((g) => porGrupo.has(g)).map((grupo) => {
    const categorias = porGrupo.get(grupo)!.sort((a, b) =>
      (ORDEM_CATEGORIA.get(a.categoria) ?? 99) - (ORDEM_CATEGORIA.get(b.categoria) ?? 99) || a.categoria.localeCompare(b.categoria, "pt-BR"));
    const totais: Record<string, number> = {};
    for (const c of categorias) for (const [m, v] of Object.entries(c.totais)) totais[m] = (totais[m] || 0) + v;
    return { grupo, totais, media: mediaDosMeses(totais, meses), categorias };
  });
}

function sortMes(a: string, b: string): number {
  const key = (m: string) => { const [mm, yyyy] = m.split("/"); return `${yyyy}-${mm}`; };
  return key(a).localeCompare(key(b));
}

export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const v = validar(matrizSchema, lerQuery(req));
  if (!v.ok) return v.resposta;
  const { tipo, dataInicio, dataFim } = v.dados;

  const where: Record<string, unknown> = escopoDoUsuario(userId, { categoria: { not: null } });
  if (tipo) where.tipo = tipo;
  if (dataInicio || dataFim) where.OR = filtroPeriodo(dataInicio, dataFim);

  const [lancamentos, apelidos] = await Promise.all([
    prisma.lancamento.findMany({
      where,
      select: { categoria: true, descricao: true, valor: true, data: true, mesReferencia: true, valorReembolsado: true },
    }).then((ls) => ls.map(comValorLiquido)),
    carregarApelidos(userId),
  ]);

  // categoria → descricao → mes → soma
  const estrutura: Record<string, Record<string, Record<string, number>>> = {};
  const mesesSet = new Set<string>();

  for (const l of lancamentos) {
    if (!l.categoria) continue;
    const ref = l.mesReferencia || l.data;
    const mes = toMesStr(new Date(ref));
    mesesSet.add(mes);

    // "mesmo pagamento" do usuário vira uma linha só (ex.: AYMORE + SANTANDER)
    const desc = apelidos.get(chaveMemoria(l.descricao)) ?? normalizarDescricao(l.descricao);
    if (!estrutura[l.categoria]) estrutura[l.categoria] = {};
    if (!estrutura[l.categoria][desc]) estrutura[l.categoria][desc] = {};
    estrutura[l.categoria][desc][mes] =
      (estrutura[l.categoria][desc][mes] || 0) + Math.abs(l.valor);
  }

  const meses = [...mesesSet].sort(sortMes);

  const linhas: MatrizLinha[] = Object.entries(estrutura).map(([categoria, descMap]) => {
    const totais: Record<string, number> = {};
    const descricoes: MatrizDescricao[] = Object.entries(descMap)
      .map(([descricao, porMes]) => ({ descricao, porMes }))
      .sort((a, b) => a.descricao.localeCompare(b.descricao, "pt-BR"));

    for (const { porMes } of descricoes) {
      for (const [mes, v] of Object.entries(porMes)) {
        totais[mes] = (totais[mes] || 0) + v;
      }
    }

    return { categoria, totais, media: mediaDosMeses(totais, meses), descricoes };
  });

  linhas.sort((a, b) => a.categoria.localeCompare(b.categoria, "pt-BR"));

  const principais = linhas.filter((l) => !ehInterna(l.categoria));
  return NextResponse.json({
    meses,
    linhas: principais,
    grupos: agruparPorGrupo(principais, meses),
    internas: linhas.filter((l) => ehInterna(l.categoria)),
  } satisfies MatrizData);
}
