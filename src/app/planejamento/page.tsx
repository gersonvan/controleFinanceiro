"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import FotografiaWizard from "@/components/planejamento/FotografiaWizard";
import PlanejadoRealizado from "@/components/planejamento/PlanejadoRealizado";

type Aba = "fotografia" | "comparacao";

export default function PlanejamentoPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><div className="spinner" /></div>}>
      <Planejamento />
    </Suspense>
  );
}

function Planejamento() {
  const params = useSearchParams();
  // /planejamento?aba=comparacao (link do dashboard)
  const [aba, setAba] = useState<Aba>(() => (params.get("aba") === "comparacao" ? "comparacao" : "fotografia"));
  const [salvoEm, setSalvoEm] = useState<Date | null>(null);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Planejamento</h1>
          <p className="text-sm text-slate-500 mt-1">
            Sua fotografia do mês e o que os lançamentos mostram de verdade.
          </p>
        </div>
        {salvoEm && aba === "fotografia" && (
          <span className="text-xs text-emerald-600">
            ✓ Fotografia salva às {salvoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {([
          ["fotografia", "📸 Fotografia do mês"],
          ["comparacao", "📊 Planejado × Realizado"],
        ] as [Aba, string][]).map(([id, rotulo]) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              aba === id ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {aba === "fotografia" ? (
        <FotografiaWizard modo="pagina" onConcluir={() => setSalvoEm(new Date())} />
      ) : (
        <PlanejadoRealizado onIrParaFotografia={() => setAba("fotografia")} />
      )}
    </div>
  );
}
