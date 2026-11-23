"use client";
// O primeiro cartão do Dashboard: o saldo do período com entradas, saídas e o que
// foi guardado; no mês, as saídas contra o plano da Fotografia com a marca de hoje
// e onde o mês deve fechar no ritmo normal; no ano, a média por mês.
import Link from "next/link";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { DadosDashboard } from "@/lib/dashboard";
import { fmt, fmtInteiro } from "@/components/financas/comum";

const comSinal = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmt(Math.abs(v))}`;

interface Props {
  titulo: string;                  // "novembro até agora", "outubro", "2026"
  dados: DadosDashboard;
  mesAberto: boolean;              // um mês escolhido (não o ano todo)
  progressoDoMes: number | null;   // 0–1, só no mês corrente
  diaDeHoje: string | null;        // "dia 23"
  plano: { planejado: number; realizado: number; totalLancamentos: number } | null;
  fotografiaFeita: boolean | null;
  projecao: number | null;         // onde as saídas devem fechar
  ritmoAberto: boolean;
  onRitmo: (() => void) | null;
}

export default function ResumoDoPeriodo({ titulo, dados, mesAberto, progressoDoMes, diaDeHoje, plano, fotografiaFeita, projecao, ritmoAberto, onRitmo }: Props) {
  const { saldo, totalEntradas, totalSaidas, investido } = dados;
  const extra = investido > 0 ? { rotulo: "Guardado", valor: investido, nota: "fora das saídas", classe: "text-slate-800" }
    : investido < 0 ? { rotulo: "Resgatado", valor: -investido, nota: "cobriu gastos", classe: "text-amber-700" } : null;

  return (
    <section className="card grid grid-cols-1 lg:grid-cols-2 gap-7" aria-labelledby="t-resumo" data-resumo-periodo>
      <div className="flex flex-col gap-4">
        <div>
          <h2 id="t-resumo" className="text-sm font-medium text-slate-500">Saldo de {titulo}</h2>
          <p className={`text-4xl font-bold mt-1 ${saldo > 0 ? "text-emerald-700" : saldo < 0 ? "text-red-700" : "text-slate-800"}`} data-saldo>{comSinal(saldo)}</p>
          <p className="text-sm text-slate-500 mt-0.5">
            {saldo > 0 ? "Entrou mais do que saiu." : saldo < 0 ? "Saiu mais do que entrou." : "Entrou o mesmo que saiu."}
          </p>
        </div>
        <dl className={`grid ${extra ? "grid-cols-3" : "grid-cols-2"} gap-3 pt-4 border-t border-slate-100`}>
          <div><dt className="text-xs text-slate-500">Entradas</dt><dd className="text-base font-semibold text-emerald-700" data-entradas>{fmt(totalEntradas)}</dd></div>
          <div><dt className="text-xs text-slate-500">Saídas</dt><dd className="text-base font-semibold text-red-700" data-saidas>{fmt(totalSaidas)}</dd></div>
          {extra && (
            <div><dt className="text-xs text-slate-500">{extra.rotulo}</dt><dd className={`text-base font-semibold ${extra.classe}`}>{fmt(extra.valor)}</dd>
              <dd className="text-xs text-slate-500">{extra.nota}</dd></div>
          )}
        </dl>
      </div>

      <div className="flex flex-col gap-2.5 justify-center">
        {mesAberto ? (
          fotografiaFeita === false ? <SemFotografia /> : plano && plano.planejado > 0 ? (
            <ContraOPlano plano={plano} progressoDoMes={progressoDoMes} diaDeHoje={diaDeHoje} projecao={projecao} />
          ) : null
        ) : <MediaPorMes dados={dados} />}
        {onRitmo && (
          <button className="text-sm text-blue-600 hover:underline self-start" onClick={onRitmo} aria-expanded={ritmoAberto}>
            {ritmoAberto ? "Esconder o ritmo dia a dia" : "Ver o ritmo dia a dia"}
          </button>
        )}
      </div>
    </section>
  );
}

function ContraOPlano({ plano, progressoDoMes, diaDeHoje, projecao }: { plano: NonNullable<Props["plano"]>; progressoDoMes: number | null; diaDeHoje: string | null; projecao: number | null }) {
  const { planejado, realizado, totalLancamentos } = plano;
  const pct = Math.round((realizado / planejado) * 100);
  const passou = realizado > planejado;
  const fecha = projecao ?? (progressoDoMes === null ? realizado : null); // mês passado: fechou no realizado
  const dif = fecha === null ? null : fecha - planejado;
  return (
    <div className="flex flex-col gap-2.5" data-plano>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700">Saídas × plano da Fotografia</h3>
        <span className={`text-sm font-semibold ${passou ? "text-red-700" : "text-slate-800"}`}>{pct}%</span>
      </div>
      <div className="relative h-3 rounded-full bg-slate-100" role="img"
        aria-label={`Saídas: ${pct}% do planejado${progressoDoMes !== null ? `; o mês está em ${Math.round(progressoDoMes * 100)}%` : ""}`}>
        <div className={`absolute inset-y-0 left-0 rounded-full ${passou ? "bg-red-600" : "bg-blue-600"}`} style={{ width: `${Math.min(pct, 100)}%` }} />
        {progressoDoMes !== null && <div className="absolute -inset-y-1 w-0.5 bg-slate-800" style={{ left: `${progressoDoMes * 100}%` }} aria-hidden />}
      </div>
      <div className="flex justify-between gap-2 text-xs text-slate-500">
        <span>{totalLancamentos === 0 ? `Planejado ${fmt(planejado)} · nenhum lançamento ainda` : `${fmt(realizado)} de ${fmt(planejado)}`}</span>
        {progressoDoMes !== null && diaDeHoje && <span>▲ hoje, {diaDeHoje}</span>}
      </div>
      {dif !== null && totalLancamentos > 0 && (
        <p className={`flex gap-2 items-start text-sm rounded-lg px-3 py-2 border ${dif > 0 ? "bg-amber-50 border-amber-100 text-amber-800" : "bg-emerald-50 border-emerald-100 text-emerald-800"}`} data-projecao>
          {dif > 0 ? <TrendingUp size={16} className="shrink-0 mt-0.5" aria-hidden /> : <TrendingDown size={16} className="shrink-0 mt-0.5" aria-hidden />}
          <span>
            {projecao !== null ? <>No ritmo normal dos próximos dias, fecha perto de <strong>{fmtInteiro(fecha!)}</strong>: </> : <>Fechou em <strong>{fmtInteiro(fecha!)}</strong>: </>}
            {dif > 0 ? `${fmtInteiro(dif)} acima do plano.` : `${fmtInteiro(-dif)} dentro do plano.`}
          </span>
        </p>
      )}
      <Link href="/planejamento?aba=comparacao" className="text-sm text-blue-600 hover:underline self-start">Ver Planejado × Realizado →</Link>
    </div>
  );
}

function SemFotografia() {
  return (
    <div className="rounded-lg bg-blue-50 border border-blue-100 p-4 flex flex-col gap-2" data-sem-fotografia>
      <h3 className="text-sm font-semibold text-blue-900">Faça sua Fotografia do mês</h3>
      <p className="text-sm text-blue-900">Cinco minutos para registrar o que entra, o que sai e quanto sobra. Aqui você passa a ver as saídas contra o plano.</p>
      <Link href="/planejamento" className="btn btn-primary self-start">Começar</Link>
    </div>
  );
}

function MediaPorMes({ dados }: { dados: DadosDashboard }) {
  const meses = dados.porMes.filter((m) => m.entradas > 0 || m.saidas > 0);
  if (meses.length === 0) return null;
  const media = (f: (m: (typeof meses)[number]) => number) => meses.reduce((a, m) => a + f(m), 0) / meses.length;
  return (
    <div className="flex flex-col gap-2" data-media-mes>
      <h3 className="text-sm font-semibold text-slate-700">Média por mês</h3>
      <dl className="grid grid-cols-2 gap-3">
        <div><dt className="text-xs text-slate-500">Entradas</dt><dd className="text-base font-semibold text-emerald-700">{fmtInteiro(media((m) => m.entradas))}</dd></div>
        <div><dt className="text-xs text-slate-500">Saídas</dt><dd className="text-base font-semibold text-red-700">{fmtInteiro(media((m) => m.saidas))}</dd></div>
      </dl>
      <p className="text-xs text-slate-500">{meses.length} {meses.length === 1 ? "mês" : "meses"} com lançamentos. Escolha um mês para ver o plano, o 50/30/20 e como você pagou.</p>
    </div>
  );
}
