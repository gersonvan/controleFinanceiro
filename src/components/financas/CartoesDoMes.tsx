"use client";
// Cartões mensais do Dashboard: como você pagou (com a linha do custo de dívida) e
// o ritmo do mês dia a dia (aberto pelo resumo do mês).
import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MEIOS } from "@/lib/financas";
import { MEIO_INFO, fmtInteiro, mesLongo, type RespostaDivida, type RespostaMeios, type RespostaRitmo } from "./comum";

/** Divisão dos gastos do mês por meio de pagamento; o detalhe de 6 meses fica em /financas/meios. */
export function ComoVocePagou({ dados, divida, query }: { dados: RespostaMeios; divida: RespostaDivida | null; query: string }) {
  const { atual } = dados;
  const linhas = MEIOS.map((m) => ({ meio: m, valor: atual.porMeio[m] })).filter((l) => l.valor > 0).sort((a, b) => b.valor - a.valor);
  const pct = (v: number) => (atual.total > 0 ? Math.round((v / atual.total) * 100) : 0);
  return (
    <section className="card flex flex-col gap-3" aria-labelledby="t-meio" data-como-pagou>
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 id="t-meio" className="font-semibold text-slate-700">Como você pagou</h2>
        <Link href={`/financas/meios${query}`} className="text-sm text-blue-600 hover:underline">Últimos 6 meses →</Link>
      </div>
      {atual.total === 0 ? (
        <p className="text-sm text-slate-500 py-2">Nenhum gasto registrado neste mês.</p>
      ) : (
        <>
          <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5" role="img"
            aria-label={`Gastos por meio de pagamento: ${linhas.map((l) => `${MEIO_INFO[l.meio].nome} ${pct(l.valor)}%`).join(", ")}`}>
            {linhas.map((l) => <div key={l.meio} style={{ width: `${(l.valor / atual.total) * 100}%`, background: MEIO_INFO[l.meio].cor }} />)}
          </div>
          <ul className="flex flex-col gap-1.5 text-sm">
            {linhas.map((l) => (
              <li key={l.meio} className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: MEIO_INFO[l.meio].cor }} aria-hidden />
                <span className="text-slate-700 truncate">{MEIO_INFO[l.meio].nome}</span>
                <span className="ml-auto font-medium text-slate-800 whitespace-nowrap">{fmtInteiro(l.valor)}</span>
                <span className="text-xs text-slate-500 w-8 text-right">{pct(l.valor)}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {divida && (
        divida.total === 0 ? (
          <p className="text-xs text-emerald-700 flex items-center gap-1.5 pt-2 border-t border-slate-100" data-divida>
            <CircleCheck size={14} aria-hidden /> Sem juros, IOF ou multas nos últimos 12 meses.
          </p>
        ) : (
          <p className="text-xs text-red-700 flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-slate-100" data-divida>
            <span>Custo de dívida: <strong>{fmtInteiro(divida.total)}</strong> em juros, IOF e multas nos últimos 12 meses.</span>
            <Link href={`/financas/divida${query}`} className="text-blue-600 hover:underline whitespace-nowrap">Ver detalhes →</Link>
          </p>
        )
      )}
    </section>
  );
}

export function RitmoDoMes({ dados, chave }: { dados: RespostaRitmo; chave: string }) {
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
