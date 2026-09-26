import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { tiposDasContas } from "@/lib/contas";
import { carregarLancamentos, diaAtualSeMesCorrente, periodoSchema } from "@/lib/financas-dados";
import { gastosPorMeio, mesesAte, ritmoDoMes } from "@/lib/financas";
import { lerQuery, validar } from "@/lib/validacao";

// Ritmo do mês: acumulado diário × média dos 5 meses anteriores, com projeção.
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
  const ritmo = ritmoDoMes(lancamentos, tipos, meses[5], meses.slice(0, 5), diaAtualSeMesCorrente(ano, mes));
  const cartaoNoMes = gastosPorMeio(lancamentos, tipos, [meses[5]])[0].porMeio.cartao;
  return NextResponse.json({ ...ritmo, cartaoNoMes });
}
