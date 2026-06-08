"use client";
import { useEffect, useState, useCallback } from "react";
import { CATEGORIAS } from "@/lib/categorias";

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtData = (d: string) =>
  new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" });

interface Lancamento {
  id: number;
  data: string;
  descricao: string;
  categoria: string | null;
  valor: number;
  tipo: string;
  conta: string;
  status: string;
  mesReferencia: string | null;
}

const CONTAS = ["C6 Crédito", "C6 Débito", "Nubank Crédito", "Nubank Débito"];

export default function LancamentosPage() {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState<number | null>(null);
  const [categoriaEdit, setCategoriaEdit] = useState("");
  const [categorizando, setCategorizando] = useState(false);
  const limit = 50;

  const [filtros, setFiltros] = useState({
    busca: "",
    conta: "",
    categoria: "",
    tipo: "",
    dataInicio: "",
    dataFim: "",
  });

  const carregar = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filtros.busca) params.set("busca", filtros.busca);
    if (filtros.conta) params.set("conta", filtros.conta);
    if (filtros.categoria) params.set("categoria", filtros.categoria);
    if (filtros.tipo) params.set("tipo", filtros.tipo);
    if (filtros.dataInicio) params.set("dataInicio", filtros.dataInicio);
    if (filtros.dataFim) params.set("dataFim", filtros.dataFim);
    const res = await fetch(`/api/lancamentos?${params}`);
    const json = await res.json();
    setLancamentos(json.lancamentos);
    setTotal(json.total);
    setLoading(false);
  }, [page, filtros]);

  useEffect(() => { carregar(); }, [carregar]);

  const salvarCategoria = async (id: number) => {
    await fetch("/api/lancamentos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, categoria: categoriaEdit }),
    });
    setEditando(null);
    carregar();
  };

  const excluir = async (id: number) => {
    if (!confirm("Excluir este lançamento?")) return;
    await fetch(`/api/lancamentos?id=${id}`, { method: "DELETE" });
    carregar();
  };

  const categorizarSemCategoria = async () => {
    setCategorizando(true);
    await fetch("/api/categorizar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setCategorizando(false);
    carregar();
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4 max-w-full">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">
          Lançamentos <span className="text-base font-normal text-slate-400">({total})</span>
        </h1>
        <button
          className="btn btn-secondary"
          onClick={categorizarSemCategoria}
          disabled={categorizando}
        >
          {categorizando ? <span className="spinner" /> : "🤖"}
          Categorizar sem categoria
        </button>
      </div>

      {/* Filtros */}
      <div className="card">
        <div className="grid grid-cols-3 gap-3">
          <input
            placeholder="Buscar descrição…"
            value={filtros.busca}
            onChange={(e) => { setFiltros({ ...filtros, busca: e.target.value }); setPage(1); }}
          />
          <select value={filtros.conta} onChange={(e) => { setFiltros({ ...filtros, conta: e.target.value }); setPage(1); }}>
            <option value="">Todas as contas</option>
            {CONTAS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filtros.categoria} onChange={(e) => { setFiltros({ ...filtros, categoria: e.target.value }); setPage(1); }}>
            <option value="">Todas as categorias</option>
            <option value="">Sem categoria</option>
            {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filtros.tipo} onChange={(e) => { setFiltros({ ...filtros, tipo: e.target.value }); setPage(1); }}>
            <option value="">Entrada e Saída</option>
            <option value="Entrada">Entradas</option>
            <option value="Saída">Saídas</option>
          </select>
          <input type="date" value={filtros.dataInicio} onChange={(e) => { setFiltros({ ...filtros, dataInicio: e.target.value }); setPage(1); }} />
          <input type="date" value={filtros.dataFim} onChange={(e) => { setFiltros({ ...filtros, dataFim: e.target.value }); setPage(1); }} />
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><div className="spinner" /></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Descrição</th>
                    <th>Categoria</th>
                    <th className="text-right">Valor</th>
                    <th>Conta</th>
                    <th>Mês Ref.</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {lancamentos.map((l) => (
                    <tr key={l.id}>
                      <td className="whitespace-nowrap text-slate-500">{fmtData(l.data)}</td>
                      <td className="max-w-xs truncate" title={l.descricao}>{l.descricao}</td>
                      <td>
                        {editando === l.id ? (
                          <div className="flex gap-1">
                            <select
                              value={categoriaEdit}
                              onChange={(e) => setCategoriaEdit(e.target.value)}
                              className="text-xs py-0.5"
                              autoFocus
                            >
                              <option value="">Sem categoria</option>
                              {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <button className="btn btn-success text-xs py-0.5 px-2" onClick={() => salvarCategoria(l.id)}>✓</button>
                            <button className="btn btn-secondary text-xs py-0.5 px-2" onClick={() => setEditando(null)}>✕</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditando(l.id); setCategoriaEdit(l.categoria || ""); }}
                            className={`badge cursor-pointer hover:opacity-80 ${
                              l.categoria
                                ? "bg-blue-50 text-blue-700"
                                : "bg-amber-50 text-amber-600 border border-dashed border-amber-300"
                            }`}
                          >
                            {l.categoria || "Sem categoria"}
                          </button>
                        )}
                      </td>
                      <td className={`text-right font-medium ${l.valor >= 0 ? "valor-positivo" : "valor-negativo"}`}>
                        {fmt(l.valor)}
                      </td>
                      <td>
                        <span className="badge bg-slate-100 text-slate-600">{l.conta}</span>
                      </td>
                      <td className="text-slate-400 text-xs">
                        {l.mesReferencia ? fmtData(l.mesReferencia) : "-"}
                      </td>
                      <td>
                        <button onClick={() => excluir(l.id)} className="text-slate-300 hover:text-red-500 text-lg leading-none">×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                <span className="text-sm text-slate-500">
                  Página {page} de {totalPages} ({total} registros)
                </span>
                <div className="flex gap-1">
                  <button className="btn btn-secondary text-xs" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Anterior</button>
                  <button className="btn btn-secondary text-xs" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Próxima →</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
