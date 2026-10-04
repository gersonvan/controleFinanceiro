"use client";
// Configurações → Contas: as contas do usuário agrupadas por banco. Cada conta é
// banco + Débito/Crédito (+ apelido); os extratos e faturas caem nela pela
// importação (lib/bancos.ts, lib/contas.ts). Renomear o apelido leva junto os lançamentos.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BANCOS, bancoPorId, interpretarNomeAntigo, rotuloTipo } from "@/lib/bancos";
import SeletorConta from "./SeletorConta";

interface Conta { id: number; nome: string; banco: string; apelido: string; tipo: "corrente" | "cartao"; lancamentos: number }
interface Perfil { formato: string; banco: string | null; tipoConta: string | null; ativo: boolean }

const ORDEM_BANCO = new Map(BANCOS.map((b, i) => [b.id, i]));

export default function ContasPorBanco() {
  const [contas, setContas] = useState<Conta[] | null>(null);
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [editando, setEditando] = useState<{ id: number; apelido: string } | null>(null);
  const [nova, setNova] = useState("");
  const [chaveNova, setChaveNova] = useState(0); // remonta o seletor depois de criar

  const carregar = useCallback(async () => {
    const [rc, rp] = await Promise.all([fetch("/api/contas"), fetch("/api/perfis?todos=true")]);
    if (!rc.ok) { setErro("Não foi possível carregar as contas."); return; }
    setContas(await rc.json());
    if (rp.ok) setPerfis(await rp.json());
  }, []);
  useEffect(() => {
    let ativo = true;
    Promise.all([fetch("/api/contas"), fetch("/api/perfis?todos=true")])
      .then(async ([rc, rp]) => {
        if (!ativo) return;
        if (!rc.ok) { setErro("Não foi possível carregar as contas."); return; }
        setContas(await rc.json());
        if (rp.ok) setPerfis(await rp.json());
      })
      .catch(() => { if (ativo) setErro("Não foi possível carregar as contas."); });
    return () => { ativo = false; };
  }, []);

  const resposta = async (r: Response, ok: string) => {
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErro(j.error ?? "Não foi possível salvar."); return false; }
    setErro(""); setAviso(ok); await carregar(); return true;
  };

  const salvar = (id: number, campos: { apelido?: string; tipo?: string }) =>
    fetch("/api/contas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...campos }) })
      .then((r) => resposta(r, "Conta atualizada — os lançamentos foram junto."));

  const excluir = async (c: Conta) => {
    if (!confirm(`Excluir a conta "${c.nome}"?`)) return;
    await resposta(await fetch(`/api/contas?id=${c.id}`, { method: "DELETE" }), "Conta excluída.");
  };

  const criar = async () => {
    const { banco, tipo, apelido } = interpretarNomeAntigo(nova);
    const ok = await resposta(
      await fetch("/api/contas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ banco, tipo, apelido }) }),
      `Conta "${nova}" criada.`,
    );
    if (ok) { setNova(""); setChaveNova((k) => k + 1); }
  };

  const formatos = (c: Conta) => [...new Set(perfis
    .filter((p) => p.ativo && p.banco === c.banco && (p.tipoConta ?? "corrente") === c.tipo)
    .map((p) => p.formato.toUpperCase()))].sort();

  const porBanco = new Map<string, Conta[]>();
  for (const c of contas ?? []) porBanco.set(c.banco, [...(porBanco.get(c.banco) ?? []), c]);
  const bancos = [...porBanco.keys()].sort((a, b) => (ORDEM_BANCO.get(a) ?? 99) - (ORDEM_BANCO.get(b) ?? 99));

  return (
    <div className="space-y-4">
      {erro && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}
      {aviso && !erro && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{aviso}</p>}

      {!contas ? (!erro && <div className="text-slate-400 text-sm">Carregando…</div>) : bancos.length === 0 ? (
        <div className="card text-sm text-slate-500">As contas aparecem aqui depois da primeira importação — ou crie uma abaixo.</div>
      ) : bancos.map((b) => (
        <div key={b} className="card space-y-1" data-banco={b}>
          <h2 className="font-semibold text-slate-800">{bancoPorId(b).nomeCompleto}</h2>
          <div className="divide-y divide-slate-100">
            {porBanco.get(b)!.sort((x, y) => (x.tipo === y.tipo ? 0 : x.tipo === "corrente" ? -1 : 1) || x.apelido.localeCompare(y.apelido, "pt-BR")).map((c) => {
              const fs = formatos(c);
              return (
                <div key={c.id} className="py-2.5 flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800">
                      {b === "outro" ? c.apelido : rotuloTipo(c.tipo)}
                      {b !== "outro" && c.apelido && <span className="text-slate-500 font-normal"> · {c.apelido}</span>}
                    </div>
                    <div className="text-xs text-slate-400">
                      {c.lancamentos.toLocaleString("pt-BR")} lançamento{c.lancamentos !== 1 ? "s" : ""}
                      {b !== "outro" && (fs.length ? ` · importa ${fs.join(", ")}` : " · nenhum formato ativo")}
                    </div>
                    {editando?.id === c.id && (
                      <form className="flex gap-2 mt-2" onSubmit={async (e) => { e.preventDefault(); if (await salvar(c.id, { apelido: editando.apelido })) setEditando(null); }}>
                        <input aria-label="Apelido" value={editando.apelido} maxLength={40} autoFocus
                          onChange={(e) => setEditando({ id: c.id, apelido: e.target.value })}
                          placeholder={b === "outro" ? "Nome (ex.: Carteira)" : "Apelido (vazio = sem apelido)"} className="text-sm" />
                        <button type="submit" className="btn btn-primary text-xs">Salvar</button>
                        <button type="button" className="btn btn-secondary text-xs" onClick={() => setEditando(null)}>Cancelar</button>
                      </form>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {b !== "outro" && (
                      <div role="group" aria-label={`Tipo da conta ${c.nome}`} className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 gap-0.5">
                        {(["corrente", "cartao"] as const).map((t) => (
                          <button key={t} type="button" aria-pressed={c.tipo === t} onClick={() => c.tipo !== t && salvar(c.id, { tipo: t })}
                            className={`rounded-md px-2.5 py-1 text-xs font-medium ${c.tipo === t ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-200"}`}>
                            {rotuloTipo(t)}
                          </button>
                        ))}
                      </div>
                    )}
                    <button className="text-xs text-blue-600 hover:underline" onClick={() => setEditando({ id: c.id, apelido: c.apelido })}>
                      {b === "outro" ? "Renomear" : "Apelido"}
                    </button>
                    {c.lancamentos === 0 && (
                      <button className="text-xs text-red-600 hover:underline" onClick={() => excluir(c)}>Excluir</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="card space-y-3">
        <h2 className="font-semibold text-slate-800">Nova conta</h2>
        <p className="text-xs text-slate-500">
          Normalmente não precisa: a importação cria a conta do banco sozinha. Use para uma segunda conta do mesmo banco
          (com apelido) ou para algo sem banco, como carteira ou vale-refeição. Os formatos de cada banco ficam em{" "}
          <Link href="/configuracoes/importacao" className="text-blue-600 hover:underline">Importação</Link>.
        </p>
        <SeletorConta key={chaveNova} onChange={setNova} />
        <button className="btn btn-primary" disabled={!nova} onClick={criar}>Criar conta</button>
      </div>
    </div>
  );
}
