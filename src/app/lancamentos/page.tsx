"use client";
import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { CATEGORIAS_SAIDA, CATEGORIAS_ENTRADA, CATEGORIAS_EMPRESTIMO } from "@/lib/categorias";
import CategoriaSelect from "@/components/CategoriaSelect";

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
  pessoa: string | null;
}

const CONTAS = ["C6 Crédito", "C6 Débito", "Nubank Crédito", "Nubank Débito"];
const TODAS_CATEGORIAS = [...CATEGORIAS_SAIDA, ...CATEGORIAS_ENTRADA].sort((a, b) =>
  a.localeCompare(b, "pt-BR")
);

function isEmprestimo(categoria: string | null) {
  return CATEGORIAS_EMPRESTIMO.includes(categoria as never);
}

export default function LancamentosPage() {
  const searchParams = useSearchParams();

  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState<number | null>(null);
  const [categoriaEdit, setCategoriaEdit] = useState("");
  const [pessoaEdit, setPessoaEdit] = useState("");
  const [categorizando, setCategorizando] = useState(false);
  const [salvandoMemoria, setSalvandoMemoria] = useState<number | null>(null);
  const [toastMsg, setToastMsg] = useState("");
  const limit = 50;

  const [filtros, setFiltros] = useState({
    busca: "",
    conta: "",
    categoria: "",
    tipo: "",
    dataInicio: "",
    dataFim: "",
    pessoa: searchParams.get("pessoa") || "",
  });

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 2500);
  };

  const carregar = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filtros.busca) params.set("busca", filtros.busca);
    if (filtros.conta) params.set("conta", filtros.conta);
    if (filtros.categoria) params.set("categoria", filtros.categoria);
    if (filtros.tipo) params.set("tipo", filtros.tipo);
    if (filtros.pessoa) params.set("pessoa", filtros.pessoa);
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
      body: JSON.stringify({
        id,
        categoria: categoriaEdit || null,
        pessoa: isEmprestimo(categoriaEdit) ? (pessoaEdit || null) : null,
      }),
    });
    setEditando(null);
    carregar();
  };

  const excluir = async (id: number) => {
    if (!confirm("Excluir este lançamento?")) return;
    await fetch(`/api/lancamentos?id=${id}`, { method: "DELETE" });
    carregar();
  };

  const salvarNaMemoria = async (l: Lancamento) => {
    if (!l.categoria) {
      showToast("⚠️ Defina uma categoria antes de salvar na Memória da IA.");
      return;
    }
    setSalvandoMemoria(l.id);
    const res = await fetch("/api/memoria-ia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ descricao: l.descricao, categoriaCorreta: l.categoria }),
    });
    setSalvandoMemoria(null);
    if (res.ok) showToast(`🧠 "${l.descricao.slice(0, 40)}…" salvo na Memória da IA!`);
  };

  const categorizarSemCategoria = async (usarGemini = false) => {
    setCategorizando(true);
    const res = await fetch("/api/categorizar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usarGemini }),
    });
    const json = await res.json();
    setCategorizando(false);
    carregar();
    const partes: string[] = [];
    if (json.porMemoria > 0) partes.push(`🧠 ${json.porMemoria} pela Memória da IA`);
    if (json.porRegras > 0)  partes.push(`📏 ${json.porRegras} pelas regras`);
    if (json.porGemini > 0)  partes.push(`🤖 ${json.porGemini} pelo Gemini`);
    if (json.semCategoria > 0) partes.push(`⚠️ ${json.semCategoria} sem categoria`);
    showToast(partes.length ? partes.join(" · ") : "Nenhuma transação sem categoria encontrada.");
  };

  const totalPages = Math.ceil(total / limit);
  const filtrandoPessoa = !!filtros.pessoa;

  return (
    <div className="space-y-4 max-w-full">
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg">
          {toastMsg}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-800">
            Lançamentos <span className="text-base font-normal text-slate-400">({total})</span>
          </h1>
          {filtrandoPessoa && (
            <span className="badge bg-purple-100 text-purple-700 text-sm">
              🤝 {filtros.pessoa}
              <button
                className="ml-1.5 hover:text-purple-900"
                onClick={() => setFiltros({ ...filtros, pessoa: "" })}
              >×</button>
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            className="btn btn-secondary"
            onClick={() => categorizarSemCategoria(false)}
            disabled={categorizando}
            title="Aplica Memória da IA + regras manuais (rápido, sem API)"
          >
            {categorizando ? <span className="spinner" /> : "🧠"}
            Categorizar (Memória + Regras)
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => categorizarSemCategoria(true)}
            disabled={categorizando}
            title="Usa Memória da IA, regras e Gemini para os que restarem (lento)"
          >
            {categorizando ? <span className="spinner" /> : "🤖"}
            + Gemini
          </button>
        </div>
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
            <option value="__sem__">⚠️ Sem categoria</option>
            {TODAS_CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
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
                    <tr key={l.id} className={isEmprestimo(l.categoria) ? "bg-purple-50/40" : ""}>
                      <td className="whitespace-nowrap text-slate-500">{fmtData(l.data)}</td>
                      <td className="max-w-xs">
                        <div className="truncate" title={l.descricao}>{l.descricao}</div>
                        {l.pessoa && (
                          <div className="text-xs text-purple-600 mt-0.5">🤝 {l.pessoa}</div>
                        )}
                      </td>
                      <td>
                        {editando === l.id ? (
                          <div className="flex flex-col gap-1.5">
                            <div className="flex gap-1 items-center">
                              <CategoriaSelect
                                value={categoriaEdit}
                                onChange={(v) => { setCategoriaEdit(v); if (!isEmprestimo(v)) setPessoaEdit(""); }}
                                placeholder="Sem categoria"
                                className="text-xs py-0.5"
                                autoFocus
                              />
                              <button className="btn btn-success text-xs py-0.5 px-2" onClick={() => salvarCategoria(l.id)}>✓</button>
                              <button className="btn btn-secondary text-xs py-0.5 px-2" onClick={() => setEditando(null)}>✕</button>
                            </div>
                            {isEmprestimo(categoriaEdit) && (
                              <input
                                className="text-xs py-0.5 w-full"
                                placeholder="Nome da pessoa…"
                                value={pessoaEdit}
                                onChange={(e) => setPessoaEdit(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && salvarCategoria(l.id)}
                              />
                            )}
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setEditando(l.id);
                              setCategoriaEdit(l.categoria || "");
                              setPessoaEdit(l.pessoa || "");
                            }}
                            className={`badge cursor-pointer hover:opacity-80 ${
                              isEmprestimo(l.categoria)
                                ? "bg-purple-50 text-purple-700"
                                : l.categoria
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
                        <div className="flex items-center gap-1">
                          <button
                            title="Salvar regra na Memória da IA"
                            onClick={() => salvarNaMemoria(l)}
                            disabled={salvandoMemoria === l.id}
                            className="text-slate-300 hover:text-purple-500 text-base leading-none transition-colors disabled:opacity-50"
                          >
                            {salvandoMemoria === l.id ? <span className="spinner" style={{ width: 14, height: 14 }} /> : "🧠"}
                          </button>
                          <button
                            title="Excluir lançamento"
                            onClick={() => excluir(l.id)}
                            className="text-slate-300 hover:text-red-500 text-lg leading-none transition-colors"
                          >×</button>
                        </div>
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
