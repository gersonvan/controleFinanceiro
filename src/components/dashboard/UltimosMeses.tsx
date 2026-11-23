"use client";
// Entradas × saídas mês a mês (no mês: ele e os 5 anteriores; no ano: o ano). O
// mês corrente aparece tracejado: ainda não fechou. Embaixo, numa frase, os meses
// em que saiu mais do que entrou e a média de saídas dos meses fechados.
import type { MesEntradasSaidas } from "@/lib/dashboard";
import { fmt, fmtInteiro, mesCurto, mesLongo } from "@/components/financas/comum";

export default function UltimosMeses({ titulo, meses, emAndamento }: { titulo: string; meses: MesEntradasSaidas[]; emAndamento: string | null }) {
  if (meses.length === 0) return null;
  const max = Math.max(...meses.flatMap((m) => [m.entradas, m.saidas]), 1);
  const fechados = meses.filter((m) => m.mes !== emAndamento && (m.entradas > 0 || m.saidas > 0));
  const noVermelho = fechados.filter((m) => m.saidas > m.entradas);
  const media = fechados.length ? fechados.reduce((a, m) => a + m.saidas, 0) / fechados.length : null;
  const altura = (v: number) => `${Math.max((v / max) * 100, v > 0 ? 2 : 0)}%`;
  const largura = meses.length > 6 ? "w-2.5 sm:w-4" : "w-3 sm:w-5";

  return (
    <section className="card flex flex-col gap-3" aria-labelledby="t-meses" data-ultimos-meses>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="t-meses" className="font-semibold text-slate-700">{titulo}</h2>
        <div className="flex gap-3 text-xs text-slate-600">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" aria-hidden />Entradas</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-500" aria-hidden />Saídas</span>
        </div>
      </div>
      <div role="img" aria-label={meses.map((m) => `${mesLongo(m.mes)}: entradas ${fmtInteiro(m.entradas)}, saídas ${fmtInteiro(m.saidas)}`).join("; ")}>
        <div className="grid gap-1 sm:gap-3 items-end h-36 border-b border-slate-200" style={{ gridTemplateColumns: `repeat(${meses.length}, minmax(0, 1fr))` }}>
          {meses.map((m) => {
            const parcial = m.mes === emAndamento;
            return (
              <div key={m.mes} className="flex justify-center items-end gap-0.5 sm:gap-1 h-full" title={`${mesLongo(m.mes)}: entradas ${fmt(m.entradas)} · saídas ${fmt(m.saidas)}${parcial ? " (até hoje)" : ""}`}>
                <div className={`${largura} rounded-t-sm bg-emerald-500`} style={{ height: altura(m.entradas) }} />
                <div className={`${largura} rounded-t-sm ${parcial ? "bg-red-200 border border-dashed border-red-500" : "bg-red-500"}`} style={{ height: altura(m.saidas) }} />
              </div>
            );
          })}
        </div>
        <div className="grid gap-1 sm:gap-3 mt-1 text-xs text-center" style={{ gridTemplateColumns: `repeat(${meses.length}, minmax(0, 1fr))` }}>
          {meses.map((m) => (
            <span key={m.mes} className={m.mes !== emAndamento && m.saidas > m.entradas ? "text-red-700 font-semibold" : "text-slate-500"}>
              {mesCurto(m.mes)}{m.mes === emAndamento ? "*" : ""}
            </span>
          ))}
        </div>
      </div>
      <p className="text-sm text-slate-600">
        {noVermelho.length > 0
          ? `Em ${noVermelho.map((m) => mesLongo(m.mes)).join(", ").replace(/, ([^,]*)$/, " e $1")} saiu mais do que entrou.`
          : fechados.length > 0 ? "Em nenhum mês fechado saiu mais do que entrou." : ""}
        {media !== null && ` Média de saídas: ${fmtInteiro(media)} por mês.`}
        {emAndamento && meses.some((m) => m.mes === emAndamento) && <span className="text-slate-500"> * mês em andamento.</span>}
      </p>
    </section>
  );
}
