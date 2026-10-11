"use client";
// Prévia de como o CSV vai virar lançamentos com o perfil do jeito que está na
// tela — antes de salvar. Avisa quando as descrições saem genéricas ("PIX
// ENVIADO"), que é o sinal de coluna ou linha de complemento faltando.
import { useMemo } from "react";
import { parseCSVGenerico } from "@/lib/importacao/csv";
import type { PerfilConfig } from "@/lib/importacao/tipos";
import { descricaoGenerica } from "@/lib/categorias";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const MOSTRAR = 12;

export default function PreviaLancamentos({ texto, perfil }: { texto: string; perfil: PerfilConfig }) {
  const itens = useMemo(() => {
    try { return parseCSVGenerico(texto, perfil, new Map(), null); } catch { return []; }
  }, [texto, perfil]);
  const genericas = itens.filter((i) => descricaoGenerica(i.descricao)).length;

  return (
    <div className="space-y-2" data-previa-lancamentos>
      <div className="text-sm font-medium text-slate-700">
        Como vai ficar: {itens.length} lançamento{itens.length === 1 ? "" : "s"}
      </div>
      {itens.length === 0 ? (
        <p className="text-sm text-amber-700">Nenhum lançamento reconhecido — confira a coluna de data, o formato da data e as colunas de valor.</p>
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
          <table className="w-full">
            <tbody>
              {itens.slice(0, MOSTRAR).map((t, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-1.5 text-slate-400 whitespace-nowrap">{t.data.toLocaleDateString("pt-BR")}</td>
                  <td className="px-3 py-1.5 text-slate-700 break-words">{t.descricao}</td>
                  <td className="px-3 py-1.5 text-slate-400 whitespace-nowrap hidden sm:table-cell">{t.categoria || "—"}</td>
                  <td className={`px-3 py-1.5 text-right whitespace-nowrap font-medium ${t.valor < 0 ? "text-red-600" : "text-green-600"}`}>{fmt(t.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {itens.length > MOSTRAR && <div className="px-3 py-1.5 text-slate-400 bg-slate-50">e mais {itens.length - MOSTRAR}…</div>}
        </div>
      )}
      {genericas > 0 && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" role="alert">
          {genericas} de {itens.length} descrições só dizem o tipo da transação (ex.: &quot;PIX ENVIADO&quot;), sem quem recebeu ou onde foi.
          Veja se o arquivo tem uma coluna de detalhes (marque como <strong>Complemento</strong>) ou o nome numa linha de baixo
          (marque <strong>Linhas sem data completam a descrição</strong>).
        </p>
      )}
    </div>
  );
}
