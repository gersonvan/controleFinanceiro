"use client";
// Cartão do Dashboard: a regra 50/30/20 no mês (lib/fatias.ts). Cada fatia é uma
// barra da renda com a meta marcada; o status vem em texto com ícone, não só cor.
// O que ficou sem fatia (sem categoria, Pix para pessoas) vai para o "Fique de olho".
import { useState } from "react";
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
  const { nome, alvo } = INFO_FATIA[fatia];
  const ok = dentroDaMeta(fatia, percentual);
  const largura = Math.max(0, Math.min(percentual ?? 0, 100));
  const meta = fatia === "futuro" ? `${alvo}% ou mais` : `até ${alvo}%`;
  return (
    <div className="space-y-1" data-fatia={fatia}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-slate-700"><span className="font-medium text-slate-800">{nome}</span> <span className="text-xs text-slate-500">· {meta}</span></span>
        <span className={`whitespace-nowrap ${ok === false ? "text-amber-700" : "text-slate-700"}`}>
          <span className="font-semibold">{fmtInteiro(valor)}</span> · {pct(percentual)}
        </span>
      </div>
      {/* barra da renda: preenchido = a fatia; o traço é a meta */}
      <div className="relative h-2 rounded-full bg-slate-100" title={`${nome}: ${pct(percentual)} da renda (meta ${meta})`}
        role="img" aria-label={`${nome}: ${pct(percentual)} da renda; meta ${meta}`}>
        <div className={`absolute inset-y-0 left-0 rounded-full ${ok === false ? "bg-amber-600" : "bg-blue-600"}`} style={{ width: `${largura}%` }} />
        <div className="absolute -inset-y-1 w-0.5 bg-slate-500" style={{ left: `${alvo}%` }} aria-hidden />
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
        {ok !== null && (
          <span className={`inline-flex items-center gap-1 ${ok ? "text-emerald-700" : "text-amber-700"}`}>
            {ok ? <CircleCheck size={13} aria-hidden /> : <TriangleAlert size={13} aria-hidden />}
            {ok ? "dentro da meta" : `${fatia === "futuro" ? "abaixo" : "acima"} da meta`}
          </span>
        )}
        {children}
      </div>
    </div>
  );
}

export default function DivisaoDoMes({ dados }: { dados: RespostaFatias }) {
  const [detalhe, setDetalhe] = useState(false);
  const { renda, necessidades, desejos, futuro } = dados;
  const vazio = renda === 0 && necessidades.valor === 0 && desejos.valor === 0;

  return (
    <section className="card flex flex-col gap-3" aria-labelledby="t-fatias" data-divisao-mes>
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 id="t-fatias" className="font-semibold text-slate-700">50/30/20 da renda</h2>
        {!vazio && <span className="text-xs text-slate-500">renda de {fmtInteiro(renda)} em {mesLongo(dados.mes)}</span>}
      </div>

      {vazio ? (
        <p className="text-sm text-slate-500 py-2">Nenhuma entrada nem gasto registrado neste mês.</p>
      ) : (
        <>
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
              {futuro.naConta >= 0 ? <>ficou na conta {fmtInteiro(futuro.naConta)}</> : <span className="text-amber-700">faltaram {fmtInteiro(-futuro.naConta)}</span>}
            </span>
          </Linha>

          <button className="text-sm text-blue-600 hover:underline self-start" onClick={() => setDetalhe((v) => !v)} aria-expanded={detalhe}>
            {detalhe ? "Esconder categorias" : "Ver categorias de cada fatia"}
          </button>
          {detalhe && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" data-detalhe-fatias>
              {([["necessidades", necessidades.categorias], ["desejos", desejos.categorias], ["futuro", futuro.categorias]] as const).map(([f, cats]) => (
                <div key={f}>
                  <div className="text-xs font-medium text-slate-500 mb-1">{INFO_FATIA[f].nome}</div>
                  {cats.length === 0 ? <div className="text-xs text-slate-500">—</div> : (
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
        </>
      )}
    </section>
  );
}
