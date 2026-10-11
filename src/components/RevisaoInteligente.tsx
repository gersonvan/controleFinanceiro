"use client";
// Revisão da categorização inteligente: a IA sugere, o usuário confirma.
// Certeza alta já vem marcada; dá para trocar a categoria antes de aplicar.
import { useState } from "react";
import CategoriaSelect from "@/components/CategoriaSelect";

export interface SugestaoRevisao {
  id: number;
  descricao: string;
  data: string;
  valor: number;
  conta: string;
  categoria: string;
  certeza: "alta" | "media" | "baixa";
}

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (d: string) => new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" });
const CERTEZA: Record<SugestaoRevisao["certeza"], { rotulo: string; classe: string }> = {
  alta: { rotulo: "certeza alta", classe: "bg-emerald-50 text-emerald-700" },
  media: { rotulo: "certeza média", classe: "bg-amber-50 text-amber-700" },
  baixa: { rotulo: "palpite", classe: "bg-slate-100 text-slate-500" },
};

export default function RevisaoInteligente({ sugestoes, onFechar, onAplicado }: {
  sugestoes: SugestaoRevisao[];
  onFechar: () => void;
  onAplicado: (aplicados: number) => void;
}) {
  const [categorias, setCategorias] = useState(() => new Map(sugestoes.map((s) => [s.id, s.categoria])));
  const [marcados, setMarcados] = useState(() => new Set(sugestoes.filter((s) => s.certeza === "alta").map((s) => s.id)));
  const [aplicando, setAplicando] = useState(false);
  const [erro, setErro] = useState("");

  const alternar = (id: number) => setMarcados((m) => {
    const novo = new Set(m);
    if (novo.has(id)) novo.delete(id); else novo.add(id);
    return novo;
  });
  const todos = marcados.size === sugestoes.length;

  const aplicar = async () => {
    const itens = sugestoes.filter((s) => marcados.has(s.id) && categorias.get(s.id))
      .map((s) => ({ id: s.id, categoria: categorias.get(s.id)! }));
    if (!itens.length) return;
    setAplicando(true); setErro("");
    try {
      const r = await fetch("/api/categorizar", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itens }),
      });
      if (!r.ok) { setErro("Não foi possível aplicar. Tente de novo."); return; }
      onAplicado((await r.json()).aplicados);
    } finally { setAplicando(false); }
  };

  return (
    <div className="fixed inset-0 z-30 bg-slate-900/40 flex items-center justify-center p-4" onClick={onFechar}>
      <div role="dialog" aria-label="Sugestões da categorização inteligente"
        className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 space-y-1">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-800">✨ Sugestões da categorização inteligente</h2>
            <button onClick={onFechar} aria-label="Fechar" className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
          </div>
          <p className="text-sm text-slate-500">
            Nada foi gravado ainda. Confira, troque a categoria se precisar e aplique as marcadas — as de certeza alta já vêm marcadas.
            O que você confirmar ensina o app: lançamentos parecidos passam a ser categorizados pelo seu histórico.
          </p>
        </div>

        <div className="overflow-y-auto flex-1">
          <label className="flex items-center gap-3 px-5 py-2 text-xs text-slate-400 uppercase border-b border-slate-100">
            <input type="checkbox" checked={todos} aria-label="Marcar todas"
              onChange={() => setMarcados(todos ? new Set() : new Set(sugestoes.map((s) => s.id)))} />
            Marcar todas
          </label>
          <ul>
            {sugestoes.map((s) => (
              // no celular a categoria fica embaixo da descrição; a partir de sm, ao lado
              <li key={s.id} className="flex items-start gap-3 px-5 py-3 border-b border-slate-100" data-sugestao-ia={s.id}>
                <input type="checkbox" className="mt-1" checked={marcados.has(s.id)} onChange={() => alternar(s.id)} aria-label={`Aplicar em ${s.descricao}`} />
                <div className="flex-1 min-w-0 grid gap-2 sm:grid-cols-[1fr_16rem] sm:gap-4">
                  <div className="min-w-0 text-sm">
                    <div className="text-slate-800 break-words">{s.descricao}</div>
                    <div className="text-xs text-slate-400">
                      {fmtData(s.data)} · <span className={s.valor < 0 ? "text-red-600" : "text-emerald-600"}>{fmt(s.valor)}</span> · {s.conta}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <CategoriaSelect value={categorias.get(s.id) ?? ""} className="w-full text-sm"
                      onChange={(c) => {
                        setCategorias((m) => new Map(m).set(s.id, c));
                        if (c) setMarcados((m) => new Set(m).add(s.id)); // trocou = vai aplicar
                      }} />
                    <span className={`badge ${CERTEZA[s.certeza].classe}`}>{CERTEZA[s.certeza].rotulo}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="p-4 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-sm text-slate-500">{marcados.size} de {sugestoes.length} marcadas</span>
          {erro && <span className="text-sm text-red-600" role="alert">{erro}</span>}
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={onFechar}>Agora não</button>
            <button className="btn btn-primary" disabled={aplicando || marcados.size === 0} onClick={aplicar}>
              {aplicando ? <span className="spinner" /> : `Aplicar ${marcados.size}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
