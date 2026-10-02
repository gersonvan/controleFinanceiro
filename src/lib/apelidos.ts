// "Mesmo pagamento" do usuário: chaveMemoria(descrição) → nome comum.
import { prisma } from "./db";
import { escopoDoUsuario } from "./tenant";

export async function carregarApelidos(userId: string): Promise<Map<string, string>> {
  const linhas = await prisma.apelido.findMany({ where: escopoDoUsuario(userId), select: { chave: true, nome: true } });
  return new Map(linhas.map((a) => [a.chave, a.nome]));
}
