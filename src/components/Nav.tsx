"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import type { Session } from "next-auth";

const links = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/planejamento", label: "Planejamento", icon: "📸" },
  { href: "/lancamentos", label: "Lançamentos", icon: "📋" },
  { href: "/matriz", label: "Matriz", icon: "🗂️" },
  { href: "/importar", label: "Importar Lançamentos", icon: "📂" },
  { href: "/previsao", label: "Previsão", icon: "🔮" },
  { href: "/reserva", label: "Reserva", icon: "💰" },
  { href: "/emprestimos", label: "Empréstimos", icon: "🤝" },
  { href: "/memoria-ia", label: "Memória Local", icon: "🧠" },
  { href: "/configuracoes", label: "Configurações", icon: "⚙️" },
];

// Desktop (md+): barra lateral fixa. Celular: barra superior com menu que
// abre/fecha; o menu fecha ao navegar.
export default function Nav({ user }: { user?: Session["user"] }) {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);

  const itens = links.map((l) => {
    const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
    return (
      <Link
        key={l.href}
        href={l.href}
        onClick={() => setAberto(false)}
        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors ${
          active
            ? "bg-blue-600 text-white font-medium"
            : "text-slate-300 hover:bg-slate-800 hover:text-white"
        }`}
      >
        <span>{l.icon}</span>
        {l.label}
      </Link>
    );
  });

  const usuario = user && (
    <div className="p-3 border-t border-slate-700">
      <div className="flex items-center gap-2 mb-2">
        {user.image && (
          <Image src={user.image} alt="" width={28} height={28} unoptimized className="w-7 h-7 rounded-full" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-white truncate">{user.name}</div>
          <div className="text-xs text-slate-400 truncate">{user.email}</div>
        </div>
      </div>
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="w-full text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg px-3 py-1.5 transition-colors text-left"
      >
        Sair
      </button>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-56 bg-slate-900 text-white flex-col z-10">
        <div className="p-4 border-b border-slate-700">
          <div className="text-lg font-bold text-white">💰 FinanceiroWeb</div>
          <div className="text-xs text-slate-400 mt-0.5">Controle Financeiro</div>
        </div>
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">{itens}</nav>
        {usuario}
      </aside>

      {/* Celular */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-20 bg-slate-900 text-white">
        <div className="flex items-center justify-between px-4 h-14">
          <Link href="/" className="font-bold" onClick={() => setAberto(false)}>💰 FinanceiroWeb</Link>
          <button
            onClick={() => setAberto((v) => !v)}
            aria-label={aberto ? "Fechar menu" : "Abrir menu"}
            aria-expanded={aberto}
            className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-slate-800 text-xl"
          >
            {aberto ? "✕" : "☰"}
          </button>
        </div>
        {aberto && (
          <div className="border-t border-slate-700 max-h-[calc(100vh-3.5rem)] overflow-y-auto">
            <nav className="p-3 space-y-0.5">{itens}</nav>
            {usuario}
          </div>
        )}
      </header>
      {aberto && (
        <div className="md:hidden fixed inset-0 z-10 bg-slate-900/40" onClick={() => setAberto(false)} />
      )}
    </>
  );
}
