import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import { authConfig } from "./auth.config";
import { loginDeTesteAtivo, usuarioDeTeste } from "@/lib/login-teste";

const ALLOWED_EMAILS = new Set(
  (process.env.ALLOWED_EMAILS ?? "gersonvan@gmail.com")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

// Ambiente de testes (src/lib/login-teste.ts): os usuários fictícios entram sem Google.
const LOGIN_TESTE = loginDeTesteAtivo();

function emailPermitido(email: string | null | undefined): boolean {
  if (!email) return false;
  return ALLOWED_EMAILS.has(email.toLowerCase()) || (LOGIN_TESTE && !!usuarioDeTeste(email));
}

const provedorDeTeste = Credentials({
  id: "teste",
  name: "Usuário de teste",
  credentials: { email: { type: "email" } },
  authorize(credenciais) {
    const u = usuarioDeTeste(credenciais?.email);
    return u ? { id: u.email, email: u.email, name: u.nome } : null;
  },
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: LOGIN_TESTE ? [Google, provedorDeTeste] : [Google],
  session: {
    // Sessão JWT sem revogação no servidor: quanto menor, menor a janela de exposição.
    maxAge: 7 * 24 * 60 * 60,
  },
  callbacks: {
    signIn({ user, profile }) {
      // Google informa se o e-mail foi verificado; sem isso não há garantia de identidade.
      if (profile && profile.email_verified !== true) return false;
      return emailPermitido(user.email);
    },
    async jwt({ token, user, trigger, session: updatedSession }) {
      // Revalida a allowlist a cada requisição: remover um e-mail derruba a sessão
      // existente em vez de esperar o JWT expirar.
      if (!emailPermitido(token.email)) return null;

      // On login: check or create UserProfile
      if (user?.email) {
        const email = user.email;
        let profile = await prisma.userProfile.findUnique({ where: { userId: email } });
        if (!profile) {
          // Auto-graduate existing users who already have data
          const temDados = (await prisma.lancamento.count({ where: { userId: email } })) > 0;
          profile = await prisma.userProfile.create({
            data: { userId: email, onboardingCompleto: temDados, nomeCompleto: user.name?.trim() ?? "" },
          });
        } else if (!profile.nomeCompleto && user.name?.trim()) {
          // ponto de partida para reconhecer Pix entre contas próprias; o usuário corrige em Configurações › Importação
          await prisma.userProfile.update({ where: { userId: email }, data: { nomeCompleto: user.name.trim() } });
        }
        token.onboardingCompleto = profile.onboardingCompleto;
      }
      // On client update() call
      if (trigger === "update" && updatedSession?.onboardingCompleto !== undefined) {
        token.onboardingCompleto = updatedSession.onboardingCompleto as boolean;
      }
      return token;
    },
    async session({ session, token }) {
      session.onboardingCompleto = token.onboardingCompleto;
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
});
