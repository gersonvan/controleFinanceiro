// A Fotografia do mês de quem está logado — sempre a própria, mesmo com as
// finanças de outra pessoa abertas: é o que cada membro traz para o plano da família.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUsuarioLogado } from "@/lib/session";
import { escopoDoUsuario } from "@/lib/tenant";

export async function GET() {
  const usuario = await getUsuarioLogado();
  if (!usuario) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const itens = await prisma.planejamentoItem.findMany({
    where: escopoDoUsuario(usuario),
    orderBy: [{ ordem: "asc" }, { id: "asc" }],
    select: { grupo: true, descricao: true, categoria: true, valor: true, periodicidade: true, parcelaAtual: true, parcelaTotal: true },
  });
  return NextResponse.json({ itens });
}
