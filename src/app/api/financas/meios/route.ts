import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { tiposDasContas } from "@/lib/contas";
import { carregarLancamentos, periodoSchema } from "@/lib/financas-dados";
import { gastosPorMeio, mediaPorMeio, mesesAte } from "@/lib/financas";
import { lerQuery, validar } from "@/lib/validacao";

// Gastos por meio de pagamento: o mês pedido e os 5 anteriores, com a média deles.
export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const v = validar(periodoSchema, lerQuery(req));
  if (!v.ok) return v.resposta;
  const { ano, mes } = v.dados;

  const meses = mesesAte(ano, mes, 6);
  const [tipos, lancamentos] = await Promise.all([
    tiposDasContas(userId),
    carregarLancamentos(userId, meses[0], meses[5]),
  ]);
  const serie = gastosPorMeio(lancamentos, tipos, meses);
  return NextResponse.json({ meses: serie, atual: serie[5], media: mediaPorMeio(serie.slice(0, 5)) });
}
