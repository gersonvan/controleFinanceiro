"use client";
// "Para onde foi o dinheiro": as saídas do período por categoria (as maiores e o
// resto somado) e, no pé, por conta.
import Link from "next/link";
import { fmt } from "@/components/financas/comum";

const MOSTRAR = 6;

export default function ParaOndeFoi({ periodo, porCategoria, porConta, total }: {
  periodo: string; porCategoria: [string, number][]; porConta: [string, number][]; total: number;
}) {
  const maiores = porCategoria.length > MOSTRAR + 1 ? porCategoria.slice(0, MOSTRAR) : porCategoria;
  const resto = porCategoria.slice(maiores.length);
  const restoTotal = resto.reduce((a, [, v]) => a + v, 0);
  const max = porCategoria[0]?.[1] || 1;
  const pct = (v: number) => (total > 0 ? `${Math.round((v / total) * 100)}%` : "");
  return (
    <section className="card flex flex-col gap-3" aria-labelledby="t-onde" data-para-onde-foi>
      <div>
        <h2 id="t-onde" className="font-semibold text-slate-700">Para onde foi o dinheiro</h2>
        <p className="text-xs text-slate-500 mt-0.5">Saídas de {periodo} por categoria</p>
      </div>
      {porCategoria.length === 0 ? <p className="text-sm text-slate-500 py-2">Nenhuma saída no período.</p> : (
        <ul className="flex flex-col gap-3">
          {maiores.map(([cat, v]) => <Barra key={cat} nome={cat} valor={v} pct={pct(v)} largura={(v / max) * 100} />)}
          {resto.length > 0 && (
            <Barra nome={`Outras ${resto.length} categorias`} valor={restoTotal} pct={pct(restoTotal)} largura={(restoTotal / max) * 100} discreta />
          )}
        </ul>
      )}
      {porConta.length > 1 && (
        <p className="text-xs text-slate-500 pt-2 border-t border-slate-100" data-por-conta>
          Por conta: {porConta.map(([c, v]) => `${c} ${fmt(v)}`).join(" · ")}
        </p>
      )}
      <Link href="/matriz" className="text-sm text-blue-600 hover:underline self-start">Ver todas na Matriz →</Link>
    </section>
  );
}

function Barra({ nome, valor, pct, largura, discreta }: { nome: string; valor: number; pct: string; largura: number; discreta?: boolean }) {
  return (
    <li>
      <div className={`flex justify-between gap-3 text-sm ${discreta ? "text-slate-500" : "text-slate-700"}`}>
        <span className="truncate">{nome}</span>
        <span className="whitespace-nowrap"><span className={discreta ? "" : "font-medium text-slate-800"}>{fmt(valor)}</span> <span className="text-xs text-slate-500">{pct}</span></span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-slate-100">
        <div className={`h-1.5 rounded-full ${discreta ? "bg-slate-400" : "bg-blue-500"}`} style={{ width: `${Math.min(largura, 100)}%` }} />
      </div>
    </li>
  );
}
