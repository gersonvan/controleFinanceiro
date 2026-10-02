// Login de teste para os testes de ponta a ponta (Playwright) e uso local.
// Só existe com as três travas ao mesmo tempo: fora de produção (o build da
// Vercel roda com NODE_ENV=production), AUTH_TEST_LOGIN=1 e banco em localhost
// — mesmo mal configurado, nunca entra numa conta de verdade nem no Neon.

export const USUARIOS_TESTE = [
  { email: "ana.teste@example.com", nome: "Ana Teste da Silva", rotulo: "Ana (com dados)" },
  { email: "bruno.teste@example.com", nome: "Bruno Teste Souza", rotulo: "Bruno (conta nova)" },
] as const;

type Ambiente = Partial<Record<"NODE_ENV" | "AUTH_TEST_LOGIN" | "DATABASE_URL", string>>;

export function loginDeTesteAtivo(env: Ambiente = process.env): boolean {
  if (env.NODE_ENV === "production" || env.AUTH_TEST_LOGIN !== "1") return false;
  try {
    const host = new URL(env.DATABASE_URL ?? "").hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

export function usuarioDeTeste(email: unknown) {
  return typeof email === "string" ? USUARIOS_TESTE.find((u) => u.email === email.toLowerCase()) : undefined;
}
