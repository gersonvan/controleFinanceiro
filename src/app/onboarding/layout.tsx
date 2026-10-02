import { SessionProvider } from "next-auth/react";
import { auth } from "@/auth";

// O onboarding usa useSession() (nome do Google e update() ao concluir), que
// exige o provider. A sessão vem do servidor para não piscar vazia no início.
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return <SessionProvider session={session}>{children}</SessionProvider>;
}
