import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { idSchema, lerQuery, validar } from "@/lib/validacao";
import { desfazerImportacao, importacoesRecentes } from "@/lib/importacoes";

// Importações recentes que ainda têm lançamentos (para desfazer).
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  return NextResponse.json(await importacoesRecentes(userId));
}

// Desfazer: apaga os lançamentos que a importação criou.
export async function DELETE(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const v = validar(idSchema, lerQuery(req).id);
  if (!v.ok) return v.resposta;
  const r = await desfazerImportacao(userId, v.dados);
  if (!r) return NextResponse.json({ error: "Importação não encontrada" }, { status: 404 });
  return NextResponse.json(r);
}
