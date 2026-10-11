// De quem são as finanças abertas: as próprias ou as compartilhadas com o usuário.
// Usa quem está logado (não as finanças abertas): até quem só vê precisa poder voltar.
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getUsuarioLogado } from "@/lib/session";
import { COOKIE_ESPACO, contextoDaSessao, espacosDoUsuario } from "@/lib/espaco";
import { lerCorpo, validar } from "@/lib/validacao";

export async function GET() {
  const contexto = await contextoDaSessao();
  if (!contexto) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const opcoes = await espacosDoUsuario(contexto.usuario);
  return NextResponse.json({ atual: opcoes.find((o) => o.dono === contexto.dono) ?? opcoes[0], opcoes });
}

const escolhaSchema = z.object({ dono: z.string().trim().min(1).max(200) });

export async function PUT(req: NextRequest) {
  const usuario = await getUsuarioLogado();
  if (!usuario) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const v = validar(escolhaSchema, await lerCorpo(req));
  if (!v.ok) return v.resposta;
  const loja = await cookies();
  if (v.dados.dono === usuario) {
    loja.delete(COOKIE_ESPACO);
    return NextResponse.json({ ok: true });
  }
  const opcoes = await espacosDoUsuario(usuario);
  if (!opcoes.some((o) => o.dono === v.dados.dono)) return NextResponse.json({ error: "Sem acesso a essas finanças" }, { status: 403 });
  loja.set(COOKIE_ESPACO, v.dados.dono, {
    httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365,
  });
  return NextResponse.json({ ok: true });
}
