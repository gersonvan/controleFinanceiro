import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  parseFaturaC6,
  parseExtratoC6,
  parseFaturaNubank,
  parseExtratoNubank,
} from "@/lib/parsers";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File;
  const tipo = formData.get("tipo") as string;

  if (!file || !tipo) {
    return NextResponse.json({ error: "Arquivo e tipo são obrigatórios" }, { status: 400 });
  }

  const text = await file.text();
  const fileName = file.name;

  // Parse CSV
  const rows = text
    .split("\n")
    .map((line) => {
      const delim = tipo === "c6-credito" ? ";" : ",";
      return line.split(delim).map((v) => v.trim().replace(/^"|"$/g, ""));
    })
    .filter((r) => r.length > 1);

  // Pula cabeçalho(s)
  const linhasHeader: Record<string, number> = {
    "c6-credito": 1,
    "c6-debito": 9,
    "nubank-credito": 1,
    "nubank-debito": 1,
  };
  const skip = linhasHeader[tipo] || 1;
  const dataRows = rows.slice(skip);

  // Carrega memória da IA
  const memoria = await prisma.memoriaIA.findMany();
  const memoriaMap = new Map<string, string>(
    memoria.map((m): [string, string] => [m.descricao.toLowerCase(), m.categoriaCorreta])
  );

  let lancamentos;
  if (tipo === "c6-credito") lancamentos = parseFaturaC6(dataRows, fileName, memoriaMap);
  else if (tipo === "c6-debito") lancamentos = parseExtratoC6(dataRows, memoriaMap);
  else if (tipo === "nubank-credito") lancamentos = parseFaturaNubank(dataRows, fileName, memoriaMap);
  else if (tipo === "nubank-debito") lancamentos = parseExtratoNubank(dataRows, memoriaMap);
  else return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });

  // Busca transações existentes para evitar duplicatas
  const existing = await prisma.lancamento.findMany({
    select: { data: true, descricao: true, valor: true },
  });
  const existingKeys = new Set(
    existing.map(
      (l) =>
        `${l.data.toISOString().slice(0, 10)}|${l.descricao}|${l.valor.toFixed(2)}`
    )
  );

  const novos = lancamentos.filter((l) => {
    const key = `${l.data.toISOString().slice(0, 10)}|${l.descricao}|${l.valor.toFixed(2)}`;
    return !existingKeys.has(key);
  });

  if (novos.length > 0) {
    await prisma.lancamento.createMany({
      data: novos.map((l) => ({
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
