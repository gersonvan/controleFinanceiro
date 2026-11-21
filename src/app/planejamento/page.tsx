"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import FotografiaWizard from "@/components/planejamento/FotografiaWizard";
import PlanejadoRealizado from "@/components/planejamento/PlanejadoRealizado";
import PlanoFamilia from "@/components/planejamento/PlanoFamilia";

type Aba = "fotografia" | "comparacao" | "familia";

export default function PlanejamentoPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><div className="spinner" /></div>}>
      <Planejamento />
    </Suspense>
  );
}

function Planejamento() {
  const params = useSearchParams();
  // /planejamento?aba=comparacao (link do dashboard) ou ?aba=familia
  const [aba, setAba] = useState<Aba>(() => {
    const pedida = params.get("aba");
    return pedida === "comparacao" || pedida === "familia" ? pedida : "fotografia";
  });
  const [salvoEm, setSalvoEm] = useState<Date | null>(null);

  return (
    <div className={`${aba === "familia" ? "max-w-6xl" : "max-w-3xl"} space-y-6`}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Planejamento</h1>
          <p className="text-sm text-slate-500 mt-1">
            Sua fotografia do mês, o que os lançamentos mostram de verdade e o plano da família.
          </p>
        </div>
        {salvoEm && aba === "fotografia" && (
          <span className="text-xs text-emerald-600">
            ✓ Fotografia salva às {salvoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>

      {/* abas: a linha de baixo é uma sombra interna (não borda), para a aba ativa não passar da caixa e não aparecer barra de rolagem */}
      <div className="flex gap-1 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--color-slate-200)]">
        {([
          ["fotografia", "📸 Fotografia do mês"],
          ["comparacao", "📊 Planejado × Realizado"],
          ["familia", "👨‍👩‍👧 Família"],
        ] as [Aba, string][]).map(([id, rotulo]) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              aba === id ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {aba === "fotografia" ? (
        <FotografiaWizard modo="pagina" onConcluir={() => setSalvoEm(new Date())} />
      ) : aba === "comparacao" ? (
        <PlanejadoRealizado onIrParaFotografia={() => setAba("fotografia")} />
      ) : (
        <PlanoFamilia />
      )}
    </div>
  );
}
