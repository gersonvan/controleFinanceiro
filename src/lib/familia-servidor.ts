// Plano da família no servidor: quem participa (MembroPlano), nomes para mostrar,
// as categorias que o plano aceita (as de todos os membros) e o que cada membro
// mantém privado (a renda e as contas pessoais). O plano não é das
// finanças abertas: tudo aqui parte de quem está logado (getUsuarioLogado).
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { linhasDoUsuario } from "./categorias-usuario";
import { categoriasDoPlano, type DadosFamilia, type Ocultacao } from "./familia";

export const MAX_MEMBROS = 10;
export const MAX_PLANOS_CRIADOS = 10;

export const emailDe = (usuario: string) => usuario.trim().toLowerCase();

/** O membro (aceito) do plano, com o plano; null se o usuário não participa. */
export async function membroDoPlano(planoId: number, usuario: string) {
  return prisma.membroPlano.findFirst({
    where: { planoId, email: emailDe(usuario), aceito: true },
    include: { plano: true },
  });
}

/** Nome para mostrar: o do perfil, senão o começo do e-mail. */
export async function nomesDe(emails: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(emails.map(emailDe))];
  const perfis = await prisma.userProfile.findMany({ where: { userId: { in: unicos } }, select: { userId: true, nome: true } });
  const nomes = new Map(perfis.map((p) => [emailDe(p.userId), p.nome.trim()]));
  return new Map(unicos.map((e) => [e, nomes.get(e) || e.split("@")[0]]));
}

/** As categorias personalizadas de todos os membros aceitos (as nativas valem sempre). */
export async function linhasCategoriasDoPlano(planoId: number) {
  const membros = await prisma.membroPlano.findMany({ where: { planoId, aceito: true }, select: { email: true } });
  return categoriasDoPlano(await Promise.all(membros.map((m) => linhasDoUsuario(m.email))));
}

interface MembroComPrivacidade { email: string; aceito: boolean; pessoa: string | null; mostrarRenda: boolean; mostrarPessoais: boolean }

/** O que cada membro esconde. */
export const ocultacaoDe = (m: Pick<MembroComPrivacidade, "pessoa" | "mostrarRenda" | "mostrarPessoais">): Ocultacao | null =>
  m.pessoa ? { pessoa: m.pessoa, renda: !m.mostrarRenda, pessoais: !m.mostrarPessoais } : null;

/** O que os outros membros escondem de quem está vendo (ele sempre vê o que é dele). */
export function ocultasPara(membros: MembroComPrivacidade[], usuario: string): Ocultacao[] {
  const eu = emailDe(usuario);
  return membros
    .filter((m) => m.aceito && m.email !== eu)
    .map(ocultacaoDe)
    .filter((o): o is Ocultacao => !!o && (o.renda || o.pessoais));
}

/**
 * Muda os dados do plano fora do "Salvar" (um membro troca de pessoa, sai…) e
 * sobe a versão: quem está editando recebe 409 e junta com o que mudou.
 */
export async function alterarDados(planoId: number, f: (d: DadosFamilia) => DadosFamilia): Promise<boolean> {
  for (let vez = 0; vez < 3; vez++) {
    const plano = await prisma.planoFamilia.findUnique({ where: { id: planoId }, select: { dados: true, versao: true } });
    if (!plano) return false;
    const dados = f(plano.dados as unknown as DadosFamilia) as unknown as Prisma.InputJsonValue;
    const r = await prisma.planoFamilia.updateMany({ where: { id: planoId, versao: plano.versao }, data: { dados, versao: plano.versao + 1 } });
    if (r.count === 1) return true;
  }
  return false;
}
