"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtData = (d: string) =>
  new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" });

interface LancamentoResumo {
  id: number;
  data: string;
  descricao: string;
  valor: number;
  categoria: string;
  conta: string;
}

interface ResumoPessoa {
  pessoa: string;
  totalEmprestado: number;
  totalRecebido: number;
  saldo: number;
  status: "aberto" | "parcial" | "quitado";
  lancamentos: LancamentoResumo[];
}

const STATUS_CONFIG = {
  aberto:  { label: "Em aberto",  bg: "bg-red-50",    text: "text-red-700",    dot: "bg-red-400"    },
  parcial: { label: "Parcial",    bg: "bg-amber-50",  text: "text-amber-700",  dot: "bg-amber-400"  },
  quitado: { label: "Quitado ✅", bg: "bg-green-50",  text: "text-green-700",  dot: "bg-green-400"  },
};

export default function EmprestimosPage() {
  const [resumos, setResumos] = useState<ResumoPessoa[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<string>("");
  const router = useRouter();

  useEffect(() => {
    fetch("/api/emprestimos")
      .then((r) => r.json())
      .then((data) => { setResumos(data); setLoading(false); });
  }, []);

  const filtrados = filtroStatus
    ? resumos.filter((r) => r.status === filtroStatus)
    : resumos;

  const totalEmAberto = resumos
    .filter((r) => r.status !== "quitado")
    .reduce((acc, r) => acc + r.saldo, 0);

  const totalEmprestado = resumos.reduce((acc, r) => acc + r.totalEmprestado, 0);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Empréstimos</h1>
        <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
          <option value="">Todos</option>
          <option value="aberto">Em aberto</option>
          <option value="parcial">Parcial</option>
          <option value="quitado">Quitados</option>
        </select>
      </div>

      {/* KPIs */}
      {!loading && resumos.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="card">
            <div className="text-sm text-slate-500 mb-1">Total emprestado</div>
            <div className="text-xl font-bold text-slate-800">{fmt(totalEmprestado)}</div>
          </div>
          <div className="card">
            <div className="text-sm text-slate-500 mb-1">Em aberto</div>
            <div className="text-xl font-bold valor-negativo">{fmt(totalEmAberto)}</div>
          </div>
          <div className="card">
            <div className="text-sm text-slate-500 mb-1">Pessoas</div>
            <div className="text-xl font-bold text-slate-800">
              {resumos.filter((r) => r.status !== "quitado").length}
              <span className="text-sm font-normal text-slate-400"> ativas</span>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><div className="spinner" /></div>
      ) : filtrados.length === 0 ? (
        <div className="card text-center text-slate-400 py-12">
          <div className="text-4xl mb-3">🤝</div>
          <div className="font-medium">Nenhum empréstimo encontrado</div>
          <div className="text-sm mt-1">
            Categorize um lançamento como <strong>Empréstimo</strong> e preencha o campo <strong>Pessoa</strong> para ele aparecer aqui.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtrados.map((r) => {
            const cfg = STATUS_CONFIG[r.status];
            const aberto = expandido === r.pessoa;
            const pct = r.totalEmprestado > 0
              ? Math.min(100, (r.totalRecebido / r.totalEmprestado) * 100)
              : 0;

            return (
              <div key={r.pessoa} className="card p-0 overflow-hidden">
                {/* Cabeçalho do card */}
                <button
                  className="w-full flex items-center gap-4 p-4 text-left hover:bg-slate-50 transition-colors"
                  onClick={() => setExpandido(aberto ? null : r.pessoa)}
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-sm shrink-0">
                    {r.pessoa.charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-slate-800">{r.pessoa}</span>
                      <span className={`badge ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
                    </div>
                    {/* Barra de progresso */}
                    <div className="h-1.5 bg-slate-100 rounded-full w-full">
                      <div
                        className="h-1.5 rounded-full bg-green-400 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-slate-400 mt-0.5">
                      <span>Pago {fmt(r.totalRecebido)} de {fmt(r.totalEmprestado)}</span>
                      <span>{pct.toFixed(0)}%</span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className={`text-lg font-bold ${r.status === "quitado" ? "valor-positivo" : "valor-negativo"}`}>
                      {r.status === "quitado" ? "Quitado" : fmt(r.saldo)}
                    </div>
                    {r.status !== "quitado" && (
                      <div className="text-xs text-slate-400">em aberto</div>
                    )}
                  </div>

                  <span className="text-slate-400 text-lg">{aberto ? "▲" : "▼"}</span>
                </button>

                {/* Detalhes expandidos */}
                {aberto && (
                  <div className="border-t border-slate-100">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className="text-left py-2 px-4 text-xs text-slate-400 font-medium">Data</th>
                          <th className="text-left py-2 px-4 text-xs text-slate-400 font-medium">Descrição</th>
                          <th className="text-left py-2 px-4 text-xs text-slate-400 font-medium">Tipo</th>
                          <th className="text-right py-2 px-4 text-xs text-slate-400 font-medium">Valor</th>
                          <th className="text-left py-2 px-4 text-xs text-slate-400 font-medium">Conta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.lancamentos.map((l) => (
                          <tr key={l.id} className="border-t border-slate-50 hover:bg-slate-50">
                            <td className="py-2 px-4 text-sm text-slate-500 whitespace-nowrap">{fmtData(l.data)}</td>
                            <td className="py-2 px-4 text-sm text-slate-700 max-w-xs truncate" title={l.descricao}>{l.descricao}</td>
                            <td className="py-2 px-4">
                              <span className={`badge text-xs ${
                                l.categoria === "Empréstimo"
                                  ? "bg-red-50 text-red-700"
                                  : "bg-green-50 text-green-700"
                              }`}>
                                {l.categoria === "Empréstimo" ? "↑ Emprestado" : "↓ Recebido"}
                              </span>
                            </td>
                            <td className={`py-2 px-4 text-sm font-medium text-right ${
                              l.categoria === "Empréstimo" ? "valor-negativo" : "valor-positivo"
                            }`}>
                              {fmt(Math.abs(l.valor))}
                            </td>
                            <td className="py-2 px-4">
                              <span className="badge bg-slate-100 text-slate-500 text-xs">{l.conta}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="flex justify-end gap-2 p-3 border-t border-slate-100 bg-slate-50">
                      <button
                        className="btn btn-secondary text-xs"
                        onClick={() => router.push(`/lancamentos?pessoa=${encodeURIComponent(r.pessoa)}`)}
                      >
                        Ver todos os lançamentos →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
