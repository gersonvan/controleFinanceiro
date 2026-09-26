import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { comValorLiquido } from "@/lib/reembolso";
import { categoriaSchema, lerCorpo, lerQuery, opcional, validar } from "@/lib/validacao";
import { getSessionUserId } from "@/lib/session";
import { escopoDoUsuario } from "@/lib/tenant";
import { calcularPrevisao } from "@/lib/previsao";
import type { ItemPlanejado } from "@/lib/planejamento";

export type { ItemPrevisao, HistoricoItem, HistoricoLancamento } from "@/lib/previsao";

const consultaSchema = z.object({ base: opcional(z.enum(["fotografia", "historico"])).default("fotografia") });
const encerrarSchema = z.object({ categoria: categoriaSchema, encerrada: z.boolean() });

// Previsão dos próximos 12 meses numa base só (fotografia ou histórico), com parcelas.
export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const v = validar(consultaSchema, lerQuery(req));
  if (!v.ok) return v.resposta;

  const agora = new Date();
  const hoje = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
  const inicio = new Date(Date.UTC(agora.getUTCFullYear() - 2, agora.getUTCMonth(), 1)); // parcelas longas + 6 meses de histórico

  const [lancamentos, planejados, perfil] = await Promise.all([
    prisma.lancamento.findMany({
      where: escopoDoUsuario(userId, { valor: { lt: 0 }, OR: [{ mesReferencia: { gte: inicio } }, { mesReferencia: null, data: { gte: inicio } }] }),
      select: { descricao: true, categoria: true, valor: true, data: true, mesReferencia: true, valorReembolsado: true },
    }).then((ls) => ls.map(comValorLiquido)),
    prisma.planejamentoItem.findMany({ where: escopoDoUsuario(userId) }) as Promise<ItemPlanejado[]>,
    prisma.userProfile.findUnique({ where: escopoDoUsuario(userId), select: { previsaoEncerradas: true } }),
  ]);

  const encerradas = perfil?.previsaoEncerradas ?? [];
  const r = calcularPrevisao({ lancamentos, planejados, encerradas: new Set(encerradas), base: v.dados.base, hoje });
  return NextResponse.json({ ...r, encerradas });
}

// Marca/desmarca uma categoria como encerrada (vale zero na previsão).
export async function PATCH(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const v = validar(encerrarSchema, await lerCorpo(req));
  if (!v.ok) return v.resposta;
  const { categoria, encerrada } = v.dados;

  const perfil = await prisma.userProfile.findUnique({ where: escopoDoUsuario(userId), select: { previsaoEncerradas: true } });
  const atuais = new Set(perfil?.previsaoEncerradas ?? []);
  if (encerrada) atuais.add(categoria); else atuais.delete(categoria);
  const previsaoEncerradas = [...atuais].sort();
  await prisma.userProfile.upsert({
    where: escopoDoUsuario(userId),
    update: { previsaoEncerradas },
    create: { userId, previsaoEncerradas },
  });
  return NextResponse.json({ encerradas: previsaoEncerradas });
}
