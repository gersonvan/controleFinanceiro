import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { parseCSV } from "@/lib/importacao/tipos";

// Recebe um CSV e devolve as primeiras linhas já separadas em células,
// para o usuário montar o mapeamento visualmente.
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File;
  const delimitador = (formData.get("delimitador") as string) || ",";

  if (!file) return NextResponse.json({ error: "Arquivo obrigatório" }, { status: 400 });

  const texto = await file.text();
  const linhas = parseCSV(texto, delimitador);
  const maxCols = Math.max(0, ...linhas.slice(0, 15).map((l) => l.length));

  return NextResponse.json({
    linhas: linhas.slice(0, 15), // amostra
    totalLinhas: linhas.length,
    maxCols,
  });
}
