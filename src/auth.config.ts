import type { NextAuthConfig } from "next-auth";

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
};
