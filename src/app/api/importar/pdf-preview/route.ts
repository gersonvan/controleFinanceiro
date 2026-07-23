import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { detectarBancoPDF, parsePDF } from "@/lib/importacao/pdf";
import { prisma } from "@/lib/db";
import { escopoDoUsuario } from "@/lib/tenant";

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 });

  // Extrai texto do PDF via pdf-parse (importação dinâmica evita problemas de bundling)
  let texto: string;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse");
    const buffer = Buffer.from(await file.arrayBuffer());
    const data = await pdfParse(buffer);
    texto = data.text;
  } catch (e) {
    return NextResponse.json({ error: `Erro ao ler PDF: ${String(e)}` }, { status: 400 });
  }

  const { builtinKey, bancoNome } = detectarBancoPDF(texto);

  // Busca o perfil correspondente (pode ainda não existir se nunca visitou /api/perfis)
  let perfilId: number | null = null;
  if (builtinKey) {
    const p = await prisma.perfilImportacao.findFirst({ where: escopoDoUsuario(userId, { builtin: builtinKey }) });
    perfilId = p?.id ?? null;
  }

  // Pré-visualização: parseia as primeiras 10 transações com perfil genérico
  const perfilTemp = {
    nome: bancoNome,
    conta: "Prévia",
    formato: "pdf" as const,
    builtin: builtinKey,
    delimitador: ",", linhasPular: 0, formatoData: "DD/MM/AAAA",
    modoValor: "unica" as const,
    colData: null, colDescricao: null, colValor: null,
    colEntrada: null, colSaida: null,
    inverterSinal: false, usaMesReferencia: false,
  };

  const memoriaIA = new Map<string, string>();
  let preview: Array<{ data: string; descricao: string; valor: number }> = [];

  try {
    const lancamentos = parsePDF(texto, perfilTemp, memoriaIA, null);
    preview = lancamentos.slice(0, 10).map((l) => ({
      data: l.data.toLocaleDateString("pt-BR"),
      descricao: l.descricao,
      valor: l.valor,
    }));
  } catch {
    // preview vazio mas não falha — usuário vê banco detectado mesmo sem preview
  }

  return NextResponse.json({
    builtinKey,
    bancoNome,
    perfilId,
    preview,
    total: preview.length,
  });
}
