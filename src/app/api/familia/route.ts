// Planos da família (lib/familia.ts). O plano não é das finanças abertas: quem
// participa está em MembroPlano e tudo parte de quem está logado.
//   GET ?plano=          → { eu, planos, convites, plano } (plano: o pedido ou o primeiro)
//   POST { nome }        → cria um plano, com quem criou como membro e pessoa adulta
//   PUT { plano, dados, versao, vistos? } → grava se ninguém gravou outra versão
//       nesse meio-tempo; senão 409 com o plano atual (o app junta as alterações)
//   PATCH { plano, acao } → renomear, convidar, remover (quem criou); aceitar,
//       recusar, sair, pessoa ("quem sou eu na casa"), privacidade, vistos (o membro)
// Privacidade: a renda e as contas pessoais de cada membro só vão para os outros
// se ele mostrar (semOcultos ao enviar, reporOcultos ao gravar).
//   DELETE ?plano=       → exclui o plano (só quem criou)
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUsuarioLogado } from "@/lib/session";
import { emailPermitido } from "@/lib/acesso";
import { idSchema, lerCorpo, lerQuery, validar } from "@/lib/validacao";
import { montarCatalogo } from "@/lib/catalogo-categorias";
import {
  dadosFamiliaSchema, dadosVazios, novaChave, pagaContas, problemasDePrivacidade, reporOcultos, semOcultos, transferirPrivados,
  type DadosFamilia,
} from "@/lib/familia";
import {
  alterarDados, emailDe, linhasCategoriasDoPlano, MAX_MEMBROS, MAX_PLANOS_CRIADOS, membroDoPlano, nomesDe, ocultacaoDe, ocultasPara,
} from "@/lib/familia-servidor";

const nomePlano = z.string().trim().min(1, "Dê um nome ao plano").max(60);
const vistosSchema = z.array(z.string().max(200)).max(500);
const gravarSchema = z.object({ plano: idSchema, dados: dadosFamiliaSchema, versao: z.number().int().min(0), vistos: vistosSchema.optional() });
const acaoSchema = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("renomear"), plano: idSchema, nome: nomePlano }),
  z.object({ acao: z.literal("convidar"), plano: idSchema, email: z.string().trim().toLowerCase().email("E-mail inválido").max(200) }),
  z.object({ acao: z.literal("remover"), plano: idSchema, membro: idSchema }),
  z.object({ acao: z.literal("aceitar"), plano: idSchema }),
  z.object({ acao: z.literal("recusar"), plano: idSchema }),
  z.object({ acao: z.literal("sair"), plano: idSchema }),
  z.object({ acao: z.literal("pessoa"), plano: idSchema, pessoa: z.string().max(40).nullable() }),
  z.object({ acao: z.literal("vistos"), plano: idSchema, vistos: vistosSchema }),
  z.object({ acao: z.literal("privacidade"), plano: idSchema, mostrarRenda: z.boolean(), mostrarPessoais: z.boolean() }),
]);

const erro = (status: number, error: string) => NextResponse.json({ error }, { status });
const NAO_ENCONTRADO = "Plano não encontrado (ou você não participa dele)";
const SO_QUEM_CRIOU = "Só quem criou o plano pode fazer isso";

export async function GET(req: NextRequest) {
  const usuario = await getUsuarioLogado();
  if (!usuario) return erro(401, "Não autorizado");
  const eu = emailDe(usuario);
  const minhas = await prisma.membroPlano.findMany({
    where: { email: eu }, orderBy: { createdAt: "asc" },
    include: { plano: { select: { id: true, nome: true, criadoPor: true } } },
  });
  const nomes = await nomesDe([eu, ...minhas.flatMap((m) => [m.plano.criadoPor, m.convidadoPor ?? m.plano.criadoPor])]);
  const planos = minhas.filter((m) => m.aceito).map((m) => ({ id: m.plano.id, nome: m.plano.nome, souCriador: m.plano.criadoPor === eu }));
  const convites = minhas.filter((m) => !m.aceito).map((m) => ({ plano: m.plano.id, nome: m.plano.nome, de: nomes.get(emailDe(m.convidadoPor ?? m.plano.criadoPor)) }));
  const base = { eu: { email: eu, nome: nomes.get(eu)! }, planos, convites };

  const pedido = Number(lerQuery(req).plano) || null;
  const escolhido = planos.find((p) => p.id === pedido) ?? planos[0];
  if (!escolhido) return NextResponse.json({ ...base, plano: null });

  const plano = await prisma.planoFamilia.findUnique({ where: { id: escolhido.id }, include: { membros: { orderBy: { createdAt: "asc" } } } });
  if (!plano) return NextResponse.json({ ...base, plano: null });
  const nomesMembros = await nomesDe([...plano.membros.map((m) => m.email), plano.atualizadoPor ?? eu]);
  const souCriador = plano.criadoPor === eu;
  const meu = plano.membros.find((m) => m.email === eu)!;
  const ocultas = ocultasPara(plano.membros, eu);
  return NextResponse.json({
    ...base,
    plano: {
      id: plano.id, nome: plano.nome, versao: plano.versao, souCriador,
      dados: semOcultos((plano.dados as unknown as DadosFamilia) ?? dadosVazios(), ocultas),
      ocultas, // para o resumo dizer "renda privada" em vez de mostrar zero
      atualizadoPor: plano.atualizadoPor ? nomesMembros.get(plano.atualizadoPor) : null,
      atualizadoEm: plano.updatedAt,
      vistos: (meu.vistos as string[] | null) ?? null,
      categorias: await linhasCategoriasDoPlano(plano.id),
      membros: plano.membros.map((m) => ({
        id: m.id, email: m.email, nome: nomesMembros.get(m.email), pessoa: m.pessoa, aceito: m.aceito,
        mostrarRenda: m.mostrarRenda, mostrarPessoais: m.mostrarPessoais,
        eu: m.email === eu, criador: m.email === plano.criadoPor,
        // o app ainda limita quem entra (ALLOWED_EMAILS): quem criou é avisado se o convidado não consegue entrar
        ...(souCriador && { podeEntrar: emailPermitido(m.email) }),
      })),
    },
  });
}

export async function POST(req: NextRequest) {
  const usuario = await getUsuarioLogado();
  if (!usuario) return erro(401, "Não autorizado");
  const v = validar(z.object({ nome: nomePlano }), await lerCorpo(req));
  if (!v.ok) return v.resposta;
  const eu = emailDe(usuario);
  if ((await prisma.planoFamilia.count({ where: { criadoPor: eu } })) >= MAX_PLANOS_CRIADOS) {
    return erro(400, `Você já criou ${MAX_PLANOS_CRIADOS} planos: exclua um antes de criar outro`);
  }
  // quem cria já entra como pessoa adulta do plano, ligada a ele (pronto para trazer a Fotografia)
  const nome = (await nomesDe([eu])).get(eu)!.slice(0, 40);
  const pessoa = novaChave();
  const dados: DadosFamilia = { ...dadosVazios(), pessoas: [{ chave: pessoa, nome, tipo: "adulto" }] };
  const plano = await prisma.planoFamilia.create({
    data: {
      nome: v.dados.nome, criadoPor: eu, dados: dados as unknown as Prisma.InputJsonValue, versao: 1, atualizadoPor: eu,
      membros: { create: { email: eu, aceito: true, pessoa } },
    },
  });
  return NextResponse.json({ id: plano.id }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const usuario = await getUsuarioLogado();
  if (!usuario) return erro(401, "Não autorizado");
  const v = validar(gravarSchema, await lerCorpo(req));
  if (!v.ok) return v.resposta;
  const { plano: planoId, versao, vistos } = v.dados;
  const dados: DadosFamilia = v.dados.dados;
  const eu = emailDe(usuario);
  const membro = await membroDoPlano(planoId, eu);
  if (!membro) return erro(404, NAO_ENCONTRADO);
  const atual = membro.plano;
  const atuais = atual.dados as unknown as DadosFamilia;
  const ocultas = ocultasPara(await prisma.membroPlano.findMany({ where: { planoId } }), eu);

  if (atual.versao !== versao) {
    const nomes = await nomesDe([atual.atualizadoPor ?? atual.criadoPor]);
    return NextResponse.json({
      error: "O plano foi alterado por outra pessoa enquanto você editava.",
      dados: semOcultos(atuais, ocultas), versao: atual.versao, atualizadoPor: nomes.get(emailDe(atual.atualizadoPor ?? atual.criadoPor)),
    }, { status: 409 });
  }

  // a renda e as contas pessoais que outro membro mantém privadas: só ele inclui e altera
  const privados = problemasDePrivacidade(dados, ocultas);
  if (privados.length > 0) return NextResponse.json({ error: "Há itens privados de outra pessoa", detalhes: privados.map((p) => p.texto) }, { status: 400 });

  // categoria que deixou de existir (um membro excluiu a própria) sai do item; o resto do plano grava
  const catalogo = montarCatalogo(await linhasCategoriasDoPlano(planoId));
  // item novo sem autor: quem salvou
  const antes = new Set((atuais?.cenarios ?? []).flatMap((c) => c.itens.map((i) => i.chave)));
  const meuNome = (await nomesDe([eu])).get(eu)!;
  for (const c of dados.cenarios) {
    for (const i of c.itens) {
      if (i.categoria && !catalogo.validas.has(i.categoria)) i.categoria = null;
      if (!i.por && !antes.has(i.chave)) i.por = meuNome;
    }
  }

  // de volta os itens privados dos outros, que este membro não recebeu
  const completo = reporOcultos(dados, atuais ?? dadosVazios(), ocultas);
  if (!dadosFamiliaSchema.safeParse(completo).success) return erro(400, "O plano não pôde ser salvo. Recarregue a página e tente de novo.");

  const r = await prisma.planoFamilia.updateMany({
    where: { id: planoId, versao },
    data: { dados: completo as unknown as Prisma.InputJsonValue, versao: versao + 1, atualizadoPor: eu },
  });
  if (r.count === 0) return erro(409, "O plano foi alterado por outra pessoa enquanto você editava. Tente salvar de novo.");
  if (vistos) await prisma.membroPlano.update({ where: { id: membro.id }, data: { vistos } });
  // a pessoa ligada a um membro não pode sumir do plano
  const pessoas = new Set(completo.pessoas.filter(pagaContas).map((p) => p.chave));
  await prisma.membroPlano.updateMany({ where: { planoId, pessoa: { notIn: [...pessoas] } }, data: { pessoa: null } });
  return NextResponse.json({ versao: versao + 1, dados: semOcultos(completo, ocultas) });
}

export async function PATCH(req: NextRequest) {
  const usuario = await getUsuarioLogado();
  if (!usuario) return erro(401, "Não autorizado");
  const v = validar(acaoSchema, await lerCorpo(req));
  if (!v.ok) return v.resposta;
  const a = v.dados;
  const eu = emailDe(usuario);

  // convite: o membro ainda não aceito
  if (a.acao === "aceitar" || a.acao === "recusar") {
    const convite = await prisma.membroPlano.findFirst({ where: { planoId: a.plano, email: eu, aceito: false } });
    if (!convite) return erro(404, "Convite não encontrado");
    if (a.acao === "aceitar") await prisma.membroPlano.update({ where: { id: convite.id }, data: { aceito: true } });
    else await prisma.membroPlano.delete({ where: { id: convite.id } });
    return NextResponse.json({ ok: true });
  }

  const membro = await membroDoPlano(a.plano, eu);
  if (!membro) return erro(404, NAO_ENCONTRADO);
  const souCriador = membro.plano.criadoPor === eu;

  switch (a.acao) {
    case "renomear":
      if (!souCriador) return erro(403, SO_QUEM_CRIOU);
      await prisma.planoFamilia.update({ where: { id: a.plano }, data: { nome: a.nome } });
      return NextResponse.json({ ok: true });

    case "convidar": {
      if (!souCriador) return erro(403, SO_QUEM_CRIOU);
      if (a.email === eu) return erro(400, "Você já está no plano");
      const membros = await prisma.membroPlano.findMany({ where: { planoId: a.plano }, select: { email: true } });
      if (membros.some((m) => m.email === a.email)) return erro(409, "Essa pessoa já está no plano (ou já foi convidada)");
      if (membros.length >= MAX_MEMBROS) return erro(400, `O plano já tem ${MAX_MEMBROS} pessoas`);
      const criado = await prisma.membroPlano.create({ data: { planoId: a.plano, email: a.email, convidadoPor: eu } });
      return NextResponse.json({ id: criado.id, email: a.email, podeEntrar: emailPermitido(a.email) }, { status: 201 });
    }

    case "remover": {
      if (!souCriador) return erro(403, SO_QUEM_CRIOU);
      if (a.membro === membro.id) return erro(400, "Quem criou não sai do plano: para encerrar, exclua o plano");
      const quem = await prisma.membroPlano.findFirst({ where: { id: a.membro, planoId: a.plano } });
      if (!quem) return erro(404, "Membro não encontrado");
      await sairDoPlano(quem);
      return NextResponse.json({ ok: true });
    }

    case "sair":
      if (souCriador) return erro(400, "Quem criou não sai do plano: para encerrar, exclua o plano");
      await sairDoPlano(membro);
      return NextResponse.json({ ok: true });

    case "pessoa": {
      if (a.pessoa !== null) {
        const dados = membro.plano.dados as unknown as DadosFamilia;
        const p = dados.pessoas.find((x) => x.chave === a.pessoa);
        if (!p || !pagaContas(p)) return erro(400, "Escolha um adulto (ou imóvel, empresa…) do plano");
        const outro = await prisma.membroPlano.findFirst({ where: { planoId: a.plano, pessoa: a.pessoa, id: { not: membro.id } } });
        if (outro) return erro(409, `${p.nome} já é outra pessoa do plano`);
      }
      if (a.pessoa === membro.pessoa) return NextResponse.json({ ok: true });
      // o que era privado vai junto para a nova pessoa (ou sai do plano); o que fica muda de visibilidade: nova versão
      const o = ocultacaoDe(membro);
      if (!(await alterarDados(a.plano, (d) => (o ? transferirPrivados(d, o, a.pessoa) : d)))) return erro(409, "O plano está sendo alterado agora: tente de novo.");
      await prisma.membroPlano.update({ where: { id: membro.id }, data: { pessoa: a.pessoa } });
      return NextResponse.json({ ok: true });
    }

    case "privacidade":
      // muda o que os outros recebem: nova versão, para quem está editando juntar com a visão nova
      await prisma.membroPlano.update({ where: { id: membro.id }, data: { mostrarRenda: a.mostrarRenda, mostrarPessoais: a.mostrarPessoais } });
      await alterarDados(a.plano, (d) => d);
      return NextResponse.json({ ok: true });

    case "vistos":
      await prisma.membroPlano.update({ where: { id: membro.id }, data: { vistos: a.vistos } });
      return NextResponse.json({ ok: true });
  }
}

export async function DELETE(req: NextRequest) {
  const usuario = await getUsuarioLogado();
  if (!usuario) return erro(401, "Não autorizado");
  const v = validar(z.object({ plano: idSchema }), lerQuery(req));
  if (!v.ok) return v.resposta;
  const membro = await membroDoPlano(v.dados.plano, usuario);
  if (!membro) return erro(404, NAO_ENCONTRADO);
  if (membro.plano.criadoPor !== emailDe(usuario)) return erro(403, SO_QUEM_CRIOU);
  await prisma.planoFamilia.delete({ where: { id: v.dados.plano } });
  return NextResponse.json({ ok: true });
}

/** Quem sai (ou é tirado) leva o que era privado dele: ficaria à vista dos outros. */
async function sairDoPlano(m: { id: number; planoId: number; pessoa: string | null; mostrarRenda: boolean; mostrarPessoais: boolean }) {
  const o = ocultacaoDe(m);
  if (o) await alterarDados(m.planoId, (d) => transferirPrivados(d, o, null));
  else await alterarDados(m.planoId, (d) => d);
  await prisma.membroPlano.delete({ where: { id: m.id } });
}
