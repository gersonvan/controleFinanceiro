import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const ALLOWED_EMAILS = ["gersonvan@gmail.com"];

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  callbacks: {
    signIn({ user }) {
      return ALLOWED_EMAILS.includes(user.email ?? "");
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
});
