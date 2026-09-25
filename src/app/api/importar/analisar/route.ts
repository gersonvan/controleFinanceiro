import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { escopoDoUsuario } from "@/lib/tenant";
import { lerArquivo } from "@/lib/validacao";
import { chaveDataValor, chaveLancamento, ehParcela, ehPDF, extrairTextoPDF } from "@/lib/importacao/arquivo";
import { detectarBancoOFX, detectarFormato, detectarPerfilCSV, ehOFXCartao } from "@/lib/importacao/detectar";
import { importar, type PerfilCompleto } from "@/lib/importacao/engine";
import { sugerirMesReferencia } from "@/lib/importacao/mes-referencia";
import { detectarBancoPDF } from "@/lib/importacao/pdf";
import { ensureBuiltinPerfis } from "@/lib/importacao/perfis-nativos";

export interface AnaliseArquivo {
  formato: "ofx" | "pdf" | "csv";
  reconhecido: boolean;
  banco: string;
  motivo?: string; // por que precisa de configuração manual
  perfil?: { id: number; nome: string; conta: string; usaMesReferencia: boolean };
  total?: number;
  novos?: number;
  duplicados?: number;
  // Novos que batem em data e valor com lançamentos já gravados com outra
  // descrição: provável mesmo extrato em outro formato (ex.: OFX depois do CSV).
  suspeitos?: number;
  periodo?: { inicio: string; fim: string };
  mesReferenciaSugerido?: string | null;
}

const diaISO = (d: Date) => d.toISOString().slice(0, 10);

// Analisa um arquivo sem gravar nada: identifica formato, banco e perfil do
// usuário, conta os lançamentos e quantos já existem. Base da importação de
// vários arquivos de uma vez; a gravação continua em POST /api/importar.
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const arquivo = lerArquivo(await req.formData());
  if (!arquivo.ok) return arquivo.resposta;
  const file = arquivo.dados;

  const buffer = Buffer.from(await file.arrayBuffer());
  const pdf = ehPDF(buffer);

  let texto: string;
  if (pdf) {
    try {
      texto = await extrairTextoPDF(buffer);
    } catch (e) {
      console.error("Erro ao ler PDF na análise", e);
      return NextResponse.json({
        formato: "pdf", reconhecido: false, banco: "PDF",
        motivo: "Não foi possível ler o PDF. Ele precisa ser o PDF digital do banco, não escaneado.",
      } satisfies AnaliseArquivo);
    }
  } else {
    texto = buffer.toString("utf8");
  }

  const formato = pdf ? "pdf" : detectarFormato(texto, file.name);

  let builtinKey: string | null;
  let banco: string;
  if (formato === "ofx") {
    const r = detectarBancoOFX(texto);
    builtinKey = r.builtinKey;
    banco = r.orgName;
  } else if (formato === "pdf") {
    const r = detectarBancoPDF(texto);
    builtinKey = r.builtinKey;
    banco = r.bancoNome;
  } else {
    const r = detectarPerfilCSV(texto);
    builtinKey = r.builtinKey;
    banco = r.nome;
  }

  if (builtinKey) await ensureBuiltinPerfis(userId); // perfis nativos novos (ex.: fatura em OFX)
  const perfil = builtinKey
    ? await prisma.perfilImportacao.findFirst({ where: escopoDoUsuario(userId, { builtin: builtinKey }) })
    : null;

  if (!perfil) {
    return NextResponse.json({
      formato, reconhecido: false, banco,
      motivo: formato === "csv"
        ? "Planilha sem layout conhecido: indique quais colunas são data, descrição e valor."
        : formato === "ofx" && ehOFXCartao(texto)
        ? "Fatura de cartão em OFX deste banco ainda não tem perfil — use o PDF ou o CSV da fatura."
        : "Banco não identificado automaticamente.",
    } satisfies AnaliseArquivo);
  }

  let lancamentos: ReturnType<typeof importar>;
  try {
    lancamentos = importar(texto, file.name, perfil as PerfilCompleto, new Map(), null);
  } catch (e) {
    console.error("Erro ao processar arquivo na análise", e);
    lancamentos = [];
  }

  if (lancamentos.length === 0) {
    return NextResponse.json({
      formato, reconhecido: false, banco,
      motivo: "O banco foi identificado, mas nenhum lançamento foi encontrado no arquivo.",
    } satisfies AnaliseArquivo);
  }

  // Quantos já estão gravados (mesma chave usada na importação). Consulta só o
  // intervalo de datas do arquivo, com 1 dia de folga para diferenças de fuso.
  const datas = lancamentos.map((l) => l.data);
  const inicio = new Date(Math.min(...datas.map((d) => d.getTime())));
  const fim = new Date(Math.max(...datas.map((d) => d.getTime())));
  const umDia = 24 * 60 * 60 * 1000;
  const existentes = await prisma.lancamento.findMany({
    where: escopoDoUsuario(userId, {
      data: { gte: new Date(inicio.getTime() - umDia), lte: new Date(fim.getTime() + umDia) },
    }),
    select: { data: true, descricao: true, valor: true },
  });
  const chaves = new Set(existentes.map(chaveLancamento));
  const duplicados = lancamentos.filter((l) => chaves.has(chaveLancamento(l))).length;
  const dataValor = new Set(existentes.map(chaveDataValor));
  const suspeitos = lancamentos.filter(
    (l) => !chaves.has(chaveLancamento(l)) && !ehParcela(l.descricao) && dataValor.has(chaveDataValor(l))
  ).length;

  return NextResponse.json({
    formato,
    reconhecido: true,
    banco,
    perfil: { id: perfil.id, nome: perfil.nome, conta: perfil.conta, usaMesReferencia: perfil.usaMesReferencia },
    total: lancamentos.length,
    novos: lancamentos.length - duplicados,
    duplicados,
    suspeitos,
    periodo: { inicio: diaISO(inicio), fim: diaISO(fim) },
    mesReferenciaSugerido: perfil.usaMesReferencia
      ? sugerirMesReferencia(datas, formato === "pdf" ? texto : undefined, file.name)
      : null,
  } satisfies AnaliseArquivo);
}
