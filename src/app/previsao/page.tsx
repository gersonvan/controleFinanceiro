"use client";
import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { ItemPrevisao, HistoricoItem, HistoricoLancamento } from "@/app/api/previsao/route";

// "MM/AAAA" em ordem cronológica
const compararMes = (a: string, b: string) => {
  const chave = (m: string) => { const [mm, aaaa] = m.split("/"); return `${aaaa}-${mm}`; };
  return chave(a).localeCompare(chave(b));
};

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function HistoricoChart({ historico, media }: { historico: HistoricoItem[]; media: number }) {
  const [tooltip, setTooltip] = useState<{
    x: number; y: number; mes: string; valor: number;
    lancamentos?: HistoricoLancamento[];
  } | null>(null);

  // Ordena cronologicamente (mais antigo → mais recente)
  const dados = [...historico].sort((a, b) => {
    const toKey = (m: string) => { const [mm, yyyy] = m.split("/"); return `${yyyy}-${mm}`; };
    return toKey(a.mes).localeCompare(toKey(b.mes));
  });

  const W = 560, H = 140, PAD = { top: 12, right: 12, bottom: 28, left: 64 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const maxVal = Math.max(...dados.map(d => d.valor), media) * 1.15;
  const barW = Math.min(36, (chartW / dados.length) * 0.6);
  const gap  = chartW / dados.length;

  const xOf  = (i: number) => PAD.left + gap * i + gap / 2;
  const yOf  = (v: number) => PAD.top + chartH * (1 - v / maxVal);

  // Média móvel de 3 meses
  const maValues = dados.map((_, i) => {
    const window = dados.slice(Math.max(0, i - 1), i + 2);
    return window.reduce((s, d) => s + d.valor, 0) / window.length;
  });

  // Linha de média móvel
  const maPath = maValues
    .map((v, i) => `${i === 0 ? "M" : "L"} ${xOf(i)} ${yOf(v)}`)
    .join(" ");

  // Ticks Y (3 linhas)
  const yTicks = [0.25, 0.5, 0.75, 1].map(p => ({ v: maxVal * p, y: yOf(maxVal * p) }));

  return (
    <div style={{ position: "relative" }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
        {/* Grid Y */}
        {yTicks.map(({ v, y }) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y}
              stroke="#e2e8f0" strokeWidth={0.5} strokeDasharray="3,3" />
            <text x={PAD.left - 6} y={y + 4} textAnchor="end"
              fontSize={9} fill="#94a3b8">
              {v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}
            </text>
          </g>
        ))}

        {/* Barras */}
        {dados.map((d, i) => {
          const x = xOf(i) - barW / 2;
          const barH2 = chartH * (d.valor / maxVal);
          const y = PAD.top + chartH - barH2;
          return (
            <rect
              key={i} x={x} y={y} width={barW} height={barH2}
              rx={3}
              fill="#3b82f6" fillOpacity={0.75}
              style={{ cursor: "pointer" }}
              onMouseEnter={() => {
                setTooltip({ x: xOf(i), y, mes: d.mes, valor: d.valor, lancamentos: d.lancamentos });
              }}
              onMouseLeave={() => setTooltip(null)}
            />
          );
        })}

        {/* Linha de média móvel */}
        <path d={maPath} fill="none" stroke="#f97316" strokeWidth={2} strokeLinejoin="round" />
        {maValues.map((v, i) => (
          <circle key={i} cx={xOf(i)} cy={yOf(v)} r={3} fill="#f97316" />
        ))}

        {/* Linha da média geral */}
        <line x1={PAD.left} x2={W - PAD.right} y1={yOf(media)} y2={yOf(media)}
          stroke="#6366f1" strokeWidth={1} strokeDasharray="5,3" />
        <text x={W - PAD.right + 4} y={yOf(media) + 4} fontSize={9} fill="#6366f1">
          média
        </text>

        {/* Labels X */}
        {dados.map((d, i) => (
          <text key={i} x={xOf(i)} y={H - 4} textAnchor="middle" fontSize={9} fill="#94a3b8">
            {d.mes}
          </text>
        ))}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: "absolute",
          left: `${(tooltip.x / W) * 100}%`,
          top: tooltip.y - 8,
          transform: "translate(-50%, -100%)",
          background: "#1e293b",
          color: "#fff",
          borderRadius: 8,
          padding: "8px 12px",
          fontSize: 11,
          whiteSpace: "nowrap",
          pointerEvents: "none",
          zIndex: 10,
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          minWidth: 180,
        }}>
          <div style={{ color: "#94a3b8", marginBottom: 4, fontWeight: 500 }}>{tooltip.mes}</div>
          {tooltip.lancamentos && tooltip.lancamentos.length > 0 ? (
            <>
              {tooltip.lancamentos.map((l, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 2 }}>
                  <span style={{ color: "#cbd5e1", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {l.descricao.length > 28 ? l.descricao.slice(0, 28) + "…" : l.descricao}
                  </span>
                  <span style={{ fontWeight: 600, color: "#f8fafc" }}>{fmt(l.valor)}</span>
                </div>
              ))}
              {tooltip.lancamentos.length > 1 && (
                <div style={{ borderTop: "1px solid #334155", marginTop: 4, paddingTop: 4, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#94a3b8" }}>Total</span>
                  <span style={{ fontWeight: 700, color: "#60a5fa" }}>{fmt(tooltip.valor)}</span>
                </div>
              )}
            </>
          ) : (
            <div style={{ fontWeight: 600 }}>{fmt(tooltip.valor)}</div>
          )}
        </div>
      )}

      {/* Legenda */}
      <div style={{ display: "flex", gap: 16, marginTop: 4, fontSize: 10, color: "#94a3b8" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, background: "#3b82f6", opacity: 0.75, borderRadius: 2, display: "inline-block" }} />
          Valor mensal
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 16, height: 2, background: "#f97316", display: "inline-block" }} />
          Média móvel (3m)
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 16, height: 2, background: "#6366f1", display: "inline-block", borderTop: "1px dashed #6366f1" }} />
          Média geral
        </span>
      </div>
    </div>
  );
}

type Base = "fotografia" | "historico";
interface Resposta {
  base: Base;
  temFotografia: boolean;
  itens: ItemPrevisao[];
  foraDaFotografia: { categoria: string; historico: number }[];
  encerradas: string[];
}

const COR_TIPO: Record<string, string> = {
  Parcelamento: "bg-orange-50 text-orange-700",
  Planejado: "bg-teal-50 text-teal-700",
  "Histórico": "bg-purple-50 text-purple-700",
};

export default function PrevisaoPage() {
  const [base, setBase] = useState<Base>("fotografia"); // sem fotografia, a API responde com o histórico
  const [dados, setDados] = useState<Resposta | null>(null);
  const [filtroMes, setFiltroMes] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [expandido, setExpandido] = useState<string | null>(null);
  const carregando = !dados;

  const carregar = useCallback(async (b: Base) => {
    const r = await fetch(`/api/previsao?base=${b}`);
    if (r.ok) setDados(await r.json());
  }, []);

  useEffect(() => {
    let ativo = true;
    fetch(`/api/previsao?base=${base}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (ativo && d) setDados(d); });
    return () => { ativo = false; };
  }, [base]);

  const trocarBase = (b: Base) => {
    setBase(b); setDados(null); setFiltroTipo("");
  };

  const encerrar = async (categoria: string, encerrada: boolean) => {
    if (encerrada && !confirm(`Marcar "${categoria}" como encerrada? Ela passa a valer zero na previsão (o histórico continua).`)) return;
    await fetch("/api/previsao", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoria, encerrada }),
    });
    await carregar(base);
  };

  const itens = dados?.itens ?? [];
  const meses = [...new Set(itens.map((i) => i.mes))].sort(compararMes);
  const filtrado = itens.filter((i) => (!filtroMes || i.mes === filtroMes) && (!filtroTipo || i.tipoPrevisao === filtroTipo));
  const totalPorMes: Record<string, number> = {};
  for (const i of itens.filter((x) => !filtroTipo || x.tipoPrevisao === filtroTipo)) totalPorMes[i.mes] = (totalPorMes[i.mes] || 0) + i.valor;
  const totalGeral = filtrado.reduce((acc, i) => acc + i.valor, 0);
  const rowKey = (item: ItemPrevisao, idx: number) => `${item.mes}|${item.descricao}|${idx}`;
  const baseEfetiva = dados?.base ?? base;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Previsão de Gastos</h1>
        <div className="flex gap-2 flex-wrap">
          <select value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)}>
            <option value="">Todos os meses</option>
            {meses.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
            <option value="">Todos os tipos</option>
            <option value="Parcelamento">Parcelamentos</option>
            {baseEfetiva === "fotografia" ? <option value="Planejado">Planejados</option> : <option value="Histórico">Pelo histórico</option>}
          </select>
        </div>
      </div>

      {/* Base da previsão: uma de cada vez, sem misturar */}
      <div className="card space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-slate-700">Base da previsão</span>
          <div role="group" aria-label="Base da previsão" className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {([["fotografia", "Fotografia do mês"], ["historico", "Histórico (6 meses)"]] as const).map(([b, rotulo]) => (
              <button key={b} type="button" aria-pressed={baseEfetiva === b}
                disabled={b === "fotografia" && dados !== null && !dados.temFotografia}
                onClick={() => trocarBase(b)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40 ${baseEfetiva === b ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-200"}`}>
                {rotulo}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-slate-500">
          {baseEfetiva === "fotografia"
            ? "O que você planejou na Fotografia do mês, mais as parcelas em andamento. O histórico aparece em cada linha só para comparar."
            : "Média dos últimos 6 meses fechados de cada categoria com gasto recente (as parcelas saem da média e entram à parte)."}
          {dados && !dados.temFotografia && <> Sem Fotografia do mês — <Link href="/planejamento" className="text-blue-600 hover:underline">fazer agora</Link>.</>}
        </p>
      </div>

      {carregando ? (
        <div className="flex justify-center py-20"><div className="spinner" /></div>
      ) : (
        <>
          <div className="card">
            <h2 className="font-semibold text-slate-700 mb-3">Resumo por Mês</h2>
            <div className="flex flex-wrap gap-3">
              {Object.entries(totalPorMes).sort((a, b) => compararMes(a[0], b[0])).map(([mes, total]) => (
                <button key={mes} onClick={() => setFiltroMes(filtroMes === mes ? "" : mes)}
                  className={`p-3 rounded-lg border-2 text-left min-w-28 transition-all ${filtroMes === mes ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"}`}>
                  <div className="text-xs font-medium text-slate-500">{mes}</div>
                  <div className="font-bold text-slate-800 text-sm mt-0.5">{fmt(total)}</div>
                </button>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between text-sm">
              <span className="text-slate-500">Total previsto ({filtrado.length} itens)</span>
              <span className="font-bold text-slate-800">{fmt(totalGeral)}</span>
            </div>
          </div>

          {dados!.foraDaFotografia.length > 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 text-sm space-y-1">
              <div className="font-medium text-amber-900">Gastos recentes fora da Fotografia (não entram na soma)</div>
              <div className="text-amber-800 flex flex-wrap gap-x-4 gap-y-1">
                {dados!.foraDaFotografia.map((f) => (
                  <span key={f.categoria}>{f.categoria} <span className="text-amber-700">~{fmt(f.historico)}/mês</span></span>
                ))}
              </div>
              <div className="text-xs text-amber-700">
                Se forem recorrentes, inclua na <Link href="/planejamento" className="underline">Fotografia</Link>; se acabaram, marque como encerradas.
              </div>
            </div>
          )}

          {dados!.encerradas.length > 0 && (
            <div className="text-xs text-slate-500 flex flex-wrap gap-2 items-center">
              Encerradas (valem zero):
              {dados!.encerradas.map((c) => (
                <button key={c} onClick={() => encerrar(c, false)} className="badge bg-slate-100 text-slate-600 hover:bg-slate-200" title="Reativar">
                  {c} ↺
                </button>
              ))}
            </div>
          )}

          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Mês</th><th>Descrição</th><th>Categoria</th>
                    <th className="text-right">Valor</th><th>Tipo</th><th>Comparação</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtrado.length === 0 ? (
                    <tr><td colSpan={7} className="text-center text-slate-400 py-8">Nenhuma previsão encontrada</td></tr>
                  ) : (
                    filtrado.map((item, i) => {
                      const key = rowKey(item, i);
                      const aberto = expandido === key;
                      const temHistorico = !!item.historico && item.historico.length > 0;
                      const { planejado, historico } = item.referencia;
                      return (
                        <Fragment key={key}>
                          <tr className={aberto ? "bg-slate-50" : ""}>
                            <td className="font-medium text-slate-700 whitespace-nowrap">{item.mes}</td>
                            <td className="max-w-xs">
                              {temHistorico ? (
                                <button onClick={() => setExpandido(aberto ? null : key)}
                                  className="flex items-center gap-1.5 text-left hover:text-blue-600 transition-colors group" title="Ver os meses usados na média">
                                  <span className={`text-xs text-slate-400 group-hover:text-blue-400 transition-transform ${aberto ? "rotate-90" : ""}`}>▶</span>
                                  <span className="truncate">{item.descricao}</span>
                                </button>
                              ) : <span className="text-slate-600 truncate block">{item.descricao}</span>}
                              <div className="text-xs text-slate-400">{item.detalhe}</div>
                            </td>
                            <td><span className="badge bg-blue-50 text-blue-700">{item.categoria}</span></td>
                            <td className="text-right font-medium valor-negativo whitespace-nowrap">{fmt(item.valor)}</td>
                            <td><span className={`badge ${COR_TIPO[item.tipoPrevisao] ?? ""}`}>{item.tipoPrevisao}</span></td>
                            <td className="text-xs text-slate-500 whitespace-nowrap">
                              {item.tipoPrevisao !== "Parcelamento" && (
                                <>
                                  {planejado != null && <div>planejado {fmt(planejado)}</div>}
                                  {historico != null && <div>histórico {fmt(historico)}</div>}
                                </>
                              )}
                            </td>
                            <td>
                              <button onClick={() => encerrar(item.categoria, true)} className="text-xs text-slate-400 hover:text-red-600 whitespace-nowrap"
                                title="Esse gasto acabou: tirar a categoria da previsão">encerrar</button>
                            </td>
                          </tr>
                          {aberto && temHistorico && (
                            <tr className="bg-slate-50">
                              <td colSpan={7} className="px-8 py-3">
                                <div className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Meses usados na média</div>
                                <HistoricoChart historico={item.historico!} media={item.valor} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
