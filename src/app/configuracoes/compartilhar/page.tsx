"use client";
// Compartilhar as próprias finanças (ver ou ajudar) e abrir as compartilhadas com você.
import { useCallback, useEffect, useState } from "react";
import { abrirFinancas } from "@/components/Espaco";

type PapelAcesso = "ver" | "ajudar";
interface Meu { id: number; email: string; papel: PapelAcesso; podeEntrar: boolean }
interface Comigo { dono: string; nome: string; papel: PapelAcesso }

const PAPEIS: { v: PapelAcesso; rotulo: string; ajuda: string }[] = [
  { v: "ajudar", rotulo: "Ajudar", ajuda: "vê tudo, importa extratos, categoriza e planeja" },
  { v: "ver", rotulo: "Ver", ajuda: "acompanha tudo, sem alterar nada" },
];

export default function CompartilharPage() {
  const [meus, setMeus] = useState<Meu[] | null>(null);
  const [comigo, setComigo] = useState<Comigo[]>([]);
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<PapelAcesso>("ajudar");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    const r = await fetch("/api/acessos");
    if (!r.ok) return;
    const j = await r.json();
    setMeus(j.meus);
    setComigo(j.comigo);
  }, []);

  useEffect(() => {
    let ativo = true;
    fetch("/api/acessos").then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (ativo && j) { setMeus(j.meus); setComigo(j.comigo); }
    });
    return () => { ativo = false; };
  }, []);

  const convidar = async () => {
    setErro(""); setEnviando(true);
    try {
      const r = await fetch("/api/acessos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, papel }) });
      if (!r.ok) { setErro((await r.json().catch(() => null))?.error ?? "Não foi possível dar o acesso."); return; }
      setEmail("");
      await carregar();
    } finally { setEnviando(false); }
  };

  const mudar = async (id: number, novo: PapelAcesso) => {
    await fetch("/api/acessos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, papel: novo }) });
    await carregar();
  };
  const retirar = async (a: Meu) => {
    if (!confirm(`Tirar o acesso de ${a.email} às suas finanças?`)) return;
    await fetch(`/api/acessos?id=${a.id}`, { method: "DELETE" });
    await carregar();
  };
  const sair = async (c: Comigo) => {
    if (!confirm(`Deixar de acompanhar as finanças de ${c.nome}? Só ${c.nome} pode dar o acesso de novo.`)) return;
    await fetch(`/api/acessos?dono=${encodeURIComponent(c.dono)}`, { method: "DELETE" });
    await carregar();
  };

  if (!meus) return <div className="flex justify-center py-20"><div className="spinner" /></div>;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Compartilhar</h1>
        <p className="text-sm text-slate-500 mt-1">
          Deixe alguém da família acompanhar ou ajudar nas suas finanças. A pessoa entra com o Google dela e escolhe, no menu,
          de quem são as finanças abertas. Você pode tirar o acesso a qualquer momento.
        </p>
      </div>

      <section className="card space-y-4">
        <h2 className="font-semibold text-slate-700">Quem tem acesso às suas finanças</h2>
        {meus.length === 0 ? (
          <p className="text-sm text-slate-400">Ninguém além de você.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {meus.map((a) => (
              <li key={a.id} className="py-2 flex items-center justify-between gap-3 flex-wrap" data-acesso={a.email}>
                <div className="min-w-0">
                  <div className="text-sm text-slate-800 break-all">{a.email}</div>
                  {!a.podeEntrar && <div className="text-xs text-amber-700">Esse e-mail ainda não está liberado para entrar no app.</div>}
                </div>
                <div className="flex items-center gap-2">
                  <select aria-label={`Acesso de ${a.email}`} value={a.papel} onChange={(e) => void mudar(a.id, e.target.value as PapelAcesso)} className="text-sm">
                    {PAPEIS.map((p) => <option key={p.v} value={p.v}>{p.rotulo}</option>)}
                  </select>
                  <button className="text-xs text-red-500 hover:text-red-700" onClick={() => void retirar(a)}>Tirar acesso</button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-slate-100 pt-4 space-y-2">
          <div className="flex gap-2 flex-wrap">
            <input type="email" placeholder="e-mail do Google da pessoa" value={email} onChange={(e) => setEmail(e.target.value)}
              aria-label="E-mail da pessoa" className="flex-1 min-w-52" />
            <select aria-label="Acesso" value={papel} onChange={(e) => setPapel(e.target.value as PapelAcesso)}>
              {PAPEIS.map((p) => <option key={p.v} value={p.v}>{p.rotulo}</option>)}
            </select>
            <button className="btn btn-primary" disabled={enviando || !email.trim()} onClick={() => void convidar()}>Dar acesso</button>
          </div>
          <p className="text-xs text-slate-400">{PAPEIS.find((p) => p.v === papel)?.rotulo}: {PAPEIS.find((p) => p.v === papel)?.ajuda}.</p>
          {erro && <p className="text-sm text-red-600" role="alert">{erro}</p>}
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold text-slate-700">Compartilhadas com você</h2>
        {comigo.length === 0 ? (
          <p className="text-sm text-slate-400">Ninguém compartilhou finanças com você ainda.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {comigo.map((c) => (
              <li key={c.dono} className="py-2 flex items-center justify-between gap-3 flex-wrap" data-comigo={c.dono}>
                <div className="text-sm text-slate-800">
                  Finanças de <strong>{c.nome}</strong> <span className="text-xs text-slate-400">· {c.papel === "ajudar" ? "pode ajudar" : "só ver"}</span>
                </div>
                <div className="flex items-center gap-3">
                  <button className="btn btn-secondary text-sm" onClick={() => void abrirFinancas(c.dono)}>Abrir</button>
                  <button className="text-xs text-slate-400 hover:text-red-600" onClick={() => void sair(c)}>Sair</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
