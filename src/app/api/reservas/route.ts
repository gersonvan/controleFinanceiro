import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { dadosDoUsuario, escopoDoUsuario } from "@/lib/tenant";
import { idSchema, lerCorpo, lerQuery, textoCurto, validar } from "@/lib/validacao";
import { CATEGORIA_INVESTIMENTO } from "@/lib/financas";
import { movimentosDaReserva, saldoEstimado, totaisReserva, TIPOS_RESERVA } from "@/lib/reserva";

const campos = z.object({
  nome: textoCurto,
  tipo: z.enum(TIPOS_RESERVA),
  bloqueada: z.boolean(),
  saldoInformado: z.number().finite().min(0).max(1e10),
  dataSaldo: z.coerce.date(),
  conta: textoCurto.nullable(),
  filtroDescricao: textoCurto.nullable(),
  observacao: z.string().trim().max(500).nullable(),
});
const criacaoSchema = campos.extend({
  bloqueada: z.boolean().default(false),
  conta: textoCurto.nullable().default(null),
  filtroDescricao: textoCurto.nullable().default(null),
  observacao: z.string().trim().max(500).nullable().default(null),
});
const edicaoSchema = campos.partial().extend({ id: idSchema });

// Reservas com o saldo estimado hoje e os movimentos desde o saldo informado.
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const reservas = await prisma.reserva.findMany({ where: escopoDoUsuario(userId), orderBy: [{ bloqueada: "asc" }, { nome: "asc" }] });
  const desde = reservas.length ? new Date(Math.min(...reservas.map((r) => r.dataSaldo.getTime()))) : new Date();
  const contasCorrentes = reservas.filter((r) => r.tipo === "conta" && r.conta).map((r) => r.conta!);
  const lancamentos = reservas.some((r) => r.conta)
    ? await prisma.lancamento.findMany({
        // investimentos de qualquer conta + todos os lançamentos das contas correntes da reserva
        where: escopoDoUsuario(userId, { data: { gt: desde }, OR: [{ categoria: CATEGORIA_INVESTIMENTO }, { conta: { in: contasCorrentes } }] }),
        select: { data: true, descricao: true, valor: true, conta: true, categoria: true },
        orderBy: { data: "asc" },
      })
    : [];

  const lista = reservas.map((r) => ({
    ...r,
    ...saldoEstimado(r, lancamentos),
    // os mais recentes primeiro; conta corrente mostra só os últimos
    movimentos: movimentosDaReserva(r, lancamentos).reverse().slice(0, r.tipo === "conta" ? 8 : 50)
      .map((m) => ({ data: m.data, descricao: m.descricao, valor: m.valor })),
  }));
  return NextResponse.json({ reservas: lista, totais: totaisReserva(lista) });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const v = validar(criacaoSchema, await lerCorpo(req));
  if (!v.ok) return v.resposta;
  const criada = await prisma.reserva.create({ data: dadosDoUsuario(userId, v.dados) });
  return NextResponse.json(criada, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const v = validar(edicaoSchema, await lerCorpo(req));
  if (!v.ok) return v.resposta;
  const { id, ...data } = v.dados;
  const r = await prisma.reserva.updateMany({ where: escopoDoUsuario(userId, { id }), data });
  if (r.count === 0) return NextResponse.json({ error: "Reserva não encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const v = validar(idSchema, lerQuery(req).id);
  if (!v.ok) return v.resposta;
  const r = await prisma.reserva.deleteMany({ where: escopoDoUsuario(userId, { id: v.dados }) });
  if (r.count === 0) return NextResponse.json({ error: "Reserva não encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
