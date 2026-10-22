import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { carregarLancamentos, periodoSchema } from "@/lib/financas-dados";
import { chaveMes } from "@/lib/financas";
import { dividirMes } from "@/lib/fatias";
import { carregarCatalogo } from "@/lib/categorias-usuario";
import { lerQuery, validar } from "@/lib/validacao";

// 50/30/20 do mês: renda e quanto dela foi para necessidades, desejos e futuro.
export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const v = validar(periodoSchema, lerQuery(req));
  if (!v.ok) return v.resposta;
  const mes = chaveMes(v.dados.ano, v.dados.mes);
  const [lancamentos, catalogo] = await Promise.all([carregarLancamentos(userId, mes, mes), carregarCatalogo(userId)]);
  return NextResponse.json({ mes, ...dividirMes(lancamentos, catalogo) });
}
