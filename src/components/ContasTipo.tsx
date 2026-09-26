"use client";
// Configurações → Contas: corrente ou cartão de crédito. É o que separa
// crédito de débito nos painéis de /financas.
import { useEffect, useState } from "react";

interface Conta { id: number; nome: string; tipo: "corrente" | "cartao"; lancamentos: number }

const TIPOS = [
  { valor: "corrente", rotulo: "Conta corrente" },
  { valor: "cartao", rotulo: "Cartão de crédito" },
] as const;

export default function ContasTipo() {
  const [contas, setContas] = useState<Conta[] | null>(null);
  const [salvando, setSalvando] = useState<number | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    fetch("/api/contas")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Conta[]) => { if (ativo) setContas(d); })
      .catch(() => { if (ativo) setErro("Não foi possível carregar as contas."); });
    return () => { ativo = false; };
  }, []);

  const definir = async (c: Conta, tipo: Conta["tipo"]) => {
    if (c.tipo === tipo) return;
    setSalvando(c.id);
    setErro("");
    const r = await fetch("/api/contas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, tipo }),
    });
    if (r.ok) setContas((prev) => prev?.map((x) => (x.id === c.id ? { ...x, tipo } : x)) ?? null);
    else setErro(`Não foi possível mudar "${c.nome}".`);
    setSalvando(null);
  };

  return (
    <div className="card">
      <h2 className="font-semibold text-slate-700 mb-1">Contas</h2>
      <p className="text-xs text-slate-400 mb-4">
        Diga o que é cada conta. Cartão de crédito conta no mês da fatura; nas contas correntes, cada saída vira Pix, boleto, débito ou encargos pela descrição.
      </p>
      {erro && <p className="text-sm text-red-600 mb-3">{erro}</p>}
      {!contas ? (
        !erro && <div className="text-slate-400 text-sm">Carregando…</div>
      ) : contas.length === 0 ? (
        <p className="text-sm text-slate-500">As contas aparecem aqui depois da primeira importação.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {contas.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 py-2.5 flex-wrap">
              <div>
                <div className="text-sm font-medium text-slate-800">{c.nome}</div>
                <div className="text-xs text-slate-400">{c.lancamentos.toLocaleString("pt-BR")} lançamentos</div>
              </div>
              <div role="group" aria-label={`Tipo da conta ${c.nome}`} className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 gap-0.5">
                {TIPOS.map((t) => (
                  <button
                    key={t.valor}
                    type="button"
                    aria-pressed={c.tipo === t.valor}
                    disabled={salvando === c.id}
                    onClick={() => definir(c, t.valor)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium min-h-[32px] transition-colors ${
                      c.tipo === t.valor ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {t.rotulo}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
