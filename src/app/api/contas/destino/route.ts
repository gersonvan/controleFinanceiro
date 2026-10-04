// Para qual conta vai uma importação com este perfil: a padrão, ou as opções
// quando o usuário tem mais de uma conta do mesmo banco e tipo (apelidos).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { escopoDoUsuario } from "@/lib/tenant";
import { bancoTipoDoPerfil, destinoDaImportacao } from "@/lib/contas";
import { lerQuery, validar } from "@/lib/validacao";

const consultaSchema = z.object({ perfilId: z.coerce.number().int().positive() });

export interface DestinoConta { banco: string; tipo: string; padrao: string | null; opcoes: string[] }

export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const v = validar(consultaSchema, lerQuery(req));
  if (!v.ok) return v.resposta;
  const perfil = await prisma.perfilImportacao.findFirst({
    where: escopoDoUsuario(userId, { id: v.dados.perfilId }), select: { banco: true, tipoConta: true, conta: true },
  });
  if (!perfil) return NextResponse.json({ error: "Perfil não encontrado" }, { status: 404 });
  const { banco, tipo } = bancoTipoDoPerfil(perfil);
  return NextResponse.json({ banco, tipo, ...(await destinoDaImportacao(userId, banco, tipo)) } satisfies DestinoConta);
}
