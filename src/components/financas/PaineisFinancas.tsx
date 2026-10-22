"use client";
// Cartões do Dashboard: como você pagou, 50/30/20, ritmo do mês e custo de dívida.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MEIOS } from "@/lib/financas";
import {
  COR_DIVIDA, DICA_ORIGEM, MEIO_INFO, buscar, fmt, fmtInteiro, intervalo, mesCurto, mesLongo,
  type RespostaDivida, type RespostaMeios, type RespostaRitmo,
} from "./comum";
import DivisaoDoMes, { type RespostaFatias } from "./DivisaoDoMes";

interface Props { ano: number; mes: number }

export default function PaineisFinancas({ ano, mes }: Props) {
  const [meios, setMeios] = useState<RespostaMeios | null>(null);
  const [ritmo, setRitmo] = useState<RespostaRitmo | null>(null);
  const [divida, setDivida] = useState<RespostaDivida | null>(null);
  const [fatias, setFatias] = useState<RespostaFatias | null>(null);

  useEffect(() => {
    let ativo = true;
    void Promise.all([
      buscar<RespostaMeios>("/api/financas/meios", ano, mes),
      buscar<RespostaRitmo>("/api/financas/ritmo", ano, mes),
      buscar<RespostaDivida>("/api/financas/divida", ano, mes),
      buscar<RespostaFatias>("/api/financas/fatias", ano, mes),
    ]).then(([a, b, c, d]) => {
      if (!ativo) return;
      setMeios(a); setRitmo(b); setDivida(c); setFatias(d);
    });
    return () => { ativo = false; };
  }, [ano, mes]);

  const chave = `${ano}-${String(mes).padStart(2, "0")}`;
  const query = `?ano=${ano}&mes=${mes}`;

  return (
    <div className="space-y-6">
      {meios && <ComoVocePagou dados={meios} chave={chave} query={query} />}
      {fatias && <DivisaoDoMes dados={fatias} />}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {ritmo && <RitmoDoMes dados={ritmo} chave={chave} />}
        {divida && <CustoDivida dados={divida} chave={chave} query={query} />}
      </div>
    </div>
  );
}

function variacao(valor: number, media: number) {
  if (media < 1) return valor > 0 ? { texto: "novo", classe: "text-slate-500" } : null;
  const p = Math.round(((valor - media) / media) * 100);
  if (Math.abs(p) < 5) return { texto: "na média", classe: "text-slate-500" };
  return p > 0
    ? { texto: `↑ ${p}% da média`, classe: "text-red-600" }
    : { texto: `↓ ${-p}% da média`, classe: "text-emerald-600" };
}

function ComoVocePagou({ dados, chave, query }: { dados: RespostaMeios; chave: string; query: string }) {
  const { atual, media } = dados;
  const anteriores = dados.meses.slice(0, 5).filter((m) => m.total > 0).map((m) => m.mes);
  const linhas = MEIOS.map((m) => ({ meio: m, valor: atual.porMeio[m], media: media.porMeio[m] }))
    .filter((l) => l.valor > 0 || l.media > 0)
    .sort((a, b) => b.valor - a.valor);

  return (
    <section className="card" aria-labelledby="t-meio">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <h2 id="t-meio" className="font-semibold text-slate-700">Como você pagou em {mesLongo(chave)}</h2>
        <Link href={`/financas/meios${query}`} className="text-sm text-blue-600 hover:underline">Ver últimos 6 meses →</Link>
      </div>

      {atual.total === 0 && !atual.investido ? (
        <p className="text-sm text-slate-400 py-6 text-center">Nenhum gasto registrado neste mês.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-6">
          <div className="space-y-4 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl font-bold text-slate-800">{fmtInteiro(atual.total)}</span>
              <span className="text-sm text-slate-500">
                em gastos{anteriores.length > 0 && <> · média {intervalo(anteriores)} {fmtInteiro(media.total)}</>}
              </span>
            </div>

            {atual.total > 0 && (
              <div className="flex h-7 rounded-md overflow-hidden" role="img" aria-label="Divisão dos gastos por meio de pagamento">
                {linhas.filter((l) => l.valor > 0).map((l) => (
                  <div key={l.meio} style={{ width: `${(l.valor / atual.total) * 100}%`, background: MEIO_INFO[l.meio].cor }} />
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-x-4 gap-y-3">
              {linhas.map((l) => {
                const v = anteriores.length > 0 ? variacao(l.valor, l.media) : null;
                return (
                  <div key={l.meio}>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: MEIO_INFO[l.meio].cor }} />
                      {MEIO_INFO[l.meio].nome}
                    </div>
                    <div className="font-semibold text-slate-800">{fmtInteiro(l.valor)}</div>
                    <div className="text-xs text-slate-400">
                      {atual.total > 0 ? Math.round((l.valor / atual.total) * 100) : 0}% do total
                    </div>
                    {v && <div className={`text-xs ${v.classe}`}>{v.texto}</div>}
                  </div>
                );
              })}
            </div>
          </div>

          {atual.investido > 0 && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-4 self-start">
              <div className="text-sm text-emerald-800">Guardado no mês</div>
              <div className="text-xl font-bold text-emerald-700">{fmtInteiro(atual.investido)}</div>
              <p className="text-xs text-emerald-800/80 mt-1">
                Aportes e aplicações ficam fora dos gastos: é dinheiro que continua seu.
              </p>
            </div>
          )}
          {atual.investido < 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-100 p-4 self-start">
              <div className="text-sm text-amber-800">Resgatado da reserva</div>
              <div className="text-xl font-bold text-amber-700">{fmtInteiro(-atual.investido)}</div>
              <p className="text-xs text-amber-800/80 mt-1">
                Dinheiro guardado que voltou para a conta neste mês.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function RitmoDoMes({ dados, chave }: { dados: RespostaRitmo; chave: string }) {
  const hoje = dados.atual.length;
  const emAndamento = dados.projecao != null;
  const temMedia = dados.mesesNaMedia > 0;
  const serie = Array.from({ length: dados.dias }, (_, i) => {
    const dia = i + 1;
    const p: { dia: number; atual?: number; media?: number; projecao?: number } = { dia };
    if (dia <= hoje) p.atual = dados.atual[i];
    if (temMedia) p.media = dados.media[i];
    // projeção: parte do gasto de hoje e soma o que a média costuma gastar dali em diante
    if (emAndamento && temMedia && dia >= hoje && hoje > 0) {
      p.projecao = Math.round(dados.gastoAteHoje + dados.media[i] - dados.media[hoje - 1]);
    }
    return p;
  });

  let resumo: React.ReactNode;
  if (dados.gastoAteHoje === 0 && !temMedia) resumo = "Ainda sem saídas das contas neste mês.";
  else if (emAndamento && temMedia) {
    resumo = <>No ritmo normal dos próximos dias, {mesLongo(chave)} fecha em <strong>{fmtInteiro(dados.projecao!)}</strong> de saídas das contas — a média é {fmtInteiro(dados.mediaFim)}.</>;
  } else if (temMedia) {
    resumo = <>{mesLongo(chave)[0].toUpperCase() + mesLongo(chave).slice(1)} fechou em <strong>{fmtInteiro(dados.gastoAteHoje)}</strong> de saídas das contas — a média é {fmtInteiro(dados.mediaFim)}.</>;
  } else {
    resumo = <>Até agora, <strong>{fmtInteiro(dados.gastoAteHoje)}</strong> de saídas das contas. A comparação aparece quando houver meses anteriores importados.</>;
  }

  return (
    <section className="card flex flex-col gap-3" aria-labelledby="t-ritmo">
      <h2 id="t-ritmo" className="font-semibold text-slate-700">Ritmo do mês</h2>
      <p className="text-sm text-slate-600">{resumo}</p>
      <div className="h-56" role="img" aria-label={`Gasto acumulado dia a dia em ${mesLongo(chave)} comparado à média dos meses anteriores`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="dia" tick={{ fontSize: 11 }} interval="preserveStartEnd" tickLine={false} />
            <YAxis tickFormatter={(v) => `${Math.round(v / 1000)}k`} tick={{ fontSize: 11 }} width={36} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v) => fmtInteiro(v as number)} labelFormatter={(d) => `Dia ${d}`} />
            <Line dataKey="media" name="Média" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
            <Line dataKey="atual" name={mesLongo(chave)} stroke="#2F3E8F" strokeWidth={2.5} dot={false} isAnimationActive={false} />
            <Line dataKey="projecao" name="Projeção" stroke="#2F3E8F" strokeWidth={2} strokeDasharray="2 4" dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex gap-4 flex-wrap text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-[#2F3E8F]" />{mesLongo(chave)}</span>
        {temMedia && <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-slate-400" />Média de {dados.mesesNaMedia} {dados.mesesNaMedia === 1 ? "mês" : "meses"}</span>}
        {emAndamento && temMedia && <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dotted border-[#2F3E8F]" />Projeção</span>}
      </div>
      <p className="text-xs text-slate-400">
        Pix, boletos e débito por dia. O cartão entra pela fatura ({fmtInteiro(dados.cartaoNoMes)} em {mesLongo(chave)}).
      </p>
    </section>
  );
}

function CustoDivida({ dados, chave, query }: { dados: RespostaDivida; chave: string; query: string }) {
  const barras = dados.serie.map((m) => ({ mes: mesCurto(m.mes), juros: m.juros, iof: m.iof, multas: m.multas }));
  const p = dados.principal;
  return (
    <section className="card flex flex-col gap-3" aria-labelledby="t-divida">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="t-divida" className="font-semibold text-slate-700">Custo de dívida</h2>
        {dados.total > 0 && <Link href={`/financas/divida${query}`} className="text-sm text-blue-600 hover:underline">Ver detalhes →</Link>}
      </div>
      {dados.total === 0 ? (
        <p className="text-sm text-slate-500 py-6">
          Nenhum juro, IOF ou multa nos últimos 12 meses. 👏
        </p>
      ) : (
        <>
          <div className="flex gap-8">
            <div>
              <div className="text-xs text-slate-500 capitalize">{mesLongo(chave)}</div>
              <div className={`text-xl font-bold ${dados.mes.total > 0 ? "text-red-700" : "text-slate-800"}`}>{fmt(dados.mes.total)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Últimos 12 meses</div>
              <div className="text-xl font-bold text-red-700">{fmtInteiro(dados.total)}</div>
            </div>
          </div>
          <div className="h-32" role="img" aria-label="Juros, IOF e multas por mês nos últimos 12 meses">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barras} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={0} />
                <Tooltip formatter={(v) => fmt(v as number)} />
                <Bar dataKey="juros" name="Juros" stackId="d" fill={COR_DIVIDA.juros} isAnimationActive={false} />
                <Bar dataKey="iof" name="IOF" stackId="d" fill={COR_DIVIDA.iof} isAnimationActive={false} />
                <Bar dataKey="multas" name="Multas e encargos" stackId="d" fill={COR_DIVIDA.multas} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {p && (
            <div className="rounded-lg bg-red-50 border border-red-100 p-3 text-sm text-red-900">
              <strong>{p.participacao}% vem de {p.origem.toLowerCase()} ({p.conta})</strong> — {fmtInteiro(p.total)} em{" "}
              {p.meses} {p.meses === 1 ? "mês" : "meses"}.{" "}
              {DICA_ORIGEM[p.origem] ?? ""}
            </div>
          )}
        </>
      )}
    </section>
  );
}
