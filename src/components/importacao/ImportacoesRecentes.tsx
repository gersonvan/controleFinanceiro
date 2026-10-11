"use client";
// Importações recentes com "Desfazer": apaga os lançamentos que cada uma criou.
import { useEffect, useState } from "react";

interface Importacao { id: number; perfil: string; conta: string; arquivo: string; createdAt: string; lancamentos: number }

const quando = (d: string) =>
  new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Confirma e desfaz; devolve a mensagem para mostrar (ou null se o usuário desistiu). */
export async function desfazer(imp: { id: number; arquivo: string; lancamentos: number }): Promise<string | null> {
  if (!confirm(`Desfazer a importação de "${imp.arquivo}"?\n\nApaga os ${imp.lancamentos} lançamento(s) que ela criou — inclusive categorias e divisões feitas neles depois.`)) return null;
  const r = await fetch(`/api/importacoes?id=${imp.id}`, { method: "DELETE" });
  if (!r.ok) return "Não foi possível desfazer a importação.";
  const j: { apagados: number; saldoRestaurado: boolean } = await r.json();
  return `Importação desfeita: ${j.apagados} lançamento(s) apagado(s)${j.saldoRestaurado ? " e o saldo da conta voltou ao anterior" : ""}.`;
}

export default function ImportacoesRecentes({ atualizar = 0 }: { atualizar?: number }) {
  const [lista, setLista] = useState<Importacao[] | null>(null);
  const [aviso, setAviso] = useState("");
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let ativo = true;
    fetch("/api/importacoes")
      .then((r) => (r.ok ? r.json() : []))
      .then((j: Importacao[]) => { if (ativo) setLista(j); })
      .catch(() => {});
    return () => { ativo = false; };
  }, [atualizar, recarga]);

  if (!lista || (lista.length === 0 && !aviso)) return null;

  return (
    <div className="card space-y-3" data-importacoes-recentes>
      <div>
        <h2 className="font-semibold text-slate-700">Importações recentes</h2>
        <p className="text-xs text-slate-400 mt-0.5">Importou com o perfil errado ou o arquivo errado? Desfaça aqui.</p>
      </div>
      {aviso && <div className="text-sm text-emerald-700" role="status">{aviso}</div>}
      <ul className="divide-y divide-slate-100">
        {lista.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 py-2 text-sm" data-importacao={i.id}>
            <div className="min-w-0">
              <div className="text-slate-700 truncate" title={i.arquivo}>{i.arquivo}</div>
              <div className="text-xs text-slate-400">
                {quando(i.createdAt)} · {i.perfil} · {i.conta} · {i.lancamentos} lançamento{i.lancamentos > 1 ? "s" : ""}
              </div>
            </div>
            <button className="btn btn-secondary text-xs shrink-0"
              onClick={async () => {
                const msg = await desfazer(i);
                if (msg) { setAviso(msg); setRecarga((n) => n + 1); }
              }}>
              Desfazer
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
