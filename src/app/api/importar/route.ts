import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { importar, PerfilCompleto } from "@/lib/importacao/engine";
import { dadosDoUsuario, escopoDoUsuario } from "@/lib/tenant";

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File;
  const perfilId = formData.get("perfilId") as string;
  const mesRefStr = formData.get("mesReferencia") as string | null;

  if (!file || !perfilId) {
    return NextResponse.json({ error: "Arquivo e perfil são obrigatórios" }, { status: 400 });
  }

  const perfil = await prisma.perfilImportacao.findFirst({
    where: escopoDoUsuario(userId, { id: parseInt(perfilId) }),
  });
  if (!perfil) return NextResponse.json({ error: "Perfil não encontrado" }, { status: 404 });

  // Faturas exigem mês de referência informado no upload
  let mesReferenciaManual: Date | null = null;
  if (perfil.usaMesReferencia) {
    if (!mesRefStr) {
      return NextResponse.json({ error: "Informe o mês de referência para faturas" }, { status: 400 });
    }
    const [ano, mes] = mesRefStr.split("-").map(Number);
    mesReferenciaManual = new Date(ano, mes - 1, 1);
  }

  let texto: string;
  if (perfil.formato === "pdf") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse");
      const buffer = Buffer.from(await file.arrayBuffer());
      const pdfData = await pdfParse(buffer);
      texto = pdfData.text;
    } catch (e) {
      return NextResponse.json({ error: `Erro ao ler PDF: ${String(e)}` }, { status: 400 });
    }
  } else {
    texto = await file.text();
  }
  const fileName = file.name;

  const memoria = await prisma.memoriaIA.findMany({ where: escopoDoUsuario(userId) });
  const memoriaMap = new Map<string, string>(
    memoria.map((m): [string, string] => [m.descricao.toLowerCase(), m.categoriaCorreta])
  );

  let lancamentos;
  try {
    lancamentos = importar(texto, fileName, perfil as PerfilCompleto, memoriaMap, mesReferenciaManual);
  } catch (e) {
    return NextResponse.json({ error: `Erro ao processar: ${String(e)}` }, { status: 400 });
  }

  // Evita duplicatas (por usuário)
  const existing = await prisma.lancamento.findMany({
    where: escopoDoUsuario(userId),
    select: { data: true, descricao: true, valor: true },
  });
  const existingKeys = new Set(
    existing.map(
      (l) => `${l.data.toISOString().slice(0, 10)}|${l.descricao}|${l.valor.toFixed(2)}`
    )
  );

  const novos = lancamentos.filter((l) => {
    const key = `${l.data.toISOString().slice(0, 10)}|${l.descricao}|${l.valor.toFixed(2)}`;
    return !existingKeys.has(key);
  });

  if (novos.length > 0) {
    await prisma.lancamento.createMany({
      data: novos.map((l) => dadosDoUsuario(userId, {
        data: l.data,
        descricao: l.descricao,
        categoria: l.categoria || null,
        valor: l.valor,
        tipo: l.tipo,
        conta: l.conta,
        status: "Paga",
        fonte: l.fonte,
        mesReferencia: l.mesReferencia,
      })),
    });
  }

  return NextResponse.json({
    processados: lancamentos.length,
    novos: novos.length,
    duplicados: lancamentos.length - novos.length,
  });
}
