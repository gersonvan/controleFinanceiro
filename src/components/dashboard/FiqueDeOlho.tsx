"use client";
// "Fique de olho": os avisos do Dashboard numa lista só (lib/dashboard.ts,
// montarAvisos), do mais grave ao informativo. Sem avisos, o cartão não aparece.
import Link from "next/link";
import { CircleAlert, PiggyBank, Tag, Target, TriangleAlert } from "lucide-react";
import type { Aviso } from "@/lib/dashboard";

const ICONE: Record<Aviso["id"], typeof Tag> = { divida: CircleAlert, reserva: PiggyBank, "sem-fatia": Tag, desafios: Target };
const COR: Record<Aviso["nivel"] | "desafio", string> = {
  alerta: "bg-red-50 text-red-700",
  atencao: "bg-amber-50 text-amber-700",
  info: "bg-slate-100 text-slate-600",
  desafio: "bg-blue-50 text-blue-700",
};

export default function FiqueDeOlho({ avisos }: { avisos: Aviso[] }) {
  if (avisos.length === 0) return null;
  return (
    <section className="card !p-0" aria-labelledby="t-olho" data-fique-de-olho>
      <h2 id="t-olho" className="font-semibold text-slate-700 px-4 sm:px-6 pt-4 pb-2">Fique de olho</h2>
      <ul>
        {avisos.map((a) => {
          const Icone = a.nivel === "alerta" && a.id === "reserva" ? TriangleAlert : ICONE[a.id];
          return (
            <li key={`${a.id}-${a.nivel}`} className="border-t border-slate-100" data-aviso={a.id} {...(a.id === "desafios" && { "data-card": "desafios" })}>
              <Link href={a.href} className="flex items-center gap-3 px-4 sm:px-6 py-3 min-h-11 hover:bg-slate-50">
                <span className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${COR[a.id === "desafios" ? "desafio" : a.nivel]}`}>
                  <Icone size={16} aria-hidden />
                </span>
                <span className="flex-1 min-w-0 text-sm text-slate-700">
                  <strong className="font-semibold text-slate-800">{a.titulo}</strong> {a.texto}
                </span>
                <span className="text-sm text-blue-600 whitespace-nowrap">{a.acao} →</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
