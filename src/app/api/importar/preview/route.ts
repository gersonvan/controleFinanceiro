import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { parseCSV } from "@/lib/importacao/tipos";
import { z } from "zod";
import { corpoGrandeDemais, lerArquivo, validar } from "@/lib/validacao";
import { decodificarTexto } from "@/lib/importacao/arquivo";

const delimitadorSchema = z.string().min(1).max(2).nullable().default(",");

// Recebe um CSV e devolve as primeiras linhas já separadas em células,
// para o usuário montar o mapeamento visualmente.
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const grande = corpoGrandeDemais(req);
  if (grande) return grande;
  const formData = await req.formData();
  const arquivo = lerArquivo(formData);
  if (!arquivo.ok) return arquivo.resposta;
  const file = arquivo.dados;

  const v = validar(delimitadorSchema, formData.get("delimitador"));
  if (!v.ok) return v.resposta;
  const delimitador = v.dados || ",";

  const texto = decodificarTexto(Buffer.from(await file.arrayBuffer()));
  const linhas = parseCSV(texto, delimitador);
  const maxCols = Math.max(0, ...linhas.slice(0, 15).map((l) => l.length));

  return NextResponse.json({
    linhas: linhas.slice(0, 15), // amostra
    totalLinhas: linhas.length,
    maxCols,
  });
}
