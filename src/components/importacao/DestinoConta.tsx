"use client";
// Para qual conta vai a importação. A conta é banco + Débito/Crédito (lib/bancos.ts):
// com uma só possível, só mostra; com mais de uma (apelidos), pede a escolha.
// onChange(null) = ainda falta escolher.
import { useEffect, useState } from "react";
import type { DestinoConta as Destino } from "@/app/api/contas/destino/route";

export default function DestinoConta({ perfilId, valor, onChange, compacto = false }: {
  perfilId: number;
  valor: string | null | undefined;
  onChange: (conta: string | null) => void;
  compacto?: boolean;
}) {
  const [destino, setDestino] = useState<Destino | null>(null);

  useEffect(() => {
    let ativo = true;
    fetch(`/api/contas/destino?perfilId=${perfilId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Destino | null) => {
        if (!ativo || !d) return;
        setDestino(d);
        onChange(d.padrao);
      })
      .catch(() => {});
    return () => { ativo = false; };
    // onChange muda a cada render do pai; só o perfil define o destino
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfilId]);

  const texto = compacto ? "text-xs" : "text-sm";
  if (!destino) return <div className={`${texto} text-slate-400`}>Conferindo a conta…</div>;

  if (destino.opcoes.length <= 1) {
    return (
      <div className={`${texto} text-slate-600`}>
        Vai para a conta <span className="font-medium text-slate-800">{destino.padrao}</span>
        {destino.opcoes.length === 0 && <span className="text-slate-400"> (nova)</span>}
      </div>
    );
  }
  return (
    <label className={`flex items-center gap-2 ${texto} text-slate-600`}>
      Em qual conta?
      <select value={valor ?? ""} onChange={(e) => onChange(e.target.value || null)}
        className={`${texto} py-1 ${!valor ? "border-amber-400" : ""}`}>
        <option value="">Escolha…</option>
        {destino.opcoes.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </label>
  );
}
