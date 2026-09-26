"use client";
import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CATEGORIAS_EMPRESTIMO } from "@/lib/categorias";
import CategoriaSelect from "@/components/CategoriaSelect";
import type { ResumoFiltro } from "@/app/api/resumo/route";
import Link from "next/link";
import LancamentoForm from "@/components/LancamentoForm";
import OpcoesCategorias from "@/components/OpcoesCategorias";

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (d: string) =>
  new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" });
const fmtMes = (d: string) => {
  const dt = new Date(d);
  return `${String(dt.getUTCMonth() + 1).padStart(2, "0")}/${dt.getUTCFullYear()}`;
};
const toISO = (d: Date) => d.toISOString().slice(0, 10);

function mesAtual()    { const h = new Date(); return { i: toISO(new Date(h.getFullYear(), h.getMonth(), 1)),     f: toISO(new Date(h.getFullYear(), h.getMonth() + 1, 0)) }; }
function mesAnterior() { const h = new Date(); return { i: toISO(new Date(h.getFullYear(), h.getMonth() - 1, 1)), f: toISO(new Date(h.getFullYear(), h.getMonth(), 0)) }; }
function ultimos3()    { const h = new Date(); return { i: toISO(new Date(h.getFullYear(), h.getMonth() - 2, 1)), f: toISO(new Date(h.getFullYear(), h.getMonth() + 1, 0)) }; }
function esteAno()     { const h = new Date(); return { i: toISO(new Date(h.getFullYear(), 0, 1)),                f: toISO(new Date(h.getFullYear(), 11, 31)) }; }

const PRESETS = [
  { label: "Este mês",     fn: mesAtual },
  { label: "Mês anterior", fn: mesAnterior },
  { label: "Últimos 3m",   fn: ultimos3 },
  { label: "Este ano",     fn: esteAno },
];

interface Lancamento {
  id: number; data: string; descricao: string; categoria: string | null;
  valor: number; tipo: string; conta: string; status: string;
  mesReferencia: string | null; pessoa: string | null;
}

const CONTAS = ["C6 Crédito", "C6 Débito", "Nubank Crédito", "Nubank Débito"];

function isEmprestimo(cat: string | null) {
  return CATEGORIAS_EMPRESTIMO.includes(cat as never);
}

export default function LancamentosPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><div className="spinner" /></div>}>
      <LancamentosContent />
    </Suspense>
  );
}

function LancamentosContent() {
  const searchParams = useSearchParams();
  const initMes = mesAtual();

  const [lancamentos, setLancamentos]         = useState<Lancamento[]>([]);
  const [novoAberto, setNovoAberto]           = useState(() => searchParams.get("novo") === "1");
  const [total, setTotal]                     = useState(0);
  const [page, setPage]                       = useState(1);
  const [loading, setLoading]                 = useState(true);
  const [resumo, setResumo]                   = useState<ResumoFiltro | null>(null);
  const [editando, setEditando]               = useState<number | null>(null);
  const [categoriaEdit, setCategoriaEdit]     = useState("");
  const [pessoaEdit, setPessoaEdit]           = useState("");
  const [categorizando, setCategorizando]     = useState(false);
  const [salvandoMemoria, setSalvandoMemoria] = useState<number | null>(null);
  const [toastMsg, setToastMsg]               = useState("");
  const [limit, setLimit]                     = useState(50);

  // Seleção em massa
  const [selecionados, setSelecionados]   = useState<Set<number>>(new Set());
  const [categoriaMassa, setCategoriaMassa] = useState("");
  const [aplicandoMassa, setAplicandoMassa] = useState(false);

  const [filtros, setFiltros] = useState({
    busca: "", conta: "", categoria: "", tipo: "",
    dataInicio: initMes.i, dataFim: initMes.f,
    pessoa: searchParams.get("pessoa") || "",
  });

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 2800);
  };

  const buildParams = useCallback((extra?: Record<string, string>) => {
    const p = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filtros.busca)      p.set("busca",      filtros.busca);
    if (filtros.conta)      p.set("conta",      filtros.conta);
    if (filtros.categoria)  p.set("categoria",  filtros.categoria);
    if (filtros.tipo)       p.set("tipo",       filtros.tipo);
    if (filtros.pessoa)     p.set("pessoa",     filtros.pessoa);
    if (filtros.dataInicio) p.set("dataInicio", filtros.dataInicio);
    if (filtros.dataFim)    p.set("dataFim",    filtros.dataFim);
    if (extra) Object.entries(extra).forEach(([k, v]) => p.set(k, v));
    return p;
  }, [page, limit, filtros]);

  const carregar = useCallback(async () => {
    setLoading(true);
    const [resL, resR] = await Promise.all([
      fetch(`/api/lancamentos?${buildParams()}`),
      fetch(`/api/resumo?${buildParams({ page: "1", limit: "9999" })}`),
    ]);
    const [jsonL, jsonR] = await Promise.all([resL.json(), resR.json()]);
    setLancamentos(jsonL.lancamentos);
    setTotal(jsonL.total);
    setResumo(jsonR);
    setLoading(false);
  }, [buildParams]);

  useEffect(() => {
    let ativo = true;
    async function carregarInicial() {
      const [resL, resR] = await Promise.all([
        fetch(`/api/lancamentos?${buildParams()}`),
        fetch(`/api/resumo?${buildParams({ page: "1", limit: "9999" })}`),
      ]);
      const [jsonL, jsonR] = await Promise.all([resL.json(), resR.json()]);
      if (ativo) {
        setLancamentos(jsonL.lancamentos);
        setTotal(jsonL.total);
        setResumo(jsonR);
        setLoading(false);
      }
    }
    void carregarInicial();
    return () => { ativo = false; };
  }, [buildParams]);

  const aplicarPreset = (fn: () => { i: string; f: string }) => {
    const { i, f } = fn();
    setFiltros((prev) => ({ ...prev, dataInicio: i, dataFim: f }));
    setPage(1);
    setSelecionados(new Set());
    setLoading(true);
  };

  const setFiltro = (key: string, value: string) => {
    setFiltros((prev) => ({ ...prev, [key]: value }));
    setPage(1);
    setSelecionados(new Set());
    setLoading(true);
  };

  const limparPeriodo = () => {
    setFiltros((prev) => ({ ...prev, dataInicio: "", dataFim: "" }));
    setPage(1);
    setSelecionados(new Set());
    setLoading(true);
  };

  const alterarLimite = (novoLimite: number) => {
    setLimit(novoLimite);
    setPage(1);
    setSelecionados(new Set());
    setLoading(true);
  };

  const mudarPagina = (novaPagina: number) => {
    setPage(novaPagina);
    setSelecionados(new Set());
    setLoading(true);
  };

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
    if (!l.categoria) { showToast("⚠️ Defina uma categoria antes de salvar na Memória Local."); return; }
    setSalvandoMemoria(l.id);
    const res = await fetch("/api/memoria-ia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ descricao: l.descricao, categoriaCorreta: l.categoria }),
    });
    setSalvandoMemoria(null);
    if (res.ok) showToast(`🧠 "${l.descricao.slice(0, 40)}…" salvo na Memória Local!`);
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
    if (json.porMemoria > 0)   partes.push(`🧠 ${json.porMemoria} pela Memória`);
    if (json.porHistorico > 0) partes.push(`🔁 ${json.porHistorico} pelo seu histórico`);
    if (json.porRegras > 0)    partes.push(`📏 ${json.porRegras} pelas regras`);
    if (json.porGemini > 0)    partes.push(`🤖 ${json.porGemini} pelo Gemini`);
    if (json.semCategoria > 0) partes.push(`⚠️ ${json.semCategoria} sem categoria`);
    showToast(partes.length ? partes.join(" · ") : "Nenhuma transação sem categoria.");
  };

  // ── Seleção em massa ──────────────────────────────────────────────────────
  const toggleSelecionado = (id: number) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const todosSelecionados =
    lancamentos.length > 0 && lancamentos.every((l) => selecionados.has(l.id));

  const toggleTodos = () => {
    if (todosSelecionados) {
      setSelecionados((prev) => {
        const next = new Set(prev);
        lancamentos.forEach((l) => next.delete(l.id));
        return next;
      });
    } else {
      setSelecionados((prev) => {
        const next = new Set(prev);
        lancamentos.forEach((l) => next.add(l.id));
        return next;
      });
    }
  };

  const aplicarEmMassa = async () => {
    if (!categoriaMassa) { showToast("⚠️ Selecione a nova categoria."); return; }
    setAplicandoMassa(true);
    const res = await fetch("/api/lancamentos", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selecionados], categoriaCorreta: categoriaMassa }),
    });
    const json = await res.json();
    setAplicandoMassa(false);
    setSelecionados(new Set());
    setCategoriaMassa("");
    carregar();
    showToast(`✅ ${json.corrigidos} lançamento${json.corrigidos !== 1 ? "s" : ""} atualizado${json.corrigidos !== 1 ? "s" : ""}.`);
  };

  // Badge de categoria clicável / editor inline — usado na tabela e na lista do celular.
  const categoriaCelula = (l: Lancamento) => (
    <>
      {editando === l.id ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-1 items-center">
            <CategoriaSelect value={categoriaEdit}
              onChange={(v) => { setCategoriaEdit(v); if (!isEmprestimo(v)) setPessoaEdit(""); }}
              placeholder="Sem categoria" className="text-xs py-0.5" autoFocus />
            <button className="btn btn-success text-xs py-0.5 px-2" onClick={() => salvarCategoria(l.id)}>✓</button>
            <button className="btn btn-secondary text-xs py-0.5 px-2" onClick={() => setEditando(null)}>✕</button>
          </div>
          {isEmprestimo(categoriaEdit) && (
            <input className="text-xs py-0.5 w-full" placeholder="Nome da pessoa…"
              value={pessoaEdit} onChange={(e) => setPessoaEdit(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && salvarCategoria(l.id)} />
          )}
        </div>
      ) : (
        <button
          onClick={() => { setEditando(l.id); setCategoriaEdit(l.categoria || ""); setPessoaEdit(l.pessoa || ""); }}
          className={`badge cursor-pointer hover:opacity-80 ${
            isEmprestimo(l.categoria) ? "bg-purple-50 text-purple-700"
            : l.categoria ? "bg-blue-50 text-blue-700"
            : "bg-amber-50 text-amber-600 border border-dashed border-amber-300"
          }`}>
          {l.categoria || "Sem categoria"}
        </button>
      )}
    </>
  );

  const totalPages     = Math.ceil(total / limit);
  const filtrandoPessoa = !!filtros.pessoa;
  const numSelecionados = selecionados.size;

  return (
    <div className="space-y-4 max-w-full">
      {toastMsg && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg max-w-lg text-center">
          {toastMsg}
        </div>
      )}

      <LancamentoForm
        aberto={novoAberto}
        onFechar={() => setNovoAberto(false)}
        onSalvo={() => { carregar(); showToast("✅ Lançamento salvo."); }}
      />

      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-800">
            Lançamentos <span className="text-base font-normal text-slate-400">({total})</span>
          </h1>
          {filtrandoPessoa && (
            <span className="badge bg-purple-100 text-purple-700 text-sm">
              🤝 {filtros.pessoa}
              <button className="ml-1.5 hover:text-purple-900" onClick={() => setFiltro("pessoa", "")}>×</button>
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={() => setNovoAberto(true)}>+ Novo</button>
          <Link href="/lancamentos/revisar" className="btn btn-secondary" title="Categorizar em grupo os sem categoria e os Pix genéricos">🔎 Revisar</Link>
          <button className="btn btn-secondary" onClick={() => categorizarSemCategoria(false)} disabled={categorizando} title="Categoriza lançamentos sem categoria usando Memória Local + regras">
            {categorizando ? <span className="spinner" /> : "🧠"} Categorizar
          </button>
          <button className="btn btn-secondary" onClick={() => categorizarSemCategoria(true)} disabled={categorizando} title="+ Gemini para o que restar (lento)">
            {categorizando ? <span className="spinner" /> : "🤖"} + Gemini
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-400 shrink-0">Período:</span>
          {PRESETS.map((p) => {
            const { i, f } = p.fn();
            const ativo = filtros.dataInicio === i && filtros.dataFim === f;
            return (
              <button key={p.label} onClick={() => aplicarPreset(p.fn)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-all ${ativo ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-600"}`}>
                {p.label}
              </button>
            );
          })}
          <button onClick={limparPeriodo}
            className="text-xs px-3 py-1.5 rounded-full border border-slate-200 text-slate-400 hover:border-slate-400 transition-all">
            Limpar datas
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <input placeholder="Buscar descrição…" value={filtros.busca} onChange={(e) => setFiltro("busca", e.target.value)} />
          <select value={filtros.conta} onChange={(e) => setFiltro("conta", e.target.value)}>
            <option value="">Todas as contas</option>
            {CONTAS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filtros.categoria} onChange={(e) => setFiltro("categoria", e.target.value)}>
            <option value="">Todas as categorias</option>
            <option value="__sem__">⚠️ Sem categoria</option>
            <OpcoesCategorias />
          </select>
          <select value={filtros.tipo} onChange={(e) => setFiltro("tipo", e.target.value)}>
            <option value="">Entrada e Saída</option>
            <option value="Entrada">Entradas</option>
            <option value="Saída">Saídas</option>
          </select>
          <input type="date" value={filtros.dataInicio} onChange={(e) => setFiltro("dataInicio", e.target.value)} />
          <input type="date" value={filtros.dataFim}    onChange={(e) => setFiltro("dataFim",    e.target.value)} />
        </div>
      </div>

      {/* Tabela resumo */}
      {resumo && !loading && resumo.categorias.length > 0 && (
        <TabelaResumo resumo={resumo} />
      )}

      {/* Lançamentos */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><div className="spinner" /></div>
        ) : (
          <>
            {/* Celular: lista em cartões */}
            <ul className="sm:hidden divide-y divide-slate-100">
              {lancamentos.map((l) => {
                const sel = selecionados.has(l.id);
                return (
                  <li key={l.id} className={`px-4 py-3 ${sel ? "bg-blue-50/60" : isEmprestimo(l.categoria) ? "bg-purple-50/40" : ""}`}>
                    <div className="flex items-start gap-3">
                      <input type="checkbox" checked={sel} onChange={() => toggleSelecionado(l.id)} className="mt-1 cursor-pointer" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm text-slate-800 line-clamp-2 break-words">{l.descricao}</div>
                          <div className={`text-sm font-semibold whitespace-nowrap ${l.valor >= 0 ? "valor-positivo" : "valor-negativo"}`}>{fmt(l.valor)}</div>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {fmtData(l.data)} · {l.conta}{l.mesReferencia ? ` · ref. ${fmtMes(l.mesReferencia)}` : ""}
                        </div>
                        {l.pessoa && <div className="text-xs text-purple-600 mt-0.5">🤝 {l.pessoa}</div>}
                        <div className="flex items-center justify-between gap-2 mt-2">
                          <div className="min-w-0">{categoriaCelula(l)}</div>
                          <div className="flex items-center gap-3 shrink-0">
                            <button title="Salvar na Memória Local" onClick={() => salvarNaMemoria(l)} disabled={salvandoMemoria === l.id}
                              className="text-slate-400 text-base leading-none disabled:opacity-50">
                              {salvandoMemoria === l.id ? <span className="spinner" style={{ width: 14, height: 14 }} /> : "🧠"}
                            </button>
                            <button title="Excluir" onClick={() => excluir(l.id)} className="text-slate-400 hover:text-red-500 text-xl leading-none">×</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="hidden sm:block overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th className="w-8">
                      <input type="checkbox" checked={todosSelecionados} onChange={toggleTodos}
                        className="cursor-pointer" title="Selecionar todos desta página" />
                    </th>
                    <th>Data</th><th>Descrição</th><th>Categoria</th>
                    <th className="text-right">Valor</th><th>Conta</th><th>Mês Ref.</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {lancamentos.map((l) => {
                    const sel = selecionados.has(l.id);
                    return (
                      <tr key={l.id} className={`${isEmprestimo(l.categoria) ? "bg-purple-50/40" : ""} ${sel ? "bg-blue-50/60" : ""}`}>
                        <td>
                          <input type="checkbox" checked={sel} onChange={() => toggleSelecionado(l.id)} className="cursor-pointer" />
                        </td>
                        <td className="whitespace-nowrap text-slate-500">{fmtData(l.data)}</td>
                        <td className="max-w-xs">
                          <div className="truncate" title={l.descricao}>{l.descricao}</div>
                          {l.pessoa && <div className="text-xs text-purple-600 mt-0.5">🤝 {l.pessoa}</div>}
                        </td>
                        <td>{categoriaCelula(l)}</td>
                        <td className={`text-right font-medium ${l.valor >= 0 ? "valor-positivo" : "valor-negativo"}`}>
                          {fmt(l.valor)}
                        </td>
                        <td><span className="badge bg-slate-100 text-slate-600">{l.conta}</span></td>
                        <td className="text-slate-400 text-xs">{l.mesReferencia ? fmtMes(l.mesReferencia) : "-"}</td>
                        <td>
                          <div className="flex items-center gap-1">
                            <button title="Salvar na Memória Local" onClick={() => salvarNaMemoria(l)} disabled={salvandoMemoria === l.id}
                              className="text-slate-300 hover:text-purple-500 text-base leading-none transition-colors disabled:opacity-50">
                              {salvandoMemoria === l.id ? <span className="spinner" style={{ width: 14, height: 14 }} /> : "🧠"}
                            </button>
                            <button title="Excluir" onClick={() => excluir(l.id)}
                              className="text-slate-300 hover:text-red-500 text-lg leading-none transition-colors">×</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between flex-wrap gap-3 px-4 py-3 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500">{total} registros</span>
                <select
                  value={limit}
                  onChange={(e) => alterarLimite(Number(e.target.value))}
                  className="text-xs border border-slate-200 rounded-md px-2 py-1 text-slate-600 bg-white"
                >
                  <option value={25}>25 por página</option>
                  <option value={50}>50 por página</option>
                  <option value={100}>100 por página</option>
                  <option value={250}>250 por página</option>
                  <option value={9999}>Todos</option>
                </select>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 hidden sm:inline">Página {page} de {totalPages}</span>
                  <button className="btn btn-secondary text-xs" disabled={page <= 1}          onClick={() => mudarPagina(page - 1)}>← Anterior</button>
                  <button className="btn btn-secondary text-xs" disabled={page >= totalPages} onClick={() => mudarPagina(page + 1)}>Próxima →</button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Barra flutuante de ação em massa */}
      {numSelecionados > 0 && (
        <div className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center flex-wrap sm:flex-nowrap gap-3 bg-slate-900 text-white px-4 sm:px-5 py-3 rounded-2xl shadow-2xl w-[calc(100vw-2rem)] sm:w-auto">
          <span className="text-sm font-medium whitespace-nowrap">
            {numSelecionados} selecionado{numSelecionados !== 1 ? "s" : ""}
          </span>
          <div className="hidden sm:block w-px h-5 bg-slate-600" />
          <select
            value={categoriaMassa}
            onChange={(e) => setCategoriaMassa(e.target.value)}
            className="text-sm rounded-lg border border-slate-600 bg-slate-800 text-white px-3 py-1.5 flex-1 min-w-0 sm:flex-none sm:w-52 focus:outline-none focus:border-blue-400"
          >
            <option value="">Nova categoria…</option>
            <OpcoesCategorias />
          </select>
          <button onClick={aplicarEmMassa} disabled={aplicandoMassa || !categoriaMassa}
            className="btn btn-primary text-sm whitespace-nowrap disabled:opacity-50">
            {aplicandoMassa ? <span className="spinner" /> : "Aplicar"}
          </button>
          <button onClick={() => { setSelecionados(new Set()); setCategoriaMassa(""); }}
            className="text-slate-400 hover:text-white text-lg leading-none transition-colors" title="Cancelar seleção">
            ×
          </button>
        </div>
      )}
    </div>
  );
}

// ── Componente da tabela resumo ──────────────────────────────────────────────

function TabelaResumo({ resumo }: { resumo: ResumoFiltro }) {
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const [aberto, setAberto] = useState<"entradas" | "saidas" | null>(null);

  const toggle = (tipo: "entradas" | "saidas") =>
    setAberto((prev) => (prev === tipo ? null : tipo));

  const catsEntrada = resumo.categorias.filter((c) => resumo.entradas[c]).sort((a, b) => resumo.entradas[b] - resumo.entradas[a]);
  const catsSaida   = resumo.categorias.filter((c) => resumo.saidas[c]).sort((a, b) => resumo.saidas[b] - resumo.saidas[a]);

  return (
    <div className="card p-0 overflow-hidden divide-y divide-slate-100">
      <button onClick={() => toggle("entradas")}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-green-50/50 transition-colors">
        <div className="flex items-center gap-2">
          <span className={`text-xs transition-transform ${aberto === "entradas" ? "rotate-90" : ""}`}>▶</span>
          <span className="font-semibold text-green-700">↑ Entradas</span>
          <span className="text-xs text-slate-400">({catsEntrada.length} categorias)</span>
        </div>
        <span className="font-bold valor-positivo">{fmt(resumo.totalEntradas)}</span>
      </button>
      {aberto === "entradas" && (
        <div className="bg-green-50/30">
          {catsEntrada.map((c) => (
            <div key={c} className="flex items-center justify-between px-8 py-1.5 text-sm border-b border-green-100/60 last:border-0">
              <span className="text-slate-600">{c}</span>
              <span className="valor-positivo">{fmt(resumo.entradas[c])}</span>
            </div>
          ))}
        </div>
      )}

      <button onClick={() => toggle("saidas")}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-red-50/50 transition-colors">
        <div className="flex items-center gap-2">
          <span className={`text-xs transition-transform ${aberto === "saidas" ? "rotate-90" : ""}`}>▶</span>
          <span className="font-semibold text-red-700">↓ Saídas</span>
          <span className="text-xs text-slate-400">({catsSaida.length} categorias)</span>
        </div>
        <span className="font-bold valor-negativo">{fmt(resumo.totalSaidas)}</span>
      </button>
      {aberto === "saidas" && (
        <div className="bg-red-50/20">
          {catsSaida.map((c) => (
            <div key={c} className="flex items-center justify-between px-8 py-1.5 text-sm border-b border-red-100/60 last:border-0">
              <span className="text-slate-600">{c}</span>
              <span className="valor-negativo">{fmt(resumo.saidas[c])}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between px-4 py-3 bg-slate-50">
        <span className="font-bold text-slate-700">Saldo</span>
        <span className={`font-bold text-lg ${resumo.saldo >= 0 ? "valor-positivo" : "valor-negativo"}`}>
          {fmt(resumo.saldo)}
        </span>
      </div>
    </div>
  );
}
