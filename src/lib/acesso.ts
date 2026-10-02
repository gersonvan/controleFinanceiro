// Quem pode entrar: a lista ALLOWED_EMAILS (e, no ambiente de testes, os usuários
// fictícios). Sem dependências do Node: usada tanto pelo login completo (auth.ts)
// quanto pelo proxy (auth.config.ts) — os dois precisam concordar, senão uma
// sessão revogada passava pelo proxy e as páginas quebravam com as APIs em 401.
import { loginDeTesteAtivo, usuarioDeTeste } from "./login-teste";

export function emailsPermitidos(lista = process.env.ALLOWED_EMAILS): Set<string> {
  return new Set((lista ?? "gersonvan@gmail.com").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));
}

const PERMITIDOS = emailsPermitidos();
const LOGIN_TESTE = loginDeTesteAtivo();

export function emailPermitido(email: string | null | undefined): boolean {
  if (!email) return false;
  return PERMITIDOS.has(email.toLowerCase()) || (LOGIN_TESTE && !!usuarioDeTeste(email));
}
