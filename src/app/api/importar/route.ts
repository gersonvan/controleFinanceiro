import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { importar, PerfilCompleto } from "@/lib/importacao/engine";
import { carregarMemoriaCategorizacao } from "@/lib/memoria";
import { aplicarPadroes } from "@/lib/reembolso-dados";
import { extrairSaldoFinal } from "@/lib/importacao/saldo";
import { atualizarSaldoConta } from "@/lib/reserva-dados";
import { dadosDoUsuario, escopoDoUsuario } from "@/lib/tenant";
import { z } from "zod";
import { corpoGrandeDemais, erro400, idSchema, lerArquivo, opcional, validar } from "@/lib/validacao";
import { chaveLancamento, decodificarTexto, ehPDF, extrairTextoPDF } from "@/lib/importacao/arquivo";
import { bancoTipoDoPerfil, resolverConta } from "@/lib/contas";
import type { SaldoDaImportacao } from "@/lib/importacoes";
import { documentoDeOutraPessoa, nomeParaConferir } from "@/lib/importacao/titular";

const importacaoSchema = z.object({
  perfilId: idSchema,
  // <input type="month"> envia "AAAA-MM"
  mesReferencia: opcional(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use o formato AAAA-MM")),
  // conta escolhida quando há mais de uma do mesmo banco e tipo (apelidos)
  conta: opcional(z.string().trim().min(1).max(120)),
  // o usuário confirmou que o documento é dele (o titular não bateu com o nome)
  confirmarTitular: opcional(z.enum(["1"])),
});

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const grande = corpoGrandeDemais(req);
  if (grande) return grande;
  const formData = await req.formData();
  const arquivo = lerArquivo(formData);
  if (!arquivo.ok) return arquivo.resposta;
  const file = arquivo.dados;

  const v = validar(importacaoSchema, {
    perfilId: formData.get("perfilId"),
    mesReferencia: formData.get("mesReferencia"),
    conta: formData.get("conta"),
    confirmarTitular: formData.get("confirmarTitular"),
  });
  if (!v.ok) return v.resposta;
  const { perfilId, mesReferencia: mesRefStr, conta: contaEscolhida } = v.dados;

  const perfil = await prisma.perfilImportacao.findFirst({
    where: escopoDoUsuario(userId, { id: perfilId }),
  });
  if (!perfil) return NextResponse.json({ error: "Perfil não encontrado" }, { status: 404 });

  // A conta vem do banco + tipo do perfil (lib/bancos.ts), não de um nome no perfil
  const { banco, tipo } = bancoTipoDoPerfil(perfil);
  const destino = await resolverConta(userId, banco, tipo, contaEscolhida);
  if (!destino.ok) {
    return NextResponse.json({ error: "Escolha em qual conta importar", opcoes: destino.opcoes }, { status: 409 });
  }
  const perfilComConta = { ...perfil, conta: destino.nome };

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

  // documento de outra pessoa (titular ≠ nome do usuário): só com confirmação
  if (!v.dados.confirmarTitular) {
    const dono = await prisma.userProfile.findUnique({ where: { userId }, select: { nomeCompleto: true, nome: true } });
    const outraPessoa = documentoDeOutraPessoa(texto, perfil.formato, nomeParaConferir(dono));
    if (outraPessoa) {
      return NextResponse.json({
        error: outraPessoa.nome ? `Este documento parece ser de ${outraPessoa.nome}.` : "Não achamos o seu nome neste documento.",
        outraPessoa,
      }, { status: 409 });
    }
  }

  const memoriaMap = await carregarMemoriaCategorizacao(userId);

  let lancamentos;
  try {
    lancamentos = importar(texto, fileName, perfilComConta as PerfilCompleto, memoriaMap, mesReferenciaManual);
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
  let importacaoId: number | null = null;
  if (novos.length > 0) {
    // a importação fica registrada com os lançamentos que criou: dá para desfazer
    const { importacao, criados } = await prisma.$transaction(async (tx) => {
      const importacao = await tx.importacao.create({
        data: dadosDoUsuario(userId, { perfil: perfil.nome, conta: destino.nome, arquivo: file.name.slice(0, 200) }),
      });
      const criados = await tx.lancamento.createManyAndReturn({
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
          importacaoId: importacao.id,
        })),
        select: { id: true, valor: true },
      });
      return { importacao, criados };
    });
    importacaoId = importacao.id;
    // Pix que seguem um padrão de reembolso aprendido ("Maria → TIM") já entram divididos
    reembolsosVinculados = await aplicarPadroes(userId, criados.filter((c) => c.valor > 0).map((c) => c.id));
  }

  // Extrato de conta com saldo (C6, Bradesco, BB): atualiza a conta na Reserva
  let saldoConta: { conta: string; saldo: number; data: Date; atualizado: boolean } | null = null;
  const saldoFinal = perfil.formato !== "pdf" ? extrairSaldoFinal(texto) : null;
  const contaDoExtrato = destino.nome;
  if (saldoFinal && contaDoExtrato) {
    const { desfazer, ...publico } = await atualizarSaldoConta(userId, contaDoExtrato, saldoFinal.saldo, saldoFinal.data);
    saldoConta = publico;
    if (importacaoId !== null && desfazer) {
      const saldo: SaldoDaImportacao = { ...desfazer, gravado: { saldo: publico.saldo, data: publico.data.toISOString() } };
      await prisma.importacao.updateMany({ where: escopoDoUsuario(userId, { id: importacaoId }), data: { saldo: saldo as unknown as Prisma.InputJsonValue } });
    }
  }

  return NextResponse.json({
    conta: destino.nome,
    processados: lancamentos.length,
    novos: novos.length,
    duplicados: lancamentos.length - novos.length,
    reembolsosVinculados,
    saldoConta,
    importacaoId,
  });
}
