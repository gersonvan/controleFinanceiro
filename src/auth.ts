import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const ALLOWED_EMAILS = new Set(
  (process.env.ALLOWED_EMAILS ?? "gersonvan@gmail.com")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  callbacks: {
    signIn({ user }) {
      return ALLOWED_EMAILS.has(user.email ?? "");
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
});
