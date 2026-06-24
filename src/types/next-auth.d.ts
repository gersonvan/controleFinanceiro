import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    onboardingCompleto?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    onboardingCompleto?: boolean;
  }
}
