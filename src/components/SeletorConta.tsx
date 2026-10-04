"use client";
// Escolha de conta no formato Banco → Débito/Crédito (+ apelido opcional).
// Devolve o nome gerado por lib/bancos.ts ("Nubank · Crédito"); ninguém digita
// nome de conta, exceto no banco "Outro" (carteira, vale…).
import { useEffect, useState } from "react";
import { BANCOS, nomeDaConta, interpretarNomeAntigo } from "@/lib/bancos";
import type { TipoConta } from "@/lib/financas";

export default function SeletorConta({ valorInicial = "", tipoInicial, onChange }: {
  valorInicial?: string;        // nome atual (ex.: ao editar um perfil)
  tipoInicial?: TipoConta;      // sugestão quando não há valor (fatura → Crédito)
  onChange: (conta: string) => void; // "" enquanto incompleto
}) {
  const inicial = valorInicial ? interpretarNomeAntigo(valorInicial) : null;
  const [banco, setBanco] = useState(inicial?.banco ?? "");
  const [tipo, setTipo] = useState<TipoConta>(inicial?.tipo ?? tipoInicial ?? "corrente");
  const [apelido, setApelido] = useState(inicial?.apelido ?? "");

  const outro = banco === "outro";
  const completo = !!banco && (!outro || apelido.trim().length > 0);
  const nome = completo ? nomeDaConta({ banco, tipo, apelido }) : "";

  useEffect(() => { onChange(nome); }, [nome]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-2">
      <div className="flex gap-2 flex-wrap">
        <select aria-label="Banco" value={banco} onChange={(e) => setBanco(e.target.value)} className="flex-1 min-w-40">
          <option value="">Banco…</option>
          {BANCOS.map((b) => <option key={b.id} value={b.id}>{b.nomeCompleto}</option>)}
        </select>
        {!outro && (
          <div role="group" aria-label="Tipo da conta" className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 gap-0.5">
            {([["corrente", "Débito"], ["cartao", "Crédito"]] as const).map(([v, rotulo]) => (
              <button key={v} type="button" aria-pressed={tipo === v} onClick={() => setTipo(v)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${tipo === v ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-200"}`}>
                {rotulo}
              </button>
            ))}
          </div>
        )}
      </div>
      <input
        aria-label={outro ? "Nome da conta" : "Apelido (opcional)"}
        value={apelido} onChange={(e) => setApelido(e.target.value)} maxLength={40}
        placeholder={outro ? "Nome — ex.: Carteira, Vale-refeição" : "Apelido (opcional) — só se tiver duas desse banco, ex.: final 1234"}
        className="w-full"
      />
      {nome && <p className="text-xs text-slate-500">Conta: <span className="font-medium text-slate-700">{nome}</span></p>}
    </div>
  );
}
