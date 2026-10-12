import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { carregarLancamentos } from "@/lib/financas-dados";
import { mesesAte } from "@/lib/financas";
import { resumirHistorico } from "@/lib/planejamento-historico";
import { carregarCatalogo } from "@/lib/categorias-usuario";

// Histórico por categoria para sugerir valores na Fotografia do mês:
// 12 meses fechados (até o mês passado); médias sobre os 6 últimos.
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const hoje = new Date();
  const passado = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth() - 1, 1));
  const meses = mesesAte(passado.getUTCFullYear(), passado.getUTCMonth() + 1, 12);
  const [lancamentos, catalogo] = await Promise.all([carregarLancamentos(userId, meses[0], meses[11]), carregarCatalogo(userId)]);
  // as do grupo Entradas (nativas e próprias) contam o que entrou; as outras, o que saiu
  return NextResponse.json(resumirHistorico(lancamentos, meses, catalogo.entradas));
}
