"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import type { Session } from "next-auth";
import { SeletorEspaco } from "@/components/Espaco";
import type { OpcaoEspaco } from "@/lib/espaco";
import {
  Brain, Camera, ChevronRight, FileDown, FileUp, Grid3x3, Handshake, Landmark, LayoutDashboard,
  Link2, LogOut, Menu, PiggyBank, ReceiptText, Settings, Share2, Target, TrendingUp, Wallet, Wrench, X,
  type LucideIcon,
} from "lucide-react";

interface ItemMenu { href: string; label: string; icon?: LucideIcon }
interface GrupoMenu { label: string; icon: LucideIcon; href?: string; filhos: ItemMenu[] }
type EntradaMenu = ItemMenu | GrupoMenu;

// Uso real: acompanhar → planejar → importar → lançamentos → ferramentas → ajustes
const menu: EntradaMenu[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/planejamento", label: "Planejamento", icon: Camera },
  { href: "/desafios", label: "Desafios", icon: Target },
  { href: "/importar", label: "Importar Lançamentos", icon: FileUp },
  { href: "/lancamentos", label: "Lançamentos", icon: ReceiptText, filhos: [
    { href: "/lancamentos/revisar", label: "Revisar categorias" },
  ] },
  { label: "Ferramentas", icon: Wrench, filhos: [
    { href: "/matriz", label: "Matriz", icon: Grid3x3 },
    { href: "/previsao", label: "Previsão", icon: TrendingUp },
    { href: "/reserva", label: "Reserva", icon: PiggyBank },
    { href: "/emprestimos", label: "Empréstimos", icon: Handshake },
  ] },
  { label: "Configurações", icon: Settings, filhos: [
    { href: "/configuracoes/contas", label: "Contas", icon: Landmark },
    { href: "/configuracoes/importacao", label: "Importação", icon: FileDown },
    { href: "/configuracoes/memoria", label: "Memória Local", icon: Brain },
    { href: "/configuracoes/mesmo-pagamento", label: "Mesmo pagamento", icon: Link2 },
    { href: "/configuracoes/compartilhar", label: "Compartilhar", icon: Share2 },
  ] },
];

const ehGrupo = (e: EntradaMenu): e is GrupoMenu => "filhos" in e;
const ativoEm = (href: string, pathname: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

// Desktop (md+): barra lateral fixa. Celular: barra superior com menu que
// abre/fecha; o menu fecha ao navegar. Grupos abrem e fecham; o grupo da
// página atual já vem aberto.
export default function Nav({ user, espacos = [], atual = "" }: { user?: Session["user"]; espacos?: OpcaoEspaco[]; atual?: string }) {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const [gruposAbertos, setGruposAbertos] = useState<Set<string>>(new Set());

  const classeLink = (ativo: boolean, filho = false) =>
    `flex items-center gap-2 ${filho ? "pl-9 pr-3 py-2" : "px-3 py-2.5"} rounded-lg text-sm transition-colors ${
      ativo ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
    }`;

  const link = (l: ItemMenu, filho = false, ativo = ativoEm(l.href, pathname)) => (
    <Link key={l.href} href={l.href} onClick={() => setAberto(false)} className={classeLink(ativo, filho)}
      aria-current={ativo ? "page" : undefined}>
      {l.icon && <l.icon size={16} strokeWidth={1.75} aria-hidden className="shrink-0" />}
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
    const Icone = e.icon;
    const seta = (
      <ChevronRight size={16} aria-hidden className={`ml-auto shrink-0 text-slate-500 transition-transform ${expandido ? "rotate-90" : ""}`} />
    );
    return (
      <div key={e.label} className="space-y-0.5">
        {e.href ? (
          // grupo que também é página (Lançamentos): o link leva à página, a seta abre os filhos
          <div className="flex items-center">
            <Link href={e.href} onClick={() => setAberto(false)}
              className={`${classeLink(pathname === e.href)} flex-1`} aria-current={pathname === e.href ? "page" : undefined}>
              <Icone size={16} strokeWidth={1.75} aria-hidden className="shrink-0" />{e.label}
            </Link>
            <button onClick={alternar} aria-expanded={expandido} aria-label={`${expandido ? "Fechar" : "Abrir"} ${e.label}`}
              className="px-2 py-2.5 text-slate-500 hover:text-slate-900">
              <ChevronRight size={16} aria-hidden className={`transition-transform ${expandido ? "rotate-90" : ""}`} />
            </button>
          </div>
        ) : (
          <button onClick={alternar} aria-expanded={expandido}
            className={`w-full ${classeLink(false)} ${contemAtual ? "text-slate-900" : ""}`}>
            <Icone size={16} strokeWidth={1.75} aria-hidden className="shrink-0" />{e.label}{seta}
          </button>
        )}
        {expandido && e.filhos.map((f) => link(f, true))}
      </div>
    );
  });

  const usuario = user && (
    <div className="p-3 border-t border-slate-200">
      <div className="flex items-center gap-2 mb-2">
        {user.image && (
          <Image src={user.image} alt="" width={28} height={28} unoptimized className="w-7 h-7 rounded-full" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-slate-800 truncate">{user.name}</div>
          <div className="text-xs text-slate-500 truncate">{user.email}</div>
        </div>
      </div>
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="w-full flex items-center gap-2 text-xs text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg px-3 py-1.5 transition-colors text-left"
      >
        <LogOut size={14} aria-hidden />
        Sair
      </button>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-56 bg-white text-slate-700 border-r border-slate-200 flex-col z-10">
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center gap-2 text-lg font-bold text-slate-800"><Wallet size={20} aria-hidden className="text-blue-600" />Prumo</div>
          <div className="text-xs text-slate-500 mt-0.5">Controle Financeiro</div>
        </div>
        <div className="pt-3"><SeletorEspaco opcoes={espacos} atual={atual} /></div>
        <nav className="flex-1 p-3 pt-0 space-y-0.5 overflow-y-auto">{itens}</nav>
        {usuario}
      </aside>

      {/* Celular */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-20 bg-white text-slate-800 border-b border-slate-200">
        <div className="flex items-center justify-between px-4 h-14">
          <Link href="/" className="flex items-center gap-2 font-bold" onClick={() => setAberto(false)}><Wallet size={20} aria-hidden className="text-blue-600" />Prumo</Link>
          <button
            onClick={() => setAberto((v) => !v)}
            aria-label={aberto ? "Fechar menu" : "Abrir menu"}
            aria-expanded={aberto}
            className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-slate-100"
          >
            {aberto ? <X size={22} aria-hidden /> : <Menu size={22} aria-hidden />}
          </button>
        </div>
        {aberto && (
          <div className="border-t border-slate-200 max-h-[calc(100vh-3.5rem)] overflow-y-auto">
            <div className="pt-3"><SeletorEspaco opcoes={espacos} atual={atual} /></div>
            <nav className="p-3 pt-0 space-y-0.5">{itens}</nav>
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
