import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import { auth } from "@/auth";

export const metadata: Metadata = {
  title: "Prumo",
  description: "Sistema de controle financeiro pessoal",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();

  // No session (login) or onboarding not complete: full-screen without Nav
  if (!session || session.onboardingCompleto === false) {
    return (
      <html lang="pt-BR" className="h-full">
        <body className="min-h-full bg-slate-50">{children}</body>
      </html>
    );
  }

  return (
    <html lang="pt-BR" className="h-full">
      <body className="min-h-full flex">
        <Nav user={session.user} />
        <main className="flex-1 md:ml-56 pt-18 md:pt-6 p-4 md:p-6 min-h-screen min-w-0">{children}</main>
      </body>
    </html>
  );
}
