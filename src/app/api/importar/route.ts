import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { importar, PerfilCompleto } from "@/lib/importacao/engine";
import { dadosDoUsuario, escopoDoUsuario } from "@/lib/tenant";
import { z } from "zod";
import { erro400, idSchema, lerArquivo, opcional, validar } from "@/lib/validacao";

const importacaoSchema = z.object({
  perfilId: idSchema,
  // <input type="month"> envia "AAAA-MM"
  mesReferencia: opcional(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use o formato AAAA-MM")),
});

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const formData = await req.formData();
  const arquivo = lerArquivo(formData);
  if (!arquivo.ok) return arquivo.resposta;
  const file = arquivo.dados;

  const v = validar(importacaoSchema, {
    perfilId: formData.get("perfilId"),
    mesReferencia: formData.get("mesReferencia"),
  });
  if (!v.ok) return v.resposta;
  const { perfilId, mesReferencia: mesRefStr } = v.dados;

  const perfil = await prisma.perfilImportacao.findFirst({
    where: escopoDoUsuario(userId, { id: perfilId }),
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
      if (!ehPDF(buffer)) return erro400("O arquivo enviado não é um PDF");
      const pdfData = await pdfParse(buffer);
      texto = pdfData.text;
    } catch (e) {
      console.error("Erro ao ler PDF na importação", e);
      return erro400("Não foi possível ler o PDF. Verifique se é um PDF digital (não escaneado).");
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
    console.error("Erro ao processar arquivo na importação", e);
    return erro400("Não foi possível processar o arquivo com o perfil selecionado.");
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

function ehPDF(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString("latin1") === "%PDF-";
}
