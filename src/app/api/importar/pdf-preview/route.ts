import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { detectarBancoPDF, parsePDF } from "@/lib/importacao/pdf";
import { prisma } from "@/lib/db";
import { escopoDoUsuario } from "@/lib/tenant";
import { erro400, lerArquivo } from "@/lib/validacao";
import { ehPDF, extrairTextoPDF } from "@/lib/importacao/arquivo";
import { ensureBuiltinPerfis } from "@/lib/importacao/perfis-nativos";

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const formData = await req.formData();
  const arquivo = lerArquivo(formData);
  if (!arquivo.ok) return arquivo.resposta;
  const file = arquivo.dados;

  // Mesma leitura da importação (pdf-parse v2) — uma cópia antiga aqui chamava a API da v1 e sempre falhava
  let texto: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!ehPDF(buffer)) return erro400("O arquivo enviado não é um PDF");
    texto = await extrairTextoPDF(buffer);
  } catch (e) {
    console.error("Erro ao ler PDF na prévia", e);
    return erro400("Não foi possível ler o PDF. Verifique se é um PDF digital (não escaneado).");
  }

  const { builtinKey, bancoNome } = detectarBancoPDF(texto);

  // Perfil nativo do banco (cria os que faltam — ex.: Sofisa, que é novo)
  let perfil = null;
  if (builtinKey) {
    await ensureBuiltinPerfis(userId);
    perfil = await prisma.perfilImportacao.findFirst({ where: escopoDoUsuario(userId, { builtin: builtinKey }) });
  }
  const perfilId = perfil?.id ?? null;

  // Pré-visualização: parseia as primeiras 10 transações com perfil genérico
  const perfilTemp = {
    nome: bancoNome,
    conta: "Prévia",
    formato: "pdf" as const,
    builtin: builtinKey,
    delimitador: ",", linhasPular: 0, formatoData: "DD/MM/AAAA",
    modoValor: "unica" as const,
    colData: null, colDescricao: null, colParcela: null, colValor: null,
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
    perfil,
    preview,
    total: preview.length,
  });
}
