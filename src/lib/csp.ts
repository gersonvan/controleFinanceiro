// Content-Security-Policy com nonce: a cada requisição o proxy sorteia um valor
// e só scripts marcados com ele executam (o Next marca os dele sozinho, lendo o
// nonce deste cabeçalho). Um <script> injetado não conhece o valor e é bloqueado.
// Antes era 'unsafe-inline', que deixava rodar qualquer script dentro da página.

export function gerarNonce(): string {
  return btoa(crypto.randomUUID());
}

export function montarCSP(nonce: string, dev = process.env.NODE_ENV === "development"): string {
  return [
    "default-src 'self'",
    // 'strict-dynamic': scripts carregados por um script com nonce (chunks do Next) também valem.
    // Em dev o React usa eval para reconstruir as pilhas de erro; em produção não.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // estilos sem nonce de propósito: com nonce o navegador ignora 'unsafe-inline',
    // e a Matriz e o Next usam atributos style=""
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.googleusercontent.com", // avatar do Google
    "font-src 'self' data:",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`, // HMR em dev
    // o botão de login é um Server Action redirecionado ao Google; o Chrome aplica form-action ao redirect
    "form-action 'self' https://accounts.google.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
