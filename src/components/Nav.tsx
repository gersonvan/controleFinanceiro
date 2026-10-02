"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import type { Session } from "next-auth";

interface ItemMenu { href: string; label: string; icon?: string }
interface GrupoMenu { label: string; icon: string; href?: string; filhos: ItemMenu[] }
type EntradaMenu = ItemMenu | GrupoMenu;

// Uso real: acompanhar → planejar → importar → lançamentos → ferramentas → ajustes
const menu: EntradaMenu[] = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/planejamento", label: "Planejamento", icon: "📸" },
  { href: "/importar", label: "Importar Lançamentos", icon: "📂" },
  { href: "/lancamentos", label: "Lançamentos", icon: "📋", filhos: [
    { href: "/lancamentos/revisar", label: "Revisar categorias" },
  ] },
  { label: "Ferramentas", icon: "🧰", filhos: [
    { href: "/matriz", label: "Matriz", icon: "🗂️" },
    { href: "/previsao", label: "Previsão", icon: "🔮" },
    { href: "/reserva", label: "Reserva", icon: "💰" },
    { href: "/emprestimos", label: "Empréstimos", icon: "🤝" },
  ] },
  { label: "Configurações", icon: "⚙️", filhos: [
    { href: "/configuracoes/contas", label: "Contas", icon: "🏦" },
    { href: "/configuracoes/importacao", label: "Importação", icon: "📥" },
    { href: "/configuracoes/memoria", label: "Memória Local", icon: "🧠" },
    { href: "/configuracoes/mesmo-pagamento", label: "Mesmo pagamento", icon: "🔗" },
  ] },
];

const ehGrupo = (e: EntradaMenu): e is GrupoMenu => "filhos" in e;
const ativoEm = (href: string, pathname: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

// Desktop (md+): barra lateral fixa. Celular: barra superior com menu que
// abre/fecha; o menu fecha ao navegar. Grupos abrem e fecham; o grupo da
// página atual já vem aberto.
export default function Nav({ user }: { user?: Session["user"] }) {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const [gruposAbertos, setGruposAbertos] = useState<Set<string>>(new Set());

  const classeLink = (ativo: boolean, filho = false) =>
    `flex items-center gap-2.5 ${filho ? "pl-9 pr-3 py-2" : "px-3 py-2.5"} rounded-lg text-sm transition-colors ${
      ativo ? "bg-blue-600 text-white font-medium" : "text-slate-300 hover:bg-slate-800 hover:text-white"
    }`;

  const link = (l: ItemMenu, filho = false, ativo = ativoEm(l.href, pathname)) => (
    <Link key={l.href} href={l.href} onClick={() => setAberto(false)} className={classeLink(ativo, filho)}
      aria-current={ativo ? "page" : undefined}>
      {l.icon && <span>{l.icon}</span>}
      {l.label}
    </Link>
  );

  const itens = menu.map((e) => {
    if (!ehGrupo(e)) return link(e);
    const contemAtual = e.filhos.some((f) => ativoEm(f.href, pathname)) || (!!e.href && ativoEm(e.href, pathname));
    const expandido = contemAtual || gruposAbertos.has(e.label);
    const alternar = () => setGruposAbertos((prev) => {
      const novo = new Set(prev);
      if (novo.has(e.label)) novo.delete(e.label); else novo.add(e.label);
      return novo;
    });
    const seta = (
      <span className={`ml-auto text-xs text-slate-500 transition-transform ${expandido ? "rotate-90" : ""}`} aria-hidden>▶</span>
    );
    return (
      <div key={e.label} className="space-y-0.5">
        {e.href ? (
          // grupo que também é página (Lançamentos): o link leva à página, a seta abre os filhos
          <div className="flex items-center">
            <Link href={e.href} onClick={() => setAberto(false)}
              className={`${classeLink(pathname === e.href)} flex-1`} aria-current={pathname === e.href ? "page" : undefined}>
              <span>{e.icon}</span>{e.label}
            </Link>
            <button onClick={alternar} aria-expanded={expandido} aria-label={`${expandido ? "Fechar" : "Abrir"} ${e.label}`}
              className="px-2 py-2.5 text-slate-500 hover:text-white">
              <span className={`inline-block text-xs transition-transform ${expandido ? "rotate-90" : ""}`}>▶</span>
            </button>
          </div>
        ) : (
          <button onClick={alternar} aria-expanded={expandido}
            className={`w-full ${classeLink(false)} ${contemAtual ? "text-white" : ""}`}>
            <span>{e.icon}</span>{e.label}{seta}
          </button>
        )}
        {expandido && e.filhos.map((f) => link(f, true))}
      </div>
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
