import type { NextAuthConfig } from "next-auth";

// Configuração mínima para o middleware (Edge-compatible, sem imports Node.js)
export const authConfig: NextAuthConfig = {
  providers: [],
  pages: {
    signIn: "/login",
    error: "/login",
  },
};
