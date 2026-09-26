"use client";
// Reserva: onde está o dinheiro guardado. Saldo informado numa data; depois dela,
// aplicações e resgates importados atualizam a estimativa.
import { useCallback, useEffect, useState } from "react";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (d: string) => new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" });
const hojeISO = () => new Date().toISOString().slice(0, 10);
const numero = (s: string) => { const n = parseFloat(s.replace(/\./g, "").replace(",", ".")); return isNaN(n) ? NaN : n; };

const TIPOS = [
  { valor: "investimento", rotulo: "Investimento" },
  { valor: "previdencia", rotulo: "Previdência" },
  { valor: "conta", rotulo: "Conta / poupança" },
] as const;

interface Reserva {
  id: number; nome: string; tipo: string; bloqueada: boolean;
  saldoInformado: number; dataSaldo: string; conta: string | null; filtroDescricao: string | null; observacao: string | null;
  saldo: number; aplicado: number; resgatado: number;
  movimentos: { data: string; descricao: string; valor: number }[];
}
interface Dados { reservas: Reserva[]; totais: { disponivel: number; bloqueado: number; total: number } }

type Form = { nome: string; tipo: string; bloqueada: boolean; saldo: string; data: string; conta: string; filtro: string; observacao: string };
const formVazio = (): Form => ({ nome: "", tipo: "investimento", bloqueada: false, saldo: "", data: hojeISO(), conta: "", filtro: "", observacao: "" });

export default function ReservaPage() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [contas, setContas] = useState<string[]>([]);
  const [novo, setNovo] = useState<Form | null>(null);
  const [editando, setEditando] = useState<number | null>(null);
  const [form, setForm] = useState<Form>(formVazio());
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    const r = await fetch("/api/reservas");
    if (r.ok) setDados(await r.json());
  }, []);

  useEffect(() => {
    let ativo = true;
    Promise.all([
      fetch("/api/reservas").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/contas").then((r) => (r.ok ? r.json() : [])),
    ]).then(([d, cs]: [Dados | null, { nome: string }[]]) => {
      if (!ativo) return;
      setDados(d);
      setContas(cs.map((c) => c.nome));
    });
    return () => { ativo = false; };
  }, []);

  const corpo = (f: Form) => ({
    nome: f.nome.trim(), tipo: f.tipo, bloqueada: f.bloqueada,
    saldoInformado: numero(f.saldo), dataSaldo: f.data,
    conta: f.conta || null, filtroDescricao: f.filtro.trim() || null, observacao: f.observacao.trim() || null,
  });

  const salvar = async (f: Form, id?: number) => {
    setErro("");
    const b = corpo(f);
    if (!b.nome || isNaN(b.saldoInformado)) { setErro("Informe o nome e o saldo."); return; }
    const r = await fetch("/api/reservas", {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(id ? { id, ...b } : b),
    });
    if (!r.ok) { const j = await r.json().catch(() => ({})); setErro(j.error ?? "Não foi possível salvar."); return; }
    setNovo(null); setEditando(null);
    await carregar();
  };

  const excluir = async (r: Reserva) => {
    if (!confirm(`Excluir a reserva "${r.nome}"? Os lançamentos não são afetados.`)) return;
    await fetch(`/api/reservas?id=${r.id}`, { method: "DELETE" });
    await carregar();
  };

  const abrirEdicao = (r: Reserva) => {
    setEditando(r.id);
    setForm({
      nome: r.nome, tipo: r.tipo, bloqueada: r.bloqueada,
      saldo: r.saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 }), data: hojeISO(),
      conta: r.conta ?? "", filtro: r.filtroDescricao ?? "", observacao: r.observacao ?? "",
    });
  };

  if (!dados) return <div className="flex justify-center py-20"><div className="spinner" /></div>;
  const { reservas, totais } = dados;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Reserva</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Onde está o dinheiro guardado. Informe o saldo que o banco mostra; entre uma atualização e outra,
            aplicações e resgates importados ajustam a estimativa.
          </p>
        </div>
        {!novo && <button className="btn btn-primary" onClick={() => { setNovo(formVazio()); setEditando(null); }}>+ Nova reserva</button>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card"><div className="text-sm text-slate-500">Disponível</div><div className="text-2xl font-bold text-emerald-700">{fmt(totais.disponivel)}</div></div>
        <div className="card"><div className="text-sm text-slate-500">Bloqueado</div><div className="text-2xl font-bold text-slate-600">{fmt(totais.bloqueado)}</div><div className="text-xs text-slate-400">previdência e similares</div></div>
        <div className="card"><div className="text-sm text-slate-500">Total guardado</div><div className="text-2xl font-bold text-slate-800">{fmt(totais.total)}</div></div>
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      {novo && (
        <div className="card space-y-3">
          <h2 className="font-semibold text-slate-700">Nova reserva</h2>
          <Formulario f={novo} contas={contas} onChange={setNovo} />
          <div className="flex gap-2 justify-end">
            <button className="btn btn-secondary" onClick={() => setNovo(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={() => salvar(novo)}>Salvar</button>
          </div>
        </div>
      )}

      {reservas.length === 0 && !novo ? (
        <div className="card text-center py-12 space-y-2">
          <div className="text-3xl">💰</div>
          <p className="text-slate-600">Nenhuma reserva cadastrada.</p>
          <p className="text-sm text-slate-400">Cadastre onde está seu dinheiro guardado: CDB, RDB, poupança, previdência…</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reservas.map((r) => (
            <div key={r.id} className="card space-y-3">
              {editando === r.id ? (
                <>
                  <Formulario f={form} contas={contas} onChange={setForm} />
                  <p className="text-xs text-slate-400">Ao atualizar o saldo, informe o valor que o banco mostra e a data dele — os movimentos anteriores a essa data deixam de somar.</p>
                  <div className="flex gap-2 justify-end">
                    <button className="btn btn-secondary" onClick={() => setEditando(null)}>Cancelar</button>
                    <button className="btn btn-primary" onClick={() => salvar(form, r.id)}>Salvar</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-800">{r.nome}</span>
                        <span className="badge bg-slate-100 text-slate-600">{TIPOS.find((t) => t.valor === r.tipo)?.rotulo ?? r.tipo}</span>
                        {r.bloqueada && <span className="badge bg-amber-50 text-amber-700">bloqueada</span>}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        Informado: {fmt(r.saldoInformado)} em {fmtData(r.dataSaldo)}
                        {r.conta && <> · movimentos da conta {r.conta}{r.filtroDescricao ? ` com "${r.filtroDescricao}"` : ""}</>}
                      </div>
                      {r.observacao && <div className="text-xs text-slate-500 mt-1">{r.observacao}</div>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-xl font-bold ${r.bloqueada ? "text-slate-600" : "text-emerald-700"}`}>{fmt(r.saldo)}</div>
                      {(r.aplicado > 0 || r.resgatado > 0) && (
                        <div className="text-xs text-slate-500">
                          desde então: {r.aplicado > 0 && <span className="text-emerald-600">+{fmt(r.aplicado)} </span>}
                          {r.resgatado > 0 && <span className="text-amber-700">−{fmt(r.resgatado)}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                  {r.movimentos.length > 0 && (
                    <ul className="text-xs text-slate-500 border-t border-slate-100 pt-2 space-y-0.5">
                      {r.movimentos.map((m, i) => (
                        <li key={i} className="flex justify-between gap-3">
                          <span className="truncate">{fmtData(m.data)} · {m.descricao}</span>
                          <span className={m.valor < 0 ? "text-emerald-600" : "text-amber-700"}>{m.valor < 0 ? "+" : "−"}{fmt(Math.abs(m.valor))}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex gap-3 text-sm">
                    <button className="text-blue-600 hover:underline" onClick={() => abrirEdicao(r)}>Atualizar saldo / editar</button>
                    <button className="text-slate-400 hover:text-red-600" onClick={() => excluir(r)}>Excluir</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Formulario({ f, contas, onChange }: { f: Form; contas: string[]; onChange: (f: Form) => void }) {
  const set = <K extends keyof Form>(k: K, v: Form[K]) => onChange({ ...f, [k]: v });
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
      <label className="space-y-1"><span className="text-slate-600">Nome</span>
        <input className="w-full" value={f.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Ex.: CDB Sofisa" /></label>
      <label className="space-y-1"><span className="text-slate-600">Tipo</span>
        <select className="w-full" value={f.tipo} onChange={(e) => set("tipo", e.target.value)}>
          {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
        </select></label>
      <label className="space-y-1"><span className="text-slate-600">Saldo (R$)</span>
        <input className="w-full" inputMode="decimal" value={f.saldo} onChange={(e) => set("saldo", e.target.value)} placeholder="0,00" /></label>
      <label className="space-y-1"><span className="text-slate-600">Saldo em</span>
        <input className="w-full" type="date" value={f.data} onChange={(e) => set("data", e.target.value)} /></label>
      <label className="space-y-1"><span className="text-slate-600">Conta dos movimentos (opcional)</span>
        <select className="w-full" value={f.conta} onChange={(e) => set("conta", e.target.value)}>
          <option value="">Nenhuma — só o saldo informado</option>
          {contas.map((c) => <option key={c} value={c}>{c}</option>)}
        </select></label>
      <label className="space-y-1"><span className="text-slate-600">Só descrições com (opcional)</span>
        <input className="w-full" value={f.filtro} onChange={(e) => set("filtro", e.target.value)} placeholder='Ex.: "RDB"' /></label>
      <label className="flex items-center gap-2 text-slate-600">
        <input type="checkbox" checked={f.bloqueada} onChange={(e) => set("bloqueada", e.target.checked)} />
        Bloqueada (não dá para usar agora — ex.: previdência)</label>
      <label className="space-y-1 sm:col-span-2"><span className="text-slate-600">Observação (opcional)</span>
        <input className="w-full" value={f.observacao} onChange={(e) => set("observacao", e.target.value)} /></label>
    </div>
  );
}
