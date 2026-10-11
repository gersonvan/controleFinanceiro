"use client";
// Finanças abertas (lib/espaco.ts): o seletor do menu, a faixa de aviso quando
// são de outra pessoa e o contexto para as telas esconderem o que quem só vê
// não pode fazer (o servidor recusa de qualquer jeito).
import { createContext, useContext, useState } from "react";
import { Users } from "lucide-react";
import type { OpcaoEspaco, Papel } from "@/lib/espaco";

const EspacoContexto = createContext<{ papel: Papel; nome: string }>({ papel: "dono", nome: "" });
export const useEspaco = () => useContext(EspacoContexto);

export function EspacoProvider({ papel, nome, children }: { papel: Papel; nome: string; children: React.ReactNode }) {
  return <EspacoContexto.Provider value={{ papel, nome }}>{children}</EspacoContexto.Provider>;
}

/** Abre as finanças de `dono` (as próprias, com o e-mail do usuário) e recomeça pelo dashboard. */
export async function abrirFinancas(dono: string) {
  const r = await fetch("/api/espaco", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dono }) });
  // recarga completa de propósito (não router.push): as telas guardam dados já
  // buscados, e tudo precisa vir de novo das finanças escolhidas
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  if (r.ok) window.location.assign("/");
}

export function SeletorEspaco({ opcoes, atual }: { opcoes: OpcaoEspaco[]; atual: string }) {
  const [trocando, setTrocando] = useState(false);
  if (opcoes.length < 2) return null;
  return (
    <label className="flex items-center gap-2 px-3 pb-3 text-xs text-slate-500">
      <Users size={14} aria-hidden className="shrink-0" />
      <select aria-label="Finanças abertas" value={atual} disabled={trocando} className="flex-1 min-w-0 text-sm py-1"
        onChange={(e) => { setTrocando(true); void abrirFinancas(e.target.value); }}>
        {opcoes.map((o) => (
          <option key={o.dono} value={o.dono}>{o.papel === "dono" ? o.nome : `Finanças de ${o.nome}`}</option>
        ))}
      </select>
    </label>
  );
}

export function AvisoEspaco({ nome, papel, meu }: { nome: string; papel: Papel; meu: string }) {
  if (papel === "dono") return null;
  return (
    <div className="mb-4 flex items-center justify-between gap-3 flex-wrap rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900"
      role="status" data-espaco-aviso>
      <span>
        Você está nas finanças de <strong>{nome}</strong> ·{" "}
        {papel === "ajudar" ? "pode ajudar (importar, categorizar, planejar)" : "só visualização"}
      </span>
      <button className="text-blue-700 underline hover:text-blue-900" onClick={() => void abrirFinancas(meu)}>Voltar para as minhas</button>
    </div>
  );
}
