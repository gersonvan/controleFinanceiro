import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import { auth } from "@/auth";
import { contextoDaSessao, espacosDoUsuario } from "@/lib/espaco";
import { AvisoEspaco, EspacoProvider } from "@/components/Espaco";
import { CategoriasProvider } from "@/components/Categorias";
import { linhasDoUsuario } from "@/lib/categorias-usuario";

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

  // de quem são as finanças abertas (lib/espaco.ts) e quais a pessoa pode abrir
  const contexto = await contextoDaSessao();
  const espacos = contexto ? await espacosDoUsuario(contexto.usuario) : [];
  const atual = espacos.find((e) => e.dono === contexto?.dono);
  // as categorias das finanças abertas (nativas não ocultas + personalizadas), para os seletores
  const categorias = contexto ? await linhasDoUsuario(contexto.dono) : [];

  return (
    <html lang="pt-BR" className="h-full">
      <body className="min-h-full flex">
        <Nav user={session.user} espacos={espacos} atual={contexto?.dono ?? ""} />
        <main className="flex-1 md:ml-56 pt-18 md:pt-6 p-4 md:p-6 min-h-screen min-w-0">
          <EspacoProvider papel={contexto?.papel ?? "dono"} nome={atual?.nome ?? ""}>
            <CategoriasProvider linhas={categorias}>
              {contexto && atual && <AvisoEspaco nome={atual.nome} papel={contexto.papel} meu={contexto.usuario} />}
              {children}
            </CategoriasProvider>
          </EspacoProvider>
        </main>
      </body>
    </html>
  );
}
