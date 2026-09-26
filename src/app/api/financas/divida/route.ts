import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { carregarLancamentos, periodoSchema } from "@/lib/financas-dados";
import { custoDivida, mesesAte } from "@/lib/financas";
import { lerQuery, validar } from "@/lib/validacao";

// Custo de dívida (juros, IOF, multas) nos 12 meses até o mês pedido.
export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const v = validar(periodoSchema, lerQuery(req));
  if (!v.ok) return v.resposta;
  const meses = mesesAte(v.dados.ano, v.dados.mes, 12);
  const lancamentos = await carregarLancamentos(userId, meses[0], meses[11]);
  const r = custoDivida(lancamentos, meses);
  return NextResponse.json({ ...r, mes: r.serie[11] });
}
