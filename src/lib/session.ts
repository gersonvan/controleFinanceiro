import { auth } from "@/auth";
import { contextoDaSessao, metodoDaRequisicao, podeNaRequisicao } from "./espaco";

/**
 * De quem são os dados desta requisição: do próprio usuário ou, se ele abriu
 * finanças compartilhadas com ele, do dono (lib/espaco.ts). Todas as rotas
 * escopam os dados por este valor. Com acesso só de "ver", pedidos que alteram
 * recebem null — a rota responde 401 e nada muda.
 */
export async function getSessionUserId(): Promise<string | null> {
  const c = await contextoDaSessao();
  if (!c) return null;
  if (!podeNaRequisicao(c.papel, await metodoDaRequisicao())) return null;
  return c.dono;
}

/** Quem está logado — para o que é da pessoa e não das finanças abertas (compartilhar, onboarding). */
export async function getUsuarioLogado(): Promise<string | null> {
  const session = await auth();
  return session?.user?.email ?? null;
}
