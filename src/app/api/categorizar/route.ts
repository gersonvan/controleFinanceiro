import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { categorizarComOrigem } from "@/lib/categorias";
import { carregarMemoriaCategorizacao } from "@/lib/memoria";
import { getSessionUserId } from "@/lib/session";
import { escopoDoUsuario } from "@/lib/tenant";
import { z } from "zod";
import { categoriaSchema, idSchema, lerCorpo, validar } from "@/lib/validacao";
import { criarCliente, iaConfigurada, sugerirCategorias } from "@/lib/categorizacao-inteligente";

// Os lotes da IA vão em paralelo, cada um com até 25 s; folga para a resposta.
export const maxDuration = 60;

// Teto por clique: cabe no tempo da função e numa revisão de tela; o que sobrar
// fica para o próximo clique.
const MAX_IA_POR_REQUISICAO = 200;

// Se o botão "✨ Inteligente" (categorização inteligente) deve aparecer: há chave no servidor.
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  return NextResponse.json({ inteligente: iaConfigurada() });
}

const categorizacaoSchema = z.object({
  ids: z.array(idSchema).max(1000).optional(),
  inteligente: z.boolean().default(false),
});

// Memória → histórico → regras gravam direto (como sempre). Com `inteligente`,
// a IA só SUGERE para o que sobrou: as sugestões voltam para o usuário revisar
// e gravar pelo PUT.
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const v = validar(categorizacaoSchema, await lerCorpo(req));
  if (!v.ok) return v.resposta;
  const { ids, inteligente } = v.dados;

  // Memória Local + histórico do que o usuário já categorizou
  const fonte = await carregarMemoriaCategorizacao(userId);

  // Só processa lançamentos sem categoria do usuário
  const where = escopoDoUsuario(userId, ids?.length
    ? { id: { in: ids }, categoria: null as null }
    : { categoria: null as null });

  const lancamentos = await prisma.lancamento.findMany({ where });

  const contagem = { memoria: 0, historico: 0, regra: 0 };
  const resolvidos: { id: number; categoria: string }[] = [];
  const aindaSemCategoria: typeof lancamentos = [];

  // Memória → delivery → histórico → regras
  for (const l of lancamentos) {
    const { categoria, origem } = categorizarComOrigem(l.descricao, "", l.tipo, fonte);
    if (origem === "memoria" || origem === "historico" || origem === "regra") {
      contagem[origem]++;
      resolvidos.push({ id: l.id, categoria });
    } else aindaSemCategoria.push(l);
  }

  // só onde ainda está sem categoria: não sobrescreve o que o usuário fez enquanto isso
  if (resolvidos.length > 0) {
    await prisma.$transaction(
      resolvidos.map((item) =>
        prisma.lancamento.updateMany({
          where: escopoDoUsuario(userId, { id: item.id, categoria: null }),
          data: { categoria: item.categoria },
        })
      )
    );
  }

  // Categorização inteligente: sugestões para revisar, nada gravado aqui.
  // "ok" | "sem-chave" | "erro": a tela avisa em vez de falhar calada.
  let ia: { inteligente: string; inteligenteErro?: string; sugestoes?: unknown[] } | null = null;
  if (inteligente && aindaSemCategoria.length > 0) {
    if (!iaConfigurada()) ia = { inteligente: "sem-chave" };
    else {
      const alvo = aindaSemCategoria.slice(0, MAX_IA_POR_REQUISICAO);
      const r = await sugerirCategorias(
        alvo.map(({ id, descricao, tipo }) => ({ id, descricao, tipo })),
        { cliente: criarCliente(), modelo: process.env.IA_MODELO },
      );
      const porId = new Map(alvo.map((l) => [l.id, l]));
      ia = {
        inteligente: r.erro ? "erro" : "ok",
        ...(r.erro && { inteligenteErro: r.erro.message }),
        sugestoes: r.sugestoes.map((s) => {
          const l = porId.get(s.id)!;
          return { ...s, descricao: l.descricao, data: l.data, valor: l.valor, conta: l.conta };
        }),
      };
    }
  }

  return NextResponse.json({
    total: lancamentos.length,
    porMemoria: contagem.memoria,
    porHistorico: contagem.historico,
    porRegras: contagem.regra,
    semCategoria: aindaSemCategoria.length,
    ...ia,
  });
}

const aplicacaoSchema = z.object({
  itens: z.array(z.object({ id: idSchema, categoria: categoriaSchema })).min(1).max(MAX_IA_POR_REQUISICAO),
});

// Grava as sugestões que o usuário confirmou (com a categoria que ele escolheu),
// só nos lançamentos dele que continuam sem categoria.
export async function PUT(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const v = validar(aplicacaoSchema, await lerCorpo(req));
  if (!v.ok) return v.resposta;

  const resultados = await prisma.$transaction(
    v.dados.itens.map(({ id, categoria }) =>
      prisma.lancamento.updateMany({
        where: escopoDoUsuario(userId, { id, categoria: null }),
        data: { categoria },
      })
    )
  );
  return NextResponse.json({ aplicados: resultados.reduce((a, r) => a + r.count, 0) });
}
