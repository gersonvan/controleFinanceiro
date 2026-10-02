// "Mesmo pagamento": junta descrições diferentes do mesmo compromisso sob um nome.
//   GET    → grupos com as variações (exemplo e quantos lançamentos)
//   POST   { nome, descricoes[] } → junta (nome existente: acrescenta)
//   PATCH  { nome, novoNome }     → renomeia o grupo
//   DELETE ?chave=… (tira uma variação) | ?nome=… (desfaz o grupo)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { dadosDoUsuario, escopoDoUsuario } from "@/lib/tenant";
import { erro400, lerCorpo, lerQuery, validar } from "@/lib/validacao";
import { chaveMemoria } from "@/lib/categorias";

const nomeSchema = z.string().trim().min(2, "Dê um nome com pelo menos 2 letras").max(80);
const criarSchema = z.object({ nome: nomeSchema, descricoes: z.array(z.string().min(1).max(500)).min(1).max(200) });
const renomearSchema = z.object({ nome: nomeSchema, novoNome: nomeSchema });
const removerSchema = z.object({ chave: z.string().min(1).max(600).optional(), nome: nomeSchema.optional() })
  .refine((v) => v.chave || v.nome, { message: "Informe chave ou nome" });

export interface VariacaoApelido { chave: string; exemplo: string | null; lancamentos: number }
export interface GrupoApelido { nome: string; variacoes: VariacaoApelido[] }

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const [apelidos, descricoes] = await Promise.all([
    prisma.apelido.findMany({ where: escopoDoUsuario(userId), orderBy: [{ nome: "asc" }, { chave: "asc" }] }),
    prisma.lancamento.groupBy({ by: ["descricao"], where: escopoDoUsuario(userId), _count: { _all: true } }),
  ]);
  const porChave = new Map<string, { exemplo: string; n: number }>();
  for (const d of descricoes) {
    const k = chaveMemoria(d.descricao);
    const atual = porChave.get(k);
    porChave.set(k, { exemplo: atual?.exemplo ?? d.descricao, n: (atual?.n ?? 0) + d._count._all });
  }
  const grupos = new Map<string, GrupoApelido>();
  for (const a of apelidos) {
    const g = grupos.get(a.nome) ?? { nome: a.nome, variacoes: [] };
    const uso = porChave.get(a.chave);
    g.variacoes.push({ chave: a.chave, exemplo: uso?.exemplo ?? null, lancamentos: uso?.n ?? 0 });
    grupos.set(a.nome, g);
  }
  return NextResponse.json([...grupos.values()]);
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const v = validar(criarSchema, await lerCorpo(req));
  if (!v.ok) return v.resposta;
  const { nome, descricoes } = v.dados;

  const chaves = [...new Set(descricoes.map(chaveMemoria))].filter((c) => c.length >= 3);
  if (chaves.length === 0) return erro400("Descrições curtas demais para reconhecer");
  // a mesma descrição só pertence a um grupo: juntar de novo move para o nome novo
  await prisma.$transaction(chaves.map((chave) => prisma.apelido.upsert({
    where: { userId_chave: { userId, chave } },
    create: dadosDoUsuario(userId, { chave, nome }),
    update: { nome },
  })));
  return NextResponse.json({ nome, chaves: chaves.length }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const v = validar(renomearSchema, await lerCorpo(req));
  if (!v.ok) return v.resposta;
  const r = await prisma.apelido.updateMany({ where: escopoDoUsuario(userId, { nome: v.dados.nome }), data: { nome: v.dados.novoNome } });
  if (r.count === 0) return NextResponse.json({ error: "Grupo não encontrado" }, { status: 404 });
  return NextResponse.json({ renomeados: r.count });
}

export async function DELETE(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const v = validar(removerSchema, lerQuery(req));
  if (!v.ok) return v.resposta;
  const { chave, nome } = v.dados;
  const r = await prisma.apelido.deleteMany({ where: escopoDoUsuario(userId, chave ? { chave } : { nome }) });
  return NextResponse.json({ removidos: r.count });
}
