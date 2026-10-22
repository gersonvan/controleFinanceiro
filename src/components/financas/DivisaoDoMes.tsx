"use client";
// Cartão do Dashboard: a regra 50/30/20 no mês (lib/fatias.ts). Cada fatia é uma
// barra da renda com a meta marcada; o status vem em texto com ícone, não só cor.
import { useState } from "react";
import Link from "next/link";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { INFO_FATIA, type DivisaoMes, type Fatia } from "@/lib/fatias";
import { fmtInteiro, mesLongo } from "./comum";

export type RespostaFatias = DivisaoMes & { mes: string };

const pct = (p: number | null) => (p === null ? "—" : `${p.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`);

/** Necessidades e desejos: até a meta; futuro: a meta ou mais. */
function dentroDaMeta(f: Fatia, p: number | null) {
  if (p === null) return null;
  const { alvo } = INFO_FATIA[f];
  return f === "futuro" ? p >= alvo : p <= alvo;
}

function Linha({ fatia, valor, percentual, children }: { fatia: Fatia; valor: number; percentual: number | null; children?: React.ReactNode }) {
  const { nome, alvo, ajuda } = INFO_FATIA[fatia];
  const ok = dentroDaMeta(fatia, percentual);
  const largura = Math.max(0, Math.min(percentual ?? 0, 100));
  const meta = fatia === "futuro" ? `${alvo}% ou mais` : `até ${alvo}%`;
  return (
    <div className="space-y-1.5" data-fatia={fatia}>
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="text-sm">
          <span className="font-medium text-slate-800">{nome}</span>
          <span className="text-xs text-slate-400 ml-2">{ajuda}</span>
        </div>
        <div className="text-sm text-slate-700 whitespace-nowrap">
          <span className="font-semibold">{fmtInteiro(valor)}</span> · {pct(percentual)}
        </div>
      </div>
      {/* barra da renda: preenchido = a fatia; o traço é a meta */}
      <div className="relative h-2.5 rounded-full bg-slate-100" title={`${nome}: ${pct(percentual)} da renda (meta ${meta})`}
        role="img" aria-label={`${nome}: ${pct(percentual)} da renda; meta ${meta}`}>
        <div className="absolute inset-y-0 left-0 rounded-full bg-blue-600" style={{ width: `${largura}%` }} />
        <div className="absolute -inset-y-1 w-0.5 bg-slate-500" style={{ left: `${alvo}%` }} aria-hidden />
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
        {ok === null ? <span className="text-slate-400">meta {meta}</span> : (
          <span className={`inline-flex items-center gap-1 ${ok ? "text-emerald-700" : "text-amber-700"}`}>
            {ok ? <CircleCheck size={13} aria-hidden /> : <TriangleAlert size={13} aria-hidden />}
            {ok ? `dentro da meta (${meta})` : `${fatia === "futuro" ? "abaixo" : "acima"} da meta (${meta})`}
          </span>
        )}
        {children}
      </div>
    </div>
  );
}

export default function DivisaoDoMes({ dados }: { dados: RespostaFatias }) {
  const [detalhe, setDetalhe] = useState(false);
  const { renda, necessidades, desejos, futuro, semFatia } = dados;
  const vazio = renda === 0 && necessidades.valor === 0 && desejos.valor === 0;

  return (
    <section className="card" aria-labelledby="t-fatias" data-divisao-mes>
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
        <h2 id="t-fatias" className="font-semibold text-slate-700">50/30/20 em {mesLongo(dados.mes)}</h2>
        {!vazio && (
          <button className="text-sm text-blue-600 hover:underline" onClick={() => setDetalhe((v) => !v)} aria-expanded={detalhe}>
            {detalhe ? "Esconder categorias" : "Ver categorias de cada fatia"}
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500 mb-4">
        Regra de bolso: até 50% da renda em necessidades, até 30% em desejos e pelo menos 20% para o futuro.
      </p>

      {vazio ? (
        <p className="text-sm text-slate-400 py-6 text-center">Nenhuma entrada nem gasto registrado neste mês.</p>
      ) : (
        <div className="space-y-5">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl font-bold text-slate-800">{fmtInteiro(renda)}</span>
            <span className="text-sm text-slate-500">de renda no mês (entradas, sem estornos nem empréstimos devolvidos)</span>
          </div>
          {renda === 0 && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Sem entradas neste mês, não dá para calcular os percentuais — importe o extrato da conta onde a renda cai.
            </p>
          )}

          <Linha fatia="necessidades" valor={necessidades.valor} percentual={necessidades.percentual} />
          <Linha fatia="desejos" valor={desejos.valor} percentual={desejos.percentual} />
          <Linha fatia="futuro" valor={Math.max(futuro.valor, 0)} percentual={futuro.percentual === null ? null : Math.max(futuro.percentual, 0)}>
            <span className="text-slate-500">
              aplicado {fmtInteiro(futuro.aplicado)} ·{" "}
              {futuro.naConta >= 0 ? <>ficou na conta {fmtInteiro(futuro.naConta)}</> : <span className="text-amber-700">faltaram {fmtInteiro(-futuro.naConta)} (gastou mais do que entrou)</span>}
            </span>
          </Linha>

          {semFatia.valor > 0 && (
            <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between gap-3 flex-wrap" data-sem-fatia>
              <span>{fmtInteiro(semFatia.valor)} em Pix para pessoas e lançamentos sem categoria não entraram em nenhuma fatia.</span>
              <Link href="/lancamentos/revisar" className="text-blue-600 hover:underline whitespace-nowrap">Revisar categorias →</Link>
            </p>
          )}

          {detalhe && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1" data-detalhe-fatias>
              {([["necessidades", necessidades.categorias], ["desejos", desejos.categorias], ["futuro", futuro.categorias]] as const).map(([f, cats]) => (
                <div key={f}>
                  <div className="text-xs font-medium text-slate-500 mb-1">{INFO_FATIA[f].nome}</div>
                  {cats.length === 0 ? <div className="text-xs text-slate-400">—</div> : (
                    <ul className="text-xs space-y-0.5">
                      {cats.map((c) => (
                        <li key={c.categoria} className="flex justify-between gap-2">
                          <span className="text-slate-700 truncate">{c.categoria}</span>
                          <span className="text-slate-500 whitespace-nowrap">{fmtInteiro(c.valor)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
