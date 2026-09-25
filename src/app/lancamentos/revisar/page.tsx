"use client";
// Revisar categorias em grupo: lançamentos sem categoria (ou no "coringa"
// Transferência para Terceiros) agrupados pela descrição. Categorizar um grupo
// atualiza todos os lançamentos dele e, se marcado, ensina a Memória Local
// para as próximas importações.
import { useEffect, useState } from "react";
import Link from "next/link";
import CategoriaSelect from "@/components/CategoriaSelect";
import type { GrupoDescricao } from "@/app/api/lancamentos/agrupados/route";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (iso: string) => { const [a, m, d] = iso.split("-"); return `${d}/${m}/${a}`; };

const ABAS = [
  { id: "__sem__", rotulo: "Sem categoria" },
  { id: "Transferência para Terceiros", rotulo: "Transferência para Terceiros" },
] as const;

type AbaId = (typeof ABAS)[number]["id"];

export default function RevisarPage() {
  const [aba, setAba] = useState<AbaId>("__sem__");
  const [dados, setDados] = useState<{ aba: AbaId; totalLancamentos: number; grupos: GrupoDescricao[] } | null>(null);
  const [aviso, setAviso] = useState("");
  const carregando = dados?.aba !== aba;

  useEffect(() => {
    let ativo = true;
    fetch(`/api/lancamentos/agrupados?categoria=${encodeURIComponent(aba)}`)
      .then((r) => (r.ok ? r.json() : { totalLancamentos: 0, grupos: [] }))
      .then((json) => { if (ativo) setDados({ aba, ...json }); });
    return () => { ativo = false; };
  }, [aba]);

  const aplicado = (g: GrupoDescricao, categoria: string, lembrar: boolean) => {
    setDados((prev) => prev && {
      ...prev,
      totalLancamentos: prev.totalLancamentos - g.quantidade,
      grupos: prev.grupos.filter((x) => x.descricao !== g.descricao),
    });
    setAviso(`✅ ${g.quantidade} lançamento${g.quantidade !== 1 ? "s" : ""} → ${categoria}${lembrar ? " · lembrado para as próximas importações" : ""}`);
  };

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Revisar categorias</h1>
          <p className="text-sm text-slate-500 mt-1">
            Lançamentos iguais agrupados: escolha a categoria uma vez para o grupo inteiro.
          </p>
        </div>
        <Link href="/lancamentos" className="btn btn-secondary">← Lançamentos</Link>
      </div>

      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {ABAS.map((a) => (
          <button
            key={a.id}
            onClick={() => { setAba(a.id); setAviso(""); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
              aba === a.id ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {a.rotulo}
            {dados?.aba === a.id && <span className="ml-1.5 text-xs text-slate-400">({dados.totalLancamentos})</span>}
          </button>
        ))}
      </div>

      {aba === "Transferência para Terceiros" && (
        <p className="text-sm text-slate-500">
          Pix para pessoas e empresas caem aqui por padrão. Se um destinatário é sempre o mesmo tipo de gasto
          (diarista, aluguel, contador…), dê a categoria certa ao grupo.
        </p>
      )}

      {aviso && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{aviso}</div>}

      {carregando ? (
        <div className="flex justify-center py-16"><div className="spinner" /></div>
      ) : dados!.grupos.length === 0 ? (
        <div className="card text-center text-slate-500 py-12">🎉 Nada para revisar aqui.</div>
      ) : (
        <ul className="card p-0 divide-y divide-slate-100 overflow-hidden">
          {dados!.grupos.map((g) => (
            <Grupo key={g.descricao} grupo={g} categoriaAtual={aba} onAplicado={aplicado} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Grupo({ grupo, categoriaAtual, onAplicado }: {
  grupo: GrupoDescricao;
  categoriaAtual: AbaId;
  onAplicado: (g: GrupoDescricao, categoria: string, lembrar: boolean) => void;
}) {
  const [categoria, setCategoria] = useState("");
  const [lembrar, setLembrar] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const aplicar = async () => {
    if (!categoria) return;
    setSalvando(true);
    setErro("");
    const r = await fetch("/api/lancamentos", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        descricaoExata: grupo.descricao,
        categoriaCorreta: categoria,
        ...(categoriaAtual === "__sem__" ? { somenteSemCategoria: true } : { categoriaErrada: categoriaAtual }),
      }),
    });
    if (r.ok && lembrar) {
      await fetch("/api/memoria-ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descricao: grupo.descricao, categoriaCorreta: categoria }),
      });
    }
    setSalvando(false);
    if (!r.ok) { setErro("Não foi possível aplicar."); return; }
    onAplicado(grupo, categoria, lembrar);
  };

  return (
    <li className="px-4 sm:px-6 py-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-800 break-words">{grupo.descricao}</div>
          <div className="text-xs text-slate-400 mt-0.5">
            {grupo.quantidade}× · último em {fmtData(grupo.ultimaData)} · {grupo.contas.join(", ")}
          </div>
        </div>
        <div className={`text-sm font-semibold whitespace-nowrap ${grupo.total >= 0 ? "valor-positivo" : "valor-negativo"}`}>
          {fmt(grupo.total)}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <CategoriaSelect value={categoria} onChange={setCategoria} className="text-sm flex-1 min-w-48" />
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          <input type="checkbox" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} />
          Lembrar nas próximas importações
        </label>
        <button onClick={aplicar} disabled={!categoria || salvando} className="btn btn-primary text-sm">
          {salvando ? "Aplicando…" : `Aplicar a ${grupo.quantidade}`}
        </button>
      </div>
      {erro && <div className="text-xs text-red-600">{erro}</div>}
    </li>
  );
}
