// Finanças compartilhadas. Cada pessoa tem as próprias finanças (o "tenant" é o
// e-mail dela) e pode dar acesso a outras, para "ver" ou "ajudar" (model Acesso).
// Quem foi convidado escolhe de quem são as finanças abertas (cookie "espaco");
// a escolha é conferida no banco a cada requisição — convite retirado ou cookie
// forjado voltam às próprias finanças. Com acesso só de "ver", pedidos que
// alteram dados são recusados (o método vem do proxy, que sempre o grava).
import { cookies, headers } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "./db";

export const COOKIE_ESPACO = "espaco";
export const CABECALHO_METODO = "x-metodo";
export type Papel = "dono" | "ver" | "ajudar";
export const PAPEIS_DE_ACESSO = ["ver", "ajudar"] as const;

export interface Contexto {
  usuario: string; // quem está logado
  dono: string;    // de quem são as finanças abertas
  papel: Papel;
}

const LEITURA = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * O que a requisição pode fazer nas finanças abertas. Sem o método (o proxy não
 * rodou), trata como alteração: na dúvida, quem só vê não altera.
 */
export function podeNaRequisicao(papel: Papel, metodo: string | null): boolean {
  if (papel !== "ver") return true;
  return !!metodo && LEITURA.has(metodo.toUpperCase());
}

/** Papel guardado no banco → papel na sessão (qualquer coisa estranha vira só "ver"). */
export const papelDoAcesso = (p: string): Papel => (p === "ajudar" ? "ajudar" : "ver");

export async function contextoDaSessao(): Promise<Contexto | null> {
  const session = await auth();
  const usuario = session?.user?.email;
  if (!usuario) return null;
  const escolhido = (await cookies()).get(COOKIE_ESPACO)?.value;
  if (!escolhido || escolhido === usuario) return { usuario, dono: usuario, papel: "dono" };
  const acesso = await prisma.acesso.findUnique({
    where: { donoUserId_membroEmail: { donoUserId: escolhido, membroEmail: usuario.toLowerCase() } },
    select: { papel: true },
  });
  if (!acesso) return { usuario, dono: usuario, papel: "dono" };
  return { usuario, dono: escolhido, papel: papelDoAcesso(acesso.papel) };
}

export async function metodoDaRequisicao(): Promise<string | null> {
  return (await headers()).get(CABECALHO_METODO);
}

export interface OpcaoEspaco { dono: string; nome: string; papel: Papel }

/** As finanças que o usuário pode abrir: as dele e as compartilhadas com ele. */
export async function espacosDoUsuario(usuario: string): Promise<OpcaoEspaco[]> {
  const acessos = await prisma.acesso.findMany({
    where: { membroEmail: usuario.toLowerCase() },
    select: { donoUserId: true, papel: true },
    orderBy: { createdAt: "asc" },
  });
  const perfis = await prisma.userProfile.findMany({
    where: { userId: { in: acessos.map((a) => a.donoUserId) } },
    select: { userId: true, nome: true },
  });
  const nomes = new Map(perfis.map((p) => [p.userId, p.nome]));
  return [
    { dono: usuario, nome: "Minhas finanças", papel: "dono" as Papel },
    ...acessos.map((a) => ({ dono: a.donoUserId, nome: nomes.get(a.donoUserId) || a.donoUserId, papel: papelDoAcesso(a.papel) })),
  ];
}
