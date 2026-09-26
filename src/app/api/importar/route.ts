import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { importar, PerfilCompleto } from "@/lib/importacao/engine";
import { carregarMemoriaCategorizacao } from "@/lib/memoria";
import { aplicarPadroes } from "@/lib/reembolso-dados";
import { dadosDoUsuario, escopoDoUsuario } from "@/lib/tenant";
import { z } from "zod";
import { erro400, idSchema, lerArquivo, opcional, validar } from "@/lib/validacao";
import { chaveLancamento, decodificarTexto, ehPDF, extrairTextoPDF } from "@/lib/importacao/arquivo";

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
    mesReferenciaManual = new Date(Date.UTC(ano, mes - 1, 1)); // meia-noite UTC, como o resto do sistema
  }

  let texto: string;
  if (perfil.formato === "pdf") {
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!ehPDF(buffer)) return erro400("O arquivo enviado não é um PDF");
    try {
      texto = await extrairTextoPDF(buffer);
    } catch (e) {
      console.error("Erro ao ler PDF na importação", e);
      return erro400("Não foi possível ler o PDF. Verifique se é um PDF digital (não escaneado).");
    }
  } else {
    texto = decodificarTexto(Buffer.from(await file.arrayBuffer()));
  }
  const fileName = file.name;

  const memoriaMap = await carregarMemoriaCategorizacao(userId);

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
  const existingKeys = new Set(existing.map(chaveLancamento));
  const novos = lancamentos.filter((l) => !existingKeys.has(chaveLancamento(l)));

  let reembolsosVinculados = 0;
  if (novos.length > 0) {
    const criados = await prisma.lancamento.createManyAndReturn({
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
      select: { id: true, valor: true },
    });
    // Pix que seguem um padrão de reembolso aprendido ("Margaret → TIM") já entram divididos
    reembolsosVinculados = await aplicarPadroes(userId, criados.filter((c) => c.valor > 0).map((c) => c.id));
  }

  return NextResponse.json({
    processados: lancamentos.length,
    novos: novos.length,
    duplicados: lancamentos.length - novos.length,
    reembolsosVinculados,
  });
}
