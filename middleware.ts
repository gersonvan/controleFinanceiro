import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  if (!req.auth) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const pathname = req.nextUrl.pathname;

  // API routes and onboarding page are always accessible when authenticated
  if (pathname.startsWith("/api") || pathname.startsWith("/onboarding")) {
    return NextResponse.next();
  }

  // Strict false check: undefined (old session without this field) passes through
  if (req.auth.onboardingCompleto === false) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }
});

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|login).*)",
  ],
};
