"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const CORES = [
  "#3b82f6","#ef4444","#10b981","#f59e0b","#8b5cf6",
  "#ec4899","#14b8a6","#f97316","#6366f1","#84cc16",
  "#06b6d4","#a855f7","#e11d48","#0ea5e9","#d97706",
];

const fmt = (v: number | undefined) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface DashData {
  totalEntradas: number;
  totalSaidas: number;
  saldo: number;
  porCategoria: [string, number][];
  porMes: [string, { entradas: number; saidas: number }][];
  porConta: [string, number][];
}

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

export default function Dashboard() {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [mes, setMes] = useState<number | "">("");
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  // null = ainda não sabemos; false = fotografia pendente; true = concluída
  const [fotografiaFeita, setFotografiaFeita] = useState<boolean | null>(null);
  const [comparacao, setComparacao] = useState<{ saidas: { planejado: number; realizado: number }; totalLancamentos: number } | null>(null);

  useEffect(() => {
    if (fotografiaFeita !== true) return;
    let ativo = true;
    fetch("/api/planejamento/realizado")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => { if (ativo && json?.temFotografia) setComparacao(json); })
      .catch(() => {});
    return () => { ativo = false; };
  }, [fotografiaFeita]);

  useEffect(() => {
    let ativo = true;
    fetch("/api/planejamento")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => { if (ativo && json) setFotografiaFeita(!!json.fotografiaConcluidaEm); })
      .catch(() => {});
    return () => { ativo = false; };
  }, []);

  useEffect(() => {
    let ativo = true;
    async function carregar() {
    const params = new URLSearchParams({ ano: String(ano) });
    if (mes !== "") params.set("mes", String(mes));
    const res = await fetch(`/api/dashboard?${params}`);
    const json = await res.json();
      if (ativo) {
        setData(json);
        setLoading(false);
      }
    }
    void carregar();
    return () => { ativo = false; };
  }, [ano, mes]);

  const anos = Array.from({ length: 5 }, (_, i) => anoAtual - i);

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <div className="flex gap-2">
          <select value={mes} onChange={(e) => setMes(e.target.value === "" ? "" : parseInt(e.target.value))}>
            <option value="">Ano todo</option>
            {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={ano} onChange={(e) => setAno(parseInt(e.target.value))}>
            {anos.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {fotografiaFeita === false && (
        <div className="card flex items-center justify-between gap-4 flex-wrap border-blue-200 bg-blue-50">
          <div>
            <div className="font-semibold text-slate-800">📸 Faça sua fotografia do mês</div>
            <div className="text-sm text-slate-600 mt-0.5">
              Cinco minutos para registrar o que entra, o que sai e quanto sobra. Depois comparamos com seus lançamentos.
            </div>
          </div>
          <Link href="/planejamento" className="btn btn-primary">Começar</Link>
        </div>
      )}

      {comparacao && (() => {
        const dif = comparacao.saidas.planejado - comparacao.saidas.realizado;
        const semLancamentos = comparacao.totalLancamentos === 0;
        return (
          <Link href="/planejamento?aba=comparacao" className="card flex items-center justify-between gap-4 flex-wrap hover:border-blue-300 transition-colors">
            <div>
              <div className="text-sm text-slate-500">📸 Este mês vs. sua fotografia</div>
              <div className="text-slate-800 mt-0.5">
                {semLancamentos ? (
                  <>Planejado <span className="font-semibold">{fmt(comparacao.saidas.planejado)}</span> de saídas · nenhum lançamento registrado neste mês ainda</>
                ) : (
                  <>
                    Saídas: <span className="font-semibold">{fmt(comparacao.saidas.realizado)}</span> de{" "}
                    <span className="font-semibold">{fmt(comparacao.saidas.planejado)}</span> planejados ·{" "}
                    <span className={dif >= 0 ? "text-emerald-600 font-medium" : "text-red-600 font-medium"}>
                      {dif >= 0 ? `${fmt(dif)} dentro do plano` : `${fmt(-dif)} acima do plano`}
                    </span>
                  </>
                )}
              </div>
            </div>
            <span className="text-sm text-blue-600">Ver comparação →</span>
          </Link>
        );
      })()}

      {loading ? (
        <div className="flex justify-center py-20"><div className="spinner" /></div>
      ) : data && data.porCategoria.length === 0 && data.porMes.length === 0 && data.totalEntradas === 0 && data.totalSaidas === 0 ? (
        <div className="card text-center py-14 space-y-4">
          <div className="text-4xl">📂</div>
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Nenhum lançamento em {mes ? `${MESES[mes - 1]}/${ano}` : ano}</h2>
            <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
              O dashboard ganha vida com seus lançamentos. Importe o extrato do banco ou comece registrando à mão.
            </p>
          </div>
          <div className="flex justify-center gap-3 flex-wrap">
            <Link href="/importar" className="btn btn-primary">📂 Importar extrato</Link>
            <Link href="/lancamentos?novo=1" className="btn btn-secondary">✏️ Lançar à mão</Link>
          </div>
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Total Entradas", valor: data.totalEntradas, classe: "valor-positivo" },
              { label: "Total Saídas", valor: data.totalSaidas, classe: "valor-negativo" },
              { label: "Saldo", valor: data.saldo, classe: data.saldo >= 0 ? "valor-positivo" : "valor-negativo" },
            ].map((k) => (
              <div key={k.label} className="card">
                <div className="text-sm text-slate-500 mb-1">{k.label}</div>
                <div className={`text-2xl font-bold ${k.classe}`}>{fmt(k.valor)}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="card">
              <h2 className="font-semibold text-slate-700 mb-4">Gastos por Categoria</h2>
              {data.porCategoria.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={data.porCategoria.map(([name, value]) => ({ name, value }))}
                      cx="50%" cy="50%" outerRadius={90}
                      dataKey="value"
                    >
                      {data.porCategoria.map((_, i) => (
                        <Cell key={i} fill={CORES[i % CORES.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => fmt(v as number)} />
                    <Legend
                      formatter={(value: string) => value.length > 20 ? value.slice(0, 18) + "…" : value}
                      wrapperStyle={{ fontSize: 11 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center text-slate-400 py-10">Sem dados</div>
              )}
            </div>

            <div className="card">
              <h2 className="font-semibold text-slate-700 mb-4">Top Categorias (Saídas)</h2>
              <div className="space-y-2.5">
                {data.porCategoria.slice(0, 8).map(([cat, val], i) => {
                  const max = data.porCategoria[0]?.[1] || 1;
                  return (
                    <div key={cat}>
                      <div className="flex justify-between text-sm mb-0.5">
                        <span className="text-slate-600 truncate">{cat}</span>
                        <span className="font-medium text-slate-800 ml-2 shrink-0">{fmt(val)}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full">
                        <div
                          className="h-1.5 rounded-full transition-all"
                          style={{ width: `${(val / max) * 100}%`, background: CORES[i % CORES.length] }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {!mes && data.porMes.length > 0 && (
            <div className="card">
              <h2 className="font-semibold text-slate-700 mb-4">Evolução Mensal</h2>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.porMes.map(([key, v]) => ({
                  mes: MESES[parseInt(key.split("-")[1]) - 1],
                  Entradas: v.entradas,
                  Saídas: v.saidas,
                }))}>
                  <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => fmt(v as number)} />
                  <Legend />
                  <Bar dataKey="Entradas" fill="#10b981" radius={[3,3,0,0]} />
                  <Bar dataKey="Saídas" fill="#ef4444" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {data.porConta.length > 0 && (
            <div className="card">
              <h2 className="font-semibold text-slate-700 mb-4">Gastos por Conta</h2>
              <div className="grid grid-cols-4 gap-4">
                {data.porConta.map(([conta, val]) => (
                  <div key={conta} className="text-center p-4 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="text-xs text-slate-500 mb-1">{conta}</div>
                    <div className="font-bold text-slate-800">{fmt(val)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
