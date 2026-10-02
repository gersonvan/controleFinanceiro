// Proxy (antigo middleware.ts — renomeado no Next 16). Gate de sessão para
// páginas, redirecionamento ao onboarding e a Content-Security-Policy com nonce
// (lib/csp.ts). Cada rota de API revalida a sessão por conta própria, então isto
// é a primeira camada, não a única.
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { NextResponse } from "next/server";
import { gerarNonce, montarCSP } from "@/lib/csp";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const pathname = req.nextUrl.pathname;
  const ehLogin = pathname === "/login" || pathname.startsWith("/login/");

  if (!req.auth && !ehLogin) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Strict false check: undefined (sessão antiga sem o campo) passa direto.
  // API, onboarding e login ficam sempre acessíveis.
  const livre = ehLogin || pathname.startsWith("/api") || pathname.startsWith("/onboarding");
  if (!livre && req.auth?.onboardingCompleto === false) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  // O Next lê o nonce do cabeçalho da requisição e o aplica aos scripts que gera.
  const nonce = gerarNonce();
  const csp = montarCSP(nonce);
  const cabecalhos = new Headers(req.headers);
  cabecalhos.set("x-nonce", nonce);
  cabecalhos.set("Content-Security-Policy", csp);
  const resposta = NextResponse.next({ request: { headers: cabecalhos } });
  resposta.headers.set("Content-Security-Policy", csp);
  return resposta;
});

export const config = {
  // o /login entra (precisa da CSP); a sessão só é exigida fora dele
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
