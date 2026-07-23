"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import type { Session } from "next-auth";

const links = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/lancamentos", label: "Lançamentos", icon: "📋" },
  { href: "/matriz", label: "Matriz", icon: "🗂️" },
  { href: "/importar", label: "Importar Lançamentos", icon: "📂" },
  { href: "/previsao", label: "Previsão", icon: "🔮" },
  { href: "/emprestimos", label: "Empréstimos", icon: "🤝" },
  { href: "/memoria-ia", label: "Memória Local", icon: "🧠" },
  { href: "/configuracoes", label: "Configurações", icon: "⚙️" },
];

export default function Nav({ user }: { user?: Session["user"] }) {
  const pathname = usePathname();
  return (
    <aside className="fixed left-0 top-0 bottom-0 w-56 bg-slate-900 text-white flex flex-col z-10">
      <div className="p-4 border-b border-slate-700">
        <div className="text-lg font-bold text-white">💰 FinanceiroWeb</div>
        <div className="text-xs text-slate-400 mt-0.5">Controle Financeiro</div>
      </div>
      <nav className="flex-1 p-3 space-y-0.5">
        {links.map((l) => {
          const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
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
        })}
      </nav>

      {/* Usuário logado */}
      {user && (
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
      )}
    </aside>
  );
}
