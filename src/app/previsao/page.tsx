"use client";
import { useEffect, useState } from "react";
import type { PrevisaoItem } from "@/app/api/previsao/route";

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function PrevisaoPage() {
  const [itens, setItens] = useState<PrevisaoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroMes, setFiltroMes] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [expandido, setExpandido] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/previsao")
      .then((r) => r.json())
      .then((data) => { setItens(data); setLoading(false); });
  }, []);

  const meses = [...new Set(itens.map((i) => i.mes))].sort();
  const filtrado = itens.filter((i) => {
    if (filtroMes && i.mes !== filtroMes) return false;
    if (filtroTipo && i.tipoPrevisao !== filtroTipo) return false;
    return true;
  });

  const totalPorMes: Record<string, number> = {};
  for (const i of filtrado) {
    totalPorMes[i.mes] = (totalPorMes[i.mes] || 0) + i.valor;
  }

  const totalGeral = filtrado.reduce((acc, i) => acc + i.valor, 0);

  // Chave única por linha para controlar qual está expandida
  const rowKey = (item: PrevisaoItem, idx: number) => `${item.mes}|${item.descricao}|${idx}`;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Previsão de Gastos</h1>
        <div className="flex gap-2">
          <select value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)}>
            <option value="">Todos os meses</option>
            {meses.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
            <option value="">Todos os tipos</option>
            <option value="Parcelamento">Parcelamentos</option>
            <option value="Fixo">Gastos Fixos</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="spinner" /></div>
      ) : (
        <>
          {/* Resumo por mês */}
          <div className="card">
            <h2 className="font-semibold text-slate-700 mb-3">Resumo por Mês</h2>
            <div className="flex flex-wrap gap-3">
              {Object.entries(totalPorMes).sort((a, b) => a[0].localeCompare(b[0])).map(([mes, total]) => (
                <button
                  key={mes}
                  onClick={() => setFiltroMes(filtroMes === mes ? "" : mes)}
                  className={`p-3 rounded-lg border-2 text-left min-w-28 transition-all ${
                    filtroMes === mes
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="text-xs font-medium text-slate-500">{mes}</div>
                  <div className="font-bold text-slate-800 text-sm mt-0.5">{fmt(total)}</div>
                </button>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between text-sm">
              <span className="text-slate-500">Total previsto ({filtrado.length} lançamentos)</span>
              <span className="font-bold text-slate-800">{fmt(totalGeral)}</span>
            </div>
          </div>

          <div className="card p-0 overflow-hidden">
            <table>
              <thead>
                <tr>
                  <th>Mês</th>
                  <th>Descrição</th>
                  <th>Categoria</th>
                  <th className="text-right">Valor</th>
                  <th>Tipo</th>
                  <th>Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {filtrado.length === 0 ? (
                  <tr><td colSpan={6} className="text-center text-slate-400 py-8">Nenhuma previsão encontrada</td></tr>
                ) : (
                  filtrado.map((item, i) => {
                    const key = rowKey(item, i);
                    const aberto = expandido === key;
                    const temHistorico = item.historico && item.historico.length > 0;

                    return (
                      <>
                        <tr key={key} className={aberto ? "bg-slate-50" : ""}>
                          <td className="font-medium text-slate-700">{item.mes}</td>
                          <td className="max-w-xs">
                            {temHistorico ? (
                              <button
                                onClick={() => setExpandido(aberto ? null : key)}
                                className="flex items-center gap-1.5 text-left hover:text-blue-600 transition-colors group"
                                title="Ver histórico de valores"
                              >
                                <span className={`text-xs text-slate-400 group-hover:text-blue-400 transition-transform ${aberto ? "rotate-90" : ""}`}>▶</span>
                                <span className="truncate">{item.descricao}</span>
                              </button>
                            ) : (
                              <span className="text-slate-600 truncate block">{item.descricao}</span>
                            )}
                          </td>
                          <td>
                            <span className="badge bg-blue-50 text-blue-700">{item.categoria}</span>
                          </td>
                          <td className="text-right font-medium valor-negativo">{fmt(item.valor)}</td>
                          <td>
                            <span className={`badge ${
                              item.tipoPrevisao === "Parcelamento"
                                ? "bg-orange-50 text-orange-700"
                                : "bg-purple-50 text-purple-700"
                            }`}>
                              {item.tipoPrevisao}
                            </span>
                          </td>
                          <td className="text-slate-400 text-xs">{item.detalhe}</td>
                        </tr>

                        {/* Linha expandida com histórico */}
                        {aberto && temHistorico && (
                          <tr key={`${key}|hist`} className="bg-slate-50">
                            <td colSpan={6} className="px-8 py-3">
                              <div className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">
                                {item.tipoPrevisao === "Fixo"
                                  ? `Histórico de lançamentos usados na média`
                                  : `Parcela registrada`}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {item.historico!.map((h, hi) => (
                                  <div key={hi} className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm">
                                    <span className="text-slate-400 text-xs">{h.mes}</span>
                                    <span className="font-medium text-slate-700">{fmt(h.valor)}</span>
                                  </div>
                                ))}
                              </div>
                              {item.tipoPrevisao === "Fixo" && item.historico!.length > 1 && (
                                <div className="mt-2 text-xs text-slate-400">
                                  Média: <span className="font-semibold text-slate-600">{fmt(item.valor)}</span>
                                  {" · "}
                                  Mín: <span className="text-slate-600">{fmt(Math.min(...item.historico!.map(h => h.valor)))}</span>
                                  {" · "}
                                  Máx: <span className="text-slate-600">{fmt(Math.max(...item.historico!.map(h => h.valor)))}</span>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
