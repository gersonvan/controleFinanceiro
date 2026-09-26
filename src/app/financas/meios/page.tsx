"use client";
import { Suspense, useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MEIOS } from "@/lib/financas";
import { MEIO_INFO, buscar, fmtInteiro, intervalo, mesCurto, type RespostaMeios } from "@/components/financas/comum";
import NavegadorMes, { usePeriodoDaUrl } from "@/components/financas/NavegadorMes";

export default function MeiosPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><div className="spinner" /></div>}>
      <Meios />
    </Suspense>
  );
}

function Meios() {
  const { ano, mes } = usePeriodoDaUrl();
  const [dados, setDados] = useState<RespostaMeios | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    void buscar<RespostaMeios>("/api/financas/meios", ano, mes).then((d) => {
      if (ativo) { setDados(d); setCarregando(false); }
    });
    return () => { ativo = false; };
  }, [ano, mes]);

  const anteriores = dados?.meses.slice(0, 5).filter((m) => m.total > 0).map((m) => m.mes) ?? [];
  const barras = dados?.meses.map((m) => ({ mes: mesCurto(m.mes), total: m.total, ...m.porMeio })) ?? [];

  return (
    <div className="space-y-6 max-w-6xl">
      <NavegadorMes
        ano={ano} mes={mes} titulo="Como você pagou"
        descricao="Gastos por meio de pagamento nos últimos 6 meses. Transferências entre suas contas, pagamento de fatura, aplicações e despesas da empresa ficam de fora. O cartão conta no mês da fatura."
      />

      {carregando ? (
        <div className="flex justify-center py-20"><div className="spinner" /></div>
      ) : !dados ? (
        <div className="card text-sm text-red-600">Não foi possível carregar os dados.</div>
      ) : (
        <>
          <section className="card" aria-labelledby="t-graf">
            <h2 id="t-graf" className="font-semibold text-slate-700 mb-3">Por mês</h2>
            <div className="flex gap-4 flex-wrap text-xs text-slate-600 mb-3">
              {MEIOS.map((m) => (
                <span key={m} className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm" style={{ background: MEIO_INFO[m].cor }} />{MEIO_INFO[m].nome}
                </span>
              ))}
            </div>
            <div className="h-72" role="img" aria-label="Barras empilhadas de gastos por meio de pagamento nos últimos 6 meses">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barras} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 12 }} tickLine={false} />
                  <YAxis tickFormatter={(v) => `${Math.round(v / 1000)}k`} tick={{ fontSize: 11 }} width={40} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => fmtInteiro(v as number)} />
                  {MEIOS.map((m, i) => (
                    <Bar key={m} dataKey={m} name={MEIO_INFO[m].nome} stackId="meio" fill={MEIO_INFO[m].cor}
                      radius={i === MEIOS.length - 1 ? [3, 3, 0, 0] : undefined} isAnimationActive={false} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="card" aria-labelledby="t-tab">
            <h2 id="t-tab" className="font-semibold text-slate-700 mb-3">Valores</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="text-slate-500 text-left border-b border-slate-200">
                    <th scope="col" className="font-medium py-2 pr-4">Meio</th>
                    {dados.meses.map((m) => <th key={m.mes} scope="col" className="font-medium py-2 px-2 text-right capitalize">{mesCurto(m.mes)}</th>)}
                    <th scope="col" className="font-medium py-2 pl-3 text-right whitespace-nowrap">Média {intervalo(anteriores)}</th>
                  </tr>
                </thead>
                <tbody>
                  {MEIOS.map((meio) => (
                    <tr key={meio} className="border-b border-slate-100">
                      <th scope="row" className="font-normal text-left py-2 pr-4 whitespace-nowrap">
                        <span className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: MEIO_INFO[meio].cor }} />{MEIO_INFO[meio].nome}
                        </span>
                      </th>
                      {dados.meses.map((m) => (
                        <td key={m.mes} className="py-2 px-2 text-right text-slate-700">{m.porMeio[meio] ? fmtInteiro(m.porMeio[meio]) : "—"}</td>
                      ))}
                      <td className="py-2 pl-3 text-right text-slate-500">{fmtInteiro(dados.media.porMeio[meio])}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold text-slate-800">
                    <th scope="row" className="text-left py-2 pr-4">Total</th>
                    {dados.meses.map((m) => <td key={m.mes} className="py-2 px-2 text-right">{fmtInteiro(m.total)}</td>)}
                    <td className="py-2 pl-3 text-right">{fmtInteiro(dados.media.total)}</td>
                  </tr>
                  {dados.meses.some((m) => m.investido > 0) && (
                    <tr className="text-emerald-700 border-t border-slate-200">
                      <th scope="row" className="font-normal text-left py-2 pr-4">Guardado</th>
                      {dados.meses.map((m) => <td key={m.mes} className="py-2 px-2 text-right">{m.investido ? fmtInteiro(m.investido) : "—"}</td>)}
                      <td />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-400 mt-3">
              Nas contas correntes, o meio vem da descrição: Pix, compra no débito, juros/IOF/multas; o resto (boletos, débitos automáticos, tarifas) entra em &quot;Boletos e contas&quot;.
              Qual conta é cartão se ajusta em Configurações → Contas.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
