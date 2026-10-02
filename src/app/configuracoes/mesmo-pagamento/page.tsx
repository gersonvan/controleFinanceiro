"use client";
// "Mesmo pagamento": descrições diferentes do mesmo compromisso sob um nome
// (ex.: AYMORE e SANTANDER no financiamento do carro). Criados na tela de
// Lançamentos (selecionar → "Mesmo pagamento…"); aqui renomeia e desfaz.
import { useEffect, useState } from "react";
import Link from "next/link";
import type { GrupoApelido } from "@/app/api/apelidos/route";

export default function MesmoPagamentoPage() {
  const [grupos, setGrupos] = useState<GrupoApelido[] | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState("");
  const [erro, setErro] = useState("");

  const carregar = async () => {
    const r = await fetch("/api/apelidos");
    setGrupos(r.ok ? await r.json() : []);
  };
  useEffect(() => {
    let ativo = true;
    fetch("/api/apelidos").then((r) => (r.ok ? r.json() : [])).then((j) => { if (ativo) setGrupos(j); });
    return () => { ativo = false; };
  }, []);

  const renomear = async (nome: string) => {
    setErro("");
    const r = await fetch("/api/apelidos", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, novoNome: novoNome.trim() }),
    });
    if (!r.ok) { setErro((await r.json()).error ?? "Não foi possível renomear."); return; }
    setEditando(null);
    await carregar();
  };

  const remover = async (q: { chave: string } | { nome: string }, aviso: string) => {
    if (!confirm(aviso)) return;
    await fetch(`/api/apelidos?${new URLSearchParams(q)}`, { method: "DELETE" });
    await carregar();
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Mesmo pagamento</h1>
        <p className="text-sm text-slate-500 mt-1">
          Descrições diferentes que são o mesmo compromisso — a financeira que mudou de nome, a escola que
          aparece no boleto e no Pix. Juntas, viram uma linha só na Matriz e na Revisão, e a categoria de uma
          vale como sugestão para as outras. Para juntar, selecione os lançamentos em{" "}
          <Link href="/lancamentos" className="text-blue-600 hover:underline">Lançamentos</Link> e use “Mesmo pagamento…”.
        </p>
      </div>

      {erro && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</div>}

      {grupos === null ? (
        <div className="flex justify-center py-12"><div className="spinner" /></div>
      ) : grupos.length === 0 ? (
        <div className="card text-center text-slate-500 py-10">Nenhum pagamento agrupado ainda.</div>
      ) : (
        <ul className="space-y-3">
          {grupos.map((g) => (
            <li key={g.nome} className="card space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                {editando === g.nome ? (
                  <form className="flex gap-2 flex-1" onSubmit={(e) => { e.preventDefault(); void renomear(g.nome); }}>
                    <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} autoFocus className="flex-1" />
                    <button type="submit" className="btn btn-primary text-sm" disabled={novoNome.trim().length < 2}>Salvar</button>
                    <button type="button" className="btn btn-secondary text-sm" onClick={() => setEditando(null)}>Cancelar</button>
                  </form>
                ) : (
                  <>
                    <h2 className="font-semibold text-slate-800">🔗 {g.nome}</h2>
                    <div className="flex gap-3 text-sm">
                      <button className="text-blue-600 hover:underline" onClick={() => { setEditando(g.nome); setNovoNome(g.nome); }}>Renomear</button>
                      <button className="text-red-600 hover:underline"
                        onClick={() => remover({ nome: g.nome }, `Desfazer "${g.nome}"? As descrições voltam a aparecer separadas.`)}>
                        Desfazer
                      </button>
                    </div>
                  </>
                )}
              </div>
              <ul className="divide-y divide-slate-100 text-sm">
                {g.variacoes.map((v) => (
                  <li key={v.chave} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <div className="text-slate-700 break-words">{v.exemplo ?? v.chave}</div>
                      <div className="text-xs text-slate-400">{v.lancamentos} lançamento{v.lancamentos !== 1 ? "s" : ""}</div>
                    </div>
                    <button className="text-xs text-slate-500 hover:text-red-600 shrink-0"
                      onClick={() => remover({ chave: v.chave }, "Tirar esta descrição do grupo?")}>
                      Tirar
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
