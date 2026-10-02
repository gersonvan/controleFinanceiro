import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { escopoDoUsuario } from "@/lib/tenant";
import { lerQuery, validar } from "@/lib/validacao";
import { chaveAgrupada, chaveMemoria } from "@/lib/categorias";
import { carregarApelidos } from "@/lib/apelidos";

export interface GrupoDescricao {
  chave: string;        // identifica o grupo ("Ver os N", aplicar)
  descricao: string;    // a descrição mais recente, para mostrar
  apelido?: string;     // nome do "mesmo pagamento", quando o usuário juntou descrições
  descricoes: string[]; // variações (ex.: com e sem "- Data balanc.: 03"); ensinam a Memória
  ids: number[];        // lançamentos do grupo — aplicar usa os ids, não a descrição exata
  quantidade: number;
  total: number;        // soma dos valores (negativo = saída)
  ultimaData: string;   // AAAA-MM-DD
  contas: string[];
}

const filtroSchema = z.object({
  // "__sem__" = sem categoria; qualquer outro valor filtra pela categoria atual
  categoria: z.string().trim().min(1).max(100),
  // com chave: devolve os lançamentos desse grupo ("Ver os N")
  chave: z.string().min(1).max(600).optional(),
});

// Mesmo estabelecimento com descrições diferentes ("Pagamento de Boleto - X",
// "... X LTDA - Data balanc.: 04") cai no mesmo grupo, e também o que o usuário
// marcou como "mesmo pagamento"; entrada e saída nunca se misturam.
const chaveGrupo = (l: { descricao: string; valor: number }, apelidos: Map<string, string>) =>
  `${l.valor < 0 ? "S" : "E"}|${chaveAgrupada(l.descricao, apelidos)}`;

export interface ItemGrupo { id: number; data: string; valor: number; conta: string }

// Lançamentos agrupados pelo estabelecimento (chave da Memória) — base da tela
// "Revisar categorias": o mesmo Pix/fornecedor recorrente é categorizado de uma vez só.
export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const v = validar(filtroSchema, lerQuery(req));
  if (!v.ok) return v.resposta;
  const { categoria, chave } = v.dados;

  const [lancamentos, apelidos] = await Promise.all([
    prisma.lancamento.findMany({
      where: escopoDoUsuario(userId, { categoria: categoria === "__sem__" ? null : categoria }),
      select: { id: true, descricao: true, valor: true, data: true, conta: true },
      orderBy: { data: "desc" },
    }),
    carregarApelidos(userId),
  ]);

  if (chave) {
    const itens = lancamentos.filter((l) => chaveGrupo(l, apelidos) === chave).slice(0, 500);
    return NextResponse.json({ itens: itens.map((i) => ({ id: i.id, data: i.data.toISOString().slice(0, 10), valor: i.valor, conta: i.conta })) });
  }

  const grupos = new Map<string, GrupoDescricao>();
  for (const l of lancamentos) { // mais recente primeiro: a 1ª descrição vista é a que aparece
    const k = chaveGrupo(l, apelidos);
    const g = grupos.get(k) ?? {
      chave: k, descricao: l.descricao, apelido: apelidos.get(chaveMemoria(l.descricao)),
      descricoes: [], ids: [], quantidade: 0, total: 0, ultimaData: "", contas: [],
    };
    g.quantidade++;
    g.total += l.valor;
    g.ids.push(l.id);
    if (!g.descricoes.includes(l.descricao)) g.descricoes.push(l.descricao);
    const dia = l.data.toISOString().slice(0, 10);
    if (dia > g.ultimaData) g.ultimaData = dia;
    if (!g.contas.includes(l.conta)) g.contas.push(l.conta);
    grupos.set(k, g);
  }

  const lista = [...grupos.values()]
    .map((g) => ({ ...g, total: Math.round(g.total * 100) / 100 }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

  return NextResponse.json({ totalLancamentos: lancamentos.length, grupos: lista.slice(0, 200) });
}
