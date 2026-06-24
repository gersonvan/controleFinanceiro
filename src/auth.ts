import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/db";
import { authConfig } from "./auth.config";

const ALLOWED_EMAILS = new Set(
  (process.env.ALLOWED_EMAILS ?? "gersonvan@gmail.com")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [Google],
  callbacks: {
    signIn({ user }) {
      return ALLOWED_EMAILS.has(user.email ?? "");
    },
    async jwt({ token, user, trigger, session: updatedSession }) {
      // On login: check or create UserProfile
      if (user?.email) {
        const email = user.email;
        let profile = await prisma.userProfile.findUnique({ where: { userId: email } });
        if (!profile) {
          // Auto-graduate existing users who already have data
          const temDados = (await prisma.lancamento.count({ where: { userId: email } })) > 0;
          profile = await prisma.userProfile.create({
            data: { userId: email, onboardingCompleto: temDados },
          });
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
