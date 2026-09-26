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

interface Parecido {
  pix: { id: number; data: string; descricao: string; valor: number };
  gasto: { id: number; data: string; descricao: string; valor: number };
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
  const [sugeridoId, setSugeridoId] = useState<number | null>(null);
  // depois de salvar: Pix parecidos do mesmo pagador que o padrão sabe ligar
  const [parecidos, setParecidos] = useState<{ mensagem: string; lista: Parecido[] } | null>(null);
  const candidatos = resultado?.lista ?? [];
  const carregando = resultado?.termo !== termo;

  // vínculos atuais do Pix (reabrir para editar); sem vínculo, o gasto que o
  // padrão aprendido sugere já vem marcado
  useEffect(() => {
    let ativo = true;
    Promise.all([
      fetch(`/api/reembolsos?entradaId=${pix.id}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/reembolsos/candidatos?entradaId=${pix.id}`).then((r) => (r.ok ? r.json() : { sugerido: null })),
    ]).then(([vinculos, { sugerido }]: [Gasto[], { sugerido: Gasto | null }]) => {
      if (!ativo) return;
      const iniciais = vinculos.length ? vinculos : sugerido ? [sugerido] : [];
      setSelecionados(new Map(iniciais.map((g) => [g.id, g])));
      setParteAtual(new Map(vinculos.map((g) => [g.id, g.parte ?? 0])));
      setJaVinculado(vinculos.length > 0);
      if (!vinculos.length && sugerido) setSugeridoId(sugerido.id);
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
      .then((r) => (r.ok ? r.json() : { gastos: [] }))
      .then((j: { gastos: Gasto[] }) => { if (ativo) setResultado({ termo, lista: j.gastos }); });
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
    if (!saidaIds.length) { onSalvo("Divisão desfeita."); return; }
    const mensagem = `✅ ${fmt(pix.valor)} abatido de ${saidaIds.length} gasto${saidaIds.length > 1 ? "s" : ""}.`;
    const lista: Parecido[] = await fetch(`/api/reembolsos/parecidos?entradaId=${pix.id}`)
      .then((x) => (x.ok ? x.json() : [])).catch(() => []);
    if (lista.length) setParecidos({ mensagem, lista });
    else onSalvo(mensagem);
  };

  const vincularParecidos = async () => {
    if (!parecidos) return;
    setSalvando(true);
    const r = await fetch("/api/reembolsos/aplicar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entradaIds: parecidos.lista.map((p) => p.pix.id) }),
    });
    setSalvando(false);
    const { vinculados = 0 } = r.ok ? await r.json() : {};
    onSalvo(`${parecidos.mensagem} ${vinculados} Pix parecido${vinculados === 1 ? "" : "s"} também dividido${vinculados === 1 ? "" : "s"}.`);
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
            Escolha o gasto (ou os gastos) que este valor devolve. Ele vira <strong>Reembolso</strong>: abate esses gastos no mês de cada um, e só o que sobrar conta como entrada.
          </p>
        </div>

        {parecidos ? (
          <>
            <div className="px-5 py-4 space-y-1 border-b border-slate-100">
              <p className="text-sm font-medium text-emerald-700">{parecidos.mensagem}</p>
              <p className="text-sm text-slate-700">
                Encontrei <strong>{parecidos.lista.length} Pix parecido{parecidos.lista.length > 1 ? "s" : ""}</strong> deste
                pagador ainda sem divisão. Dividir cada um com o gasto do mesmo período?
              </p>
            </div>
            <ul className="flex-1 overflow-y-auto px-5 py-2 divide-y divide-slate-100">
              {parecidos.lista.map(({ pix: p, gasto: g }) => (
                <li key={p.id} className="py-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">{fmtData(p.data)}</span>
                    <span className="font-medium text-emerald-700">{fmt(p.valor)}</span>
                  </div>
                  <div className="flex justify-between gap-2 text-xs text-slate-500">
                    <span className="truncate" title={g.descricao}>→ {g.descricao} · {fmtData(g.data)}</span>
                    <span className="valor-negativo whitespace-nowrap">{fmt(g.valor)}</span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="p-4 border-t border-slate-100 flex gap-2">
              <button onClick={() => onSalvo(parecidos.mensagem)} disabled={salvando} className="btn btn-secondary ml-auto">Agora não</button>
              <button onClick={vincularParecidos} disabled={salvando} className="btn btn-primary">
                {salvando ? "Dividindo…" : `Dividir os ${parecidos.lista.length}`}
              </button>
            </div>
          </>
        ) : (
          <>
        {selecionados.size > 0 && (
          <div className="px-5 py-3 border-b border-slate-100 space-y-1.5">
            {[...selecionados.values()].map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-slate-700" title={g.descricao}>
                  {g.descricao} <span className="text-xs text-slate-400">· {fmtData(g.data)}</span>
                  {g.id === sugeridoId && <span className="ml-1 text-xs text-blue-600">(sugerido pelo seu padrão)</span>}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-emerald-700 font-medium">−{fmt(parteDe(g.id))}</span>
                  <button onClick={() => alternar(g)} className="text-slate-400 hover:text-red-500" aria-label={`Tirar ${g.descricao}`}>×</button>
                </span>
              </div>
            ))}
            {previa && previa.sobra > 0 && (
              <p className="text-xs text-amber-700">
                {fmt(previa.sobra)} passam do que falta reembolsar nesses gastos e vão contar como entrada (sobra).
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
          </>
        )}
      </div>
    </div>
  );
}
