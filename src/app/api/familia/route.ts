// Plano da família (lib/familia.ts), nas finanças abertas:
//   GET → { dados, versao } (sem plano ainda: o vazio, versão 0)
//   PUT { dados, versao } → grava o plano inteiro se ninguém gravou outra versão
//       enquanto isso (senão 409: recarregar e refazer)
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { dadosDoUsuario, escopoDoUsuario } from "@/lib/tenant";
import { lerCorpo, validar } from "@/lib/validacao";
import { categoriasForaDoCatalogo } from "@/lib/categorias-usuario";
import { dadosFamiliaSchema, dadosVazios, type DadosFamilia } from "@/lib/familia";

const gravarSchema = z.object({ dados: dadosFamiliaSchema, versao: z.number().int().min(0) });
const CONFLITO = "O plano foi alterado por outra pessoa enquanto você editava. Recarregue a página para ver a versão atual.";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const plano = await prisma.planoFamilia.findUnique({ where: escopoDoUsuario(userId), select: { dados: true, versao: true } });
  return NextResponse.json({ dados: (plano?.dados as unknown as DadosFamilia) ?? dadosVazios(), versao: plano?.versao ?? 0 });
}

export async function PUT(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const v = validar(gravarSchema, await lerCorpo(req));
  if (!v.ok) return v.resposta;
  const { dados, versao } = v.dados;

  // categorias das contas: só as do usuário (nativas visíveis e as próprias)
  const fora = await categoriasForaDoCatalogo(userId, dados.cenarios.flatMap((c) => c.itens.map((i) => i.categoria)));
  if (fora) return fora;

  const json = dados as unknown as Prisma.InputJsonValue;
  if (versao === 0) {
    try {
      await prisma.planoFamilia.create({ data: dadosDoUsuario(userId, { dados: json, versao: 1 }) });
    } catch {
      return NextResponse.json({ error: CONFLITO }, { status: 409 }); // outro criou ao mesmo tempo
    }
    return NextResponse.json({ versao: 1 });
  }
  const r = await prisma.planoFamilia.updateMany({ where: escopoDoUsuario(userId, { versao }), data: { dados: json, versao: versao + 1 } });
  if (r.count === 0) return NextResponse.json({ error: CONFLITO }, { status: 409 });
  return NextResponse.json({ versao: versao + 1 });
}
