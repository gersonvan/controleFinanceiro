"use client";
// Painel lateral "Dividir": liga um Pix recebido aos gastos que ele devolve
// (conta dividida, racha de restaurante). O Pix vira Reembolso e abate os gastos.
import { useEffect, useMemo, useState } from "react";
import { distribuirReembolso } from "@/lib/reembolso";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (d: string) => new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" });

export interface PixParaDividir { id: number; data: string; descricao: string; valor: number }

interface Gasto {
  id: number; data: string; descricao: string; valor: number;
  categoria: string | null; conta: string; valorReembolsado: number;
  parte?: number; // quanto deste Pix já está neste gasto (vínculo existente)
}

interface Props {
  pix: PixParaDividir | null;
  onFechar: () => void;
  onSalvo: (mensagem: string) => void;
}

// Remonta a cada Pix (key): o estado do painel começa limpo sem reset em efeito.
export default function DividirPainel({ pix, ...resto }: Props) {
  return pix ? <Painel key={pix.id} pix={pix} {...resto} /> : null;
}

function Painel({ pix, onFechar, onSalvo }: Props & { pix: PixParaDividir }) {
  const [busca, setBusca] = useState("");
  const [termo, setTermo] = useState("");
  const [resultado, setResultado] = useState<{ termo: string; lista: Gasto[] } | null>(null);
  const [selecionados, setSelecionados] = useState<Map<number, Gasto>>(new Map());
  const [jaVinculado, setJaVinculado] = useState(false);
  const [parteAtual, setParteAtual] = useState<Map<number, number>>(new Map());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const candidatos = resultado?.lista ?? [];
  const carregando = resultado?.termo !== termo;

  // vínculos atuais do Pix (reabrir para editar)
  useEffect(() => {
    let ativo = true;
    fetch(`/api/reembolsos?entradaId=${pix.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((vinculos: Gasto[]) => {
        if (!ativo) return;
        setSelecionados(new Map(vinculos.map((g) => [g.id, g])));
        setParteAtual(new Map(vinculos.map((g) => [g.id, g.parte ?? 0])));
        setJaVinculado(vinculos.length > 0);
      });
    return () => { ativo = false; };
  }, [pix]);

  // busca com atraso curto enquanto digita
  useEffect(() => {
    const t = setTimeout(() => setTermo(busca.trim()), 250);
    return () => clearTimeout(t);
  }, [busca]);

  useEffect(() => {
    let ativo = true;
    const q = new URLSearchParams({ entradaId: String(pix.id) });
    if (termo) q.set("busca", termo);
    fetch(`/api/reembolsos/candidatos?${q}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((lista: Gasto[]) => { if (ativo) setResultado({ termo, lista }); });
    return () => { ativo = false; };
  }, [pix, termo]);

  // prévia da divisão, com a mesma regra do servidor
  const previa = useMemo(() => {
    const gastos = [...selecionados.values()].map((g) => ({
      id: g.id, valor: g.valor, jaReembolsado: Math.max(g.valorReembolsado - (parteAtual.get(g.id) ?? 0), 0),
    }));
    return distribuirReembolso(pix.valor, gastos);
  }, [pix, selecionados, parteAtual]);

  const alternar = (g: Gasto) => setSelecionados((prev) => {
    const novo = new Map(prev);
    if (novo.has(g.id)) novo.delete(g.id); else novo.set(g.id, g);
    return novo;
  });

  const salvar = async (saidaIds: number[]) => {
    setSalvando(true);
    setErro("");
    const r = await fetch("/api/reembolsos", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entradaId: pix.id, saidaIds }),
    });
    setSalvando(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setErro(j.error ?? "Não foi possível salvar.");
      return;
    }
    onSalvo(saidaIds.length
      ? `✅ ${fmt(pix.valor)} abatido de ${saidaIds.length} gasto${saidaIds.length > 1 ? "s" : ""}.`
      : "Divisão desfeita.");
  };

  const parteDe = (id: number) => previa?.partes.find((p) => p.saidaId === id)?.valor ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="t-dividir">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onFechar} />
      <div className="relative w-full sm:w-[460px] h-full bg-white shadow-2xl flex flex-col">
        <div className="p-5 border-b border-slate-100 space-y-2">
          <div className="flex items-center justify-between">
            <h2 id="t-dividir" className="text-lg font-bold text-slate-800">Dividir</h2>
            <button onClick={onFechar} className="text-slate-400 hover:text-slate-700 text-2xl leading-none" aria-label="Fechar">×</button>
          </div>
          <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-sm">
            <div className="text-slate-800 truncate" title={pix.descricao}>{pix.descricao}</div>
            <div className="text-xs text-slate-500">{fmtData(pix.data)} · <span className="font-semibold text-emerald-700">{fmt(pix.valor)}</span></div>
          </div>
          <p className="text-xs text-slate-500">
            Escolha o gasto (ou os gastos) que este valor devolve. Ele vira <strong>Reembolso</strong>: sai das entradas e abate esses gastos no mês de cada um.
          </p>
        </div>

        {selecionados.size > 0 && (
          <div className="px-5 py-3 border-b border-slate-100 space-y-1.5">
            {[...selecionados.values()].map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-slate-700" title={g.descricao}>{g.descricao}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-emerald-700 font-medium">−{fmt(parteDe(g.id))}</span>
                  <button onClick={() => alternar(g)} className="text-slate-400 hover:text-red-500" aria-label={`Tirar ${g.descricao}`}>×</button>
                </span>
              </div>
            ))}
            {previa && previa.sobra > 0 && (
              <p className="text-xs text-amber-700">
                {fmt(previa.sobra)} passam do que falta reembolsar nesses gastos e não serão contados.
              </p>
            )}
          </div>
        )}

        <div className="px-5 pt-3">
          <input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar gasto (ex.: TIM, restaurante…)"
            className="w-full"
          />
          <p className="text-xs text-slate-400 mt-1">
            {termo ? `Gastos com "${termo}"` : "Gastos perto da data do Pix. Digite para buscar em qualquer data."}
          </p>
        </div>

        <ul className="flex-1 overflow-y-auto px-2 py-2">
          {carregando ? (
            <li className="flex justify-center py-8"><span className="spinner" /></li>
          ) : candidatos.length === 0 ? (
            <li className="text-center text-sm text-slate-400 py-8">Nenhum gasto encontrado.</li>
          ) : candidatos.map((g) => {
            const marcado = selecionados.has(g.id);
            const outros = Math.max(g.valorReembolsado - (parteAtual.get(g.id) ?? 0), 0);
            return (
              <li key={g.id}>
                <label className={`flex items-start gap-3 px-3 py-2 rounded-lg cursor-pointer ${marcado ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                  <input type="checkbox" checked={marcado} onChange={() => alternar(g)} className="mt-1" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-slate-800 truncate" title={g.descricao}>{g.descricao}</span>
                    <span className="block text-xs text-slate-400">
                      {fmtData(g.data)} · {g.conta}{g.categoria ? ` · ${g.categoria}` : ""}
                      {outros > 0 && <span className="text-emerald-600"> · já reembolsado {fmt(outros)}</span>}
                    </span>
                  </span>
                  <span className="text-sm font-medium valor-negativo whitespace-nowrap">{fmt(g.valor)}</span>
                </label>
              </li>
            );
          })}
        </ul>

        <div className="p-4 border-t border-slate-100 space-y-2">
          {erro && <p className="text-sm text-red-600">{erro}</p>}
          <div className="flex gap-2">
            {jaVinculado && (
              <button onClick={() => salvar([])} disabled={salvando} className="btn btn-secondary text-red-600">Desfazer divisão</button>
            )}
            <button onClick={onFechar} className="btn btn-secondary ml-auto">Cancelar</button>
            <button onClick={() => salvar([...selecionados.keys()])} disabled={salvando || selecionados.size === 0} className="btn btn-primary">
              {salvando ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
