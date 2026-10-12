import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { dadosDoUsuario, escopoDoUsuario } from "@/lib/tenant";
import { z } from "zod";
import { categoriaSchema, idSchema, lerCorpo, lerQuery, textoLongo, validar } from "@/lib/validacao";
import { categoriasForaDoCatalogo } from "@/lib/categorias-usuario";

const regraSchema = z.object({ descricao: textoLongo, categoriaCorreta: categoriaSchema });

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const memoria = await prisma.memoriaIA.findMany({
    where: escopoDoUsuario(userId),
    orderBy: { descricao: "asc" },
  });
  return NextResponse.json(memoria);
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const v = validar(regraSchema, await lerCorpo(req));
  if (!v.ok) return v.resposta;
  const fora = await categoriasForaDoCatalogo(userId, [v.dados.categoriaCorreta]); // só as categorias do usuário
  if (fora) return fora;
  const { descricao, categoriaCorreta } = v.dados;
  const regra = await prisma.memoriaIA.upsert({
    where: { descricao_userId: { descricao, userId } },
    update: { categoriaCorreta },
    create: dadosDoUsuario(userId, { descricao, categoriaCorreta }),
  });
  return NextResponse.json(regra);
}

export async function DELETE(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const v = validar(idSchema, lerQuery(req).id);
  if (!v.ok) return v.resposta;
  await prisma.memoriaIA.deleteMany({ where: escopoDoUsuario(userId, { id: v.dados }) });
  return NextResponse.json({ ok: true });
}
