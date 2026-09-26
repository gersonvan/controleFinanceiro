import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { carregarLancamentos } from "@/lib/financas-dados";
import { mesesAte } from "@/lib/financas";
import { resumirHistorico } from "@/lib/planejamento-historico";

// Histórico por categoria para sugerir valores na Fotografia do mês:
// 12 meses fechados (até o mês passado); médias sobre os 6 últimos.
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const hoje = new Date();
  const passado = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth() - 1, 1));
  const meses = mesesAte(passado.getUTCFullYear(), passado.getUTCMonth() + 1, 12);
  const lancamentos = await carregarLancamentos(userId, meses[0], meses[11]);
  return NextResponse.json(resumirHistorico(lancamentos, meses));
}
