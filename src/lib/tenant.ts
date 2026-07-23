/**
 * Aplica o tenant autenticado aos filtros e dados enviados ao Prisma.
 *
 * As rotas não devem montar `where: { userId }` manualmente: este helper
 * rejeita tentativas de trocar o tenant e torna o escopo explícito no ponto
 * de acesso aos dados.
 */
export function escopoDoUsuario<T extends Record<string, unknown>>(
  userId: string,
  filtro: T = {} as T
): T & { userId: string } {
  if (!userId) throw new Error("userId é obrigatório para acessar dados de tenant");

  if ("userId" in filtro && filtro.userId !== undefined && filtro.userId !== userId) {
    throw new Error("Não é permitido consultar dados de outro usuário");
  }

  return { ...filtro, userId };
}

/** Impede que um campo userId vindo do cliente substitua a sessão autenticada. */
export function dadosDoUsuario<T extends Record<string, unknown>>(
  userId: string,
  dados: T
): Omit<T, "userId"> & { userId: string } {
  if (!userId) throw new Error("userId é obrigatório para criar dados de tenant");

  if ("userId" in dados && dados.userId !== undefined && dados.userId !== userId) {
    throw new Error("Não é permitido criar dados para outro usuário");
  }

  const dadosSemUserId = Object.fromEntries(
    Object.entries(dados).filter(([campo]) => campo !== "userId")
  );
  return { ...dadosSemUserId, userId } as Omit<T, "userId"> & { userId: string };
}

/** Mantém o tenant imutável em atualizações de registros já existentes. */
export function dadosAtualizaveisDoUsuario<T extends Record<string, unknown>>(
  userId: string,
  dados: T
): Omit<T, "userId"> {
  if (!userId) throw new Error("userId é obrigatório para atualizar dados de tenant");

  if ("userId" in dados && dados.userId !== undefined && dados.userId !== userId) {
    throw new Error("Não é permitido atualizar dados de outro usuário");
  }

  const dadosSemUserId = Object.fromEntries(
    Object.entries(dados).filter(([campo]) => campo !== "userId")
  );
  return dadosSemUserId as Omit<T, "userId">;
}
