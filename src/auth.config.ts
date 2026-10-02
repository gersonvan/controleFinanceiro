import type { NextAuthConfig } from "next-auth";
import { emailPermitido } from "@/lib/acesso";

// Configuração mínima para o proxy (Edge-compatible, sem imports Node.js).
// O segredo é referenciado aqui de forma estática: no bundle do proxy o Next
// inlina `process.env.AUTH_SECRET` em tempo de build, mas não resolve a
// leitura feita dentro do next-auth — sem isto o proxy falha com MissingSecret
// no dev server e manda todo mundo para /login.
export const authConfig: NextAuthConfig = {
  secret: process.env.AUTH_SECRET,
  providers: [],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    // Mesma lista do login completo: e-mail retirado de ALLOWED_EMAILS perde a
    // sessão também no proxy, que manda para o login (antes a página abria e
    // quebrava com as APIs em 401).
    jwt({ token }) {
      return emailPermitido(token.email) ? token : null;
    },
    // O proxy lê req.auth com esta configuração: sem copiar o campo do token,
    // onboardingCompleto chegava sempre undefined, ninguém era levado ao
    // onboarding, e o layout (que vê false) escondia o menu de quem não o concluiu.
    session({ session, token }) {
      session.onboardingCompleto = token.onboardingCompleto;
      return session;
    },
  },
};
