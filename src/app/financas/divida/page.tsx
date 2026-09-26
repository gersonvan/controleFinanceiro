"use client";
import { Suspense, useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { COR_DIVIDA, DICA_ORIGEM, buscar, fmt, fmtInteiro, mesCurto, mesLongo, type RespostaDivida } from "@/components/financas/comum";
import NavegadorMes, { usePeriodoDaUrl } from "@/components/financas/NavegadorMes";

export default function DividaPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><div className="spinner" /></div>}>
      <Divida />
    </Suspense>
  );
}

function Divida() {
  const { ano, mes } = usePeriodoDaUrl();
  const [dados, setDados] = useState<RespostaDivida | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    void buscar<RespostaDivida>("/api/financas/divida", ano, mes).then((d) => {
      if (ativo) { setDados(d); setCarregando(false); }
    });
    return () => { ativo = false; };
  }, [ano, mes]);

  const maiorMes = dados?.serie.reduce((a, m) => (m.total > a.total ? m : a), dados.serie[0]);

  return (
    <div className="space-y-6 max-w-6xl">
      <NavegadorMes
        ano={ano} mes={mes} titulo="Custo de dívida"
        descricao="Juros, IOF e multas pagos por usar crédito — cheque especial, rotativo e atraso de fatura — nos 12 meses até o mês escolhido. Devoluções do banco já descontadas."
      />

      {carregando ? (
        <div className="flex justify-center py-20"><div className="spinner" /></div>
      ) : !dados ? (
        <div className="card text-sm text-red-600">Não foi possível carregar os dados.</div>
      ) : dados.total === 0 ? (
        <div className="card text-center py-12 text-slate-500">Nenhum juro, IOF ou multa nesses 12 meses. 👏</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card">
              <div className="text-sm text-slate-500">Últimos 12 meses</div>
              <div className="text-2xl font-bold text-red-700">{fmtInteiro(dados.total)}</div>
              <div className="text-xs text-slate-500">≈ {fmtInteiro(dados.total / 12)} por mês</div>
            </div>
            <div className="card">
              <div className="text-sm text-slate-500">Meses com custo</div>
              <div className="text-2xl font-bold text-slate-800">{dados.mesesComCusto} de 12</div>
              {dados.principal && <div className="text-xs text-slate-500">{dados.principal.origem.toLowerCase()} em {dados.principal.meses}</div>}
            </div>
            {maiorMes && (
              <div className="card">
                <div className="text-sm text-slate-500">Maior mês</div>
                <div className="text-2xl font-bold text-slate-800">{fmtInteiro(maiorMes.total)}</div>
                <div className="text-xs text-slate-500">{mesLongo(maiorMes.mes)} de {maiorMes.mes.slice(0, 4)}</div>
              </div>
            )}
          </div>

          <section className="card" aria-labelledby="t-mes">
            <h2 id="t-mes" className="font-semibold text-slate-700 mb-3">Mês a mês</h2>
            <div className="flex gap-4 flex-wrap text-xs text-slate-600 mb-3">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: COR_DIVIDA.juros }} />Juros</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: COR_DIVIDA.iof }} />IOF</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: COR_DIVIDA.multas }} />Multas e encargos</span>
            </div>
            <div className="h-64" role="img" aria-label="Juros, IOF e multas por mês nos últimos 12 meses">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dados.serie.map((m) => ({ ...m, rotulo: mesCurto(m.mes) }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} tickLine={false} interval={0} />
                  <YAxis tickFormatter={(v) => `R$${v}`} tick={{ fontSize: 11 }} width={48} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => fmt(v as number)} />
                  <Bar dataKey="juros" name="Juros" stackId="d" fill={COR_DIVIDA.juros} isAnimationActive={false} />
                  <Bar dataKey="iof" name="IOF" stackId="d" fill={COR_DIVIDA.iof} isAnimationActive={false} />
                  <Bar dataKey="multas" name="Multas e encargos" stackId="d" fill={COR_DIVIDA.multas} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="card" aria-labelledby="t-origem">
              <h2 id="t-origem" className="font-semibold text-slate-700 mb-2">De onde vem</h2>
              {dados.porOrigem.map((o) => (
                <div key={`${o.origem}|${o.conta}`} className="flex justify-between gap-3 py-2 border-b border-slate-100 last:border-0 text-sm">
                  <span>{o.origem} <span className="text-slate-400">· {o.conta} · {o.meses} {o.meses === 1 ? "mês" : "meses"}</span></span>
                  <strong className="tabular-nums">{fmt(o.total)}</strong>
                </div>
              ))}
              <h3 className="text-sm font-medium text-slate-500 mt-5 mb-1">Maiores lançamentos</h3>
              {dados.maiores.map((c) => (
                <div key={c.descricao} className="flex justify-between gap-3 py-1.5 text-sm text-slate-600">
                  <span className="truncate">{c.descricao} <span className="text-slate-400">· {c.vezes}×</span></span>
                  <span className="tabular-nums shrink-0">{fmt(c.total)}</span>
                </div>
              ))}
            </section>

            {dados.principal && (
              <section className="rounded-xl bg-red-50 border border-red-100 p-6 space-y-2 self-start" aria-labelledby="t-acao">
                <h2 id="t-acao" className="font-semibold text-red-900">O que fazer</h2>
                <p className="text-sm text-red-900 leading-relaxed">
                  {dados.principal.participacao}% do custo é {dados.principal.origem.toLowerCase()} ({dados.principal.conta}):{" "}
                  {fmt(dados.principal.total)} em {dados.principal.meses} {dados.principal.meses === 1 ? "mês" : "meses"}.
                </p>
                {DICA_ORIGEM[dados.principal.origem] && (
                  <p className="text-sm text-red-900 leading-relaxed">{DICA_ORIGEM[dados.principal.origem]}</p>
                )}
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}
