"use client";
// Importação de vários arquivos de uma vez: cada arquivo é analisado no
// servidor (banco, perfil, lançamentos, duplicados) e entra numa fila.
// Os reconhecidos são importados juntos; os demais passam pelo fluxo de
// configuração de um arquivo e voltam para a fila.
import Link from "next/link";
import { useState } from "react";
import type { AnaliseArquivo } from "@/app/api/importar/analisar/route";

export type StatusItem = "analisando" | "pronto" | "configurar" | "importando" | "importado" | "erro";

export interface ItemLote {
  id: number;
  file: File;
  status: StatusItem;
  analise?: AnaliseArquivo;
  mesRef: string; // "AAAA-MM" — só faturas
  resultado?: { novos: number; duplicados: number; processados: number; reembolsosVinculados?: number; saldoConta?: { conta: string; saldo: number; atualizado: boolean } | null };
  erro?: string;
}

const FORMATO: Record<string, string> = { ofx: "OFX", pdf: "PDF", csv: "CSV" };

const fmtDia = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

interface Props {
  itens: ItemLote[];
  importando: boolean;
  onMesRef: (id: number, mesRef: string) => void;
  onRemover: (id: number) => void;
  onConfigurar: (id: number) => void;
  onAdicionar: (files: File[]) => void;
  onImportarTodos: () => void;
  onRecomecar: () => void;
}

export default function ImportacaoLote({
  itens, importando, onMesRef, onRemover, onConfigurar, onAdicionar, onImportarTodos, onRecomecar,
}: Props) {
  const [categorizacao, setCategorizacao] = useState<string>("");
  const [categorizando, setCategorizando] = useState(false);

  const analisando = itens.some((i) => i.status === "analisando");
  const prontos = itens.filter((i) => i.status === "pronto");
  const faltaMes = prontos.filter((i) => i.analise?.perfil?.usaMesReferencia && !i.mesRef);
  const importados = itens.filter((i) => i.status === "importado");
  const totalNovos = importados.reduce((acc, i) => acc + (i.resultado?.novos ?? 0), 0);
  const totalDuplicados = importados.reduce((acc, i) => acc + (i.resultado?.duplicados ?? 0), 0);
  const terminou = !analisando && !importando && prontos.length === 0 && importados.length > 0;

  const categorizar = async () => {
    setCategorizando(true);
    const r = await fetch("/api/categorizar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usarGemini: false }),
    });
    const json = await r.json().catch(() => null);
    setCategorizando(false);
    if (!r.ok || !json) { setCategorizacao("Não foi possível categorizar agora."); return; }
    const feitos = json.porMemoria + (json.porHistorico ?? 0) + json.porRegras;
    setCategorizacao(
      `${feitos} lançamento${feitos !== 1 ? "s" : ""} categorizado${feitos !== 1 ? "s" : ""}` +
      (json.semCategoria > 0 ? ` · ${json.semCategoria} ainda sem categoria` : "")
    );
  };

  return (
    <div className="space-y-4">
      <div className="card p-0 overflow-hidden">
        <div className="px-4 sm:px-6 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="font-semibold text-slate-700">
            {itens.length} arquivo{itens.length !== 1 ? "s" : ""}
            {analisando && <span className="ml-2 text-sm font-normal text-slate-400">analisando…</span>}
          </div>
          <label className="text-sm text-blue-600 hover:underline cursor-pointer">
            + Adicionar arquivos
            <input
              type="file" multiple accept=".csv,.ofx,.txt,.pdf" className="hidden"
              onChange={(e) => { onAdicionar(Array.from(e.target.files ?? [])); e.target.value = ""; }}
            />
          </label>
        </div>

        <ul className="divide-y divide-slate-100">
          {itens.map((item) => <Linha key={item.id} item={item} importando={importando}
            onMesRef={onMesRef} onRemover={onRemover} onConfigurar={onConfigurar} />)}
        </ul>
      </div>

      {!terminou ? (
        <div className="card space-y-3">
          {faltaMes.length > 0 && (
            <p className="text-sm text-amber-700">
              Informe o mês de referência de {faltaMes.length === 1 ? "1 fatura" : `${faltaMes.length} faturas`} para importar.
            </p>
          )}
          {itens.some((i) => i.status === "configurar") && (
            <p className="text-sm text-slate-500">
              Os arquivos marcados com ⚠️ precisam de configuração — use &quot;Configurar&quot; em cada um, antes ou depois de importar os outros.
            </p>
          )}
          <div className="flex gap-2 flex-wrap justify-between">
            <button onClick={onRecomecar} disabled={importando} className="btn btn-secondary">Recomeçar</button>
            <button
              onClick={onImportarTodos}
              disabled={importando || analisando || prontos.length === 0 || faltaMes.length > 0}
              className="btn btn-primary"
            >
              {importando ? <><span className="spinner" /> Importando…</>
                : `📥 Importar ${prontos.length} arquivo${prontos.length !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      ) : (
        <div className="card space-y-4">
          <div className="p-4 rounded-lg bg-green-50 border border-green-200 text-sm">
            <div className="font-semibold text-green-800 text-base">
              ✅ {totalNovos} nova{totalNovos !== 1 ? "s" : ""} transaç{totalNovos !== 1 ? "ões" : "ão"} em {importados.length} arquivo{importados.length !== 1 ? "s" : ""}
            </div>
            {totalDuplicados > 0 && <div className="text-slate-500">{totalDuplicados} duplicadas ignoradas</div>}
            {itens.some((i) => i.status === "configurar") && (
              <div className="text-slate-500 mt-1">Ainda há arquivos para configurar na lista acima.</div>
            )}
          </div>
          {categorizacao && <p className="text-sm text-slate-600">🧠 {categorizacao}</p>}
          <div className="flex gap-2 flex-wrap">
            <button onClick={categorizar} disabled={categorizando} className="btn btn-primary">
              {categorizando ? <><span className="spinner" /> Categorizando…</> : "🧠 Categorizar agora"}
            </button>
            <Link href="/lancamentos" className="btn btn-secondary">Ver lançamentos</Link>
            <button onClick={onRecomecar} className="btn btn-secondary">Importar mais</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Linha({ item, importando, onMesRef, onRemover, onConfigurar }: {
  item: ItemLote;
  importando: boolean;
  onMesRef: (id: number, mesRef: string) => void;
  onRemover: (id: number) => void;
  onConfigurar: (id: number) => void;
}) {
  const a = item.analise;
  const icone = {
    analisando: <span className="spinner" style={{ width: 16, height: 16 }} />,
    pronto: "📄",
    configurar: "⚠️",
    importando: <span className="spinner" style={{ width: 16, height: 16 }} />,
    importado: "✅",
    erro: "❌",
  }[item.status];

  return (
    <li className="px-4 sm:px-6 py-3">
      <div className="flex items-start gap-3">
        <div className="w-5 pt-0.5 text-center shrink-0">{icone}</div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="text-sm font-medium text-slate-800 break-all">{item.file.name}</div>
            {!importando && item.status !== "importado" && item.status !== "importando" && (
              <button onClick={() => onRemover(item.id)} className="text-slate-400 hover:text-red-500 text-lg leading-none shrink-0" title="Tirar da lista">×</button>
            )}
          </div>

          {item.status === "analisando" && <div className="text-xs text-slate-400">Identificando banco e lançamentos…</div>}

          {a?.reconhecido && a.perfil && (
            <div className="text-xs text-slate-500">
              <span className="badge bg-blue-50 text-blue-700 mr-1">{a.perfil.nome}</span>
              {FORMATO[a.formato]} · {a.total} lançamento{a.total !== 1 ? "s" : ""}
              {a.periodo && ` · ${fmtDia(a.periodo.inicio)} a ${fmtDia(a.periodo.fim)}`}
              {!!a.duplicados && (
                <span className={a.novos === 0 ? "text-amber-600" : ""}>
                  {a.novos === 0 ? " · já importado" : ` · ${a.duplicados} já importado${a.duplicados !== 1 ? "s" : ""}`}
                </span>
              )}
            </div>
          )}

          {!!a?.suspeitos && item.status === "pronto" && a.suspeitos >= Math.max(3, (a.novos ?? 0) * 0.2) && (
            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
              ⚠️ {a.suspeitos} lançamento{a.suspeitos !== 1 ? "s" : ""} têm a mesma data e valor de outros já gravados, com outra descrição.
              Pode ser o mesmo extrato em outro formato (OFX × CSV) — se for, tire este arquivo da lista.
            </div>
          )}

          {a?.reconhecido && a.perfil?.usaMesReferencia && item.status === "pronto" && (
            <label className="flex items-center gap-2 text-xs text-slate-600">
              Fatura de
              <input
                type="month" value={item.mesRef}
                onChange={(e) => onMesRef(item.id, e.target.value)}
                className={`text-xs py-1 ${!item.mesRef ? "border-amber-400" : ""}`}
              />
              {a.mesReferenciaSugerido && item.mesRef === a.mesReferenciaSugerido && (
                <span className="text-slate-400">sugerido</span>
              )}
            </label>
          )}

          {item.status === "configurar" && (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-xs text-amber-700">{a?.motivo ?? "Precisa de configuração."}</div>
              <button onClick={() => onConfigurar(item.id)} disabled={importando} className="btn btn-secondary text-xs py-1">Configurar</button>
            </div>
          )}

          {item.status === "importado" && item.resultado && (
            <div className="text-xs text-green-700">
              {item.resultado.novos} nova{item.resultado.novos !== 1 ? "s" : ""}
              {item.resultado.duplicados > 0 && ` · ${item.resultado.duplicados} duplicada${item.resultado.duplicados !== 1 ? "s" : ""} ignorada${item.resultado.duplicados !== 1 ? "s" : ""}`}
              {item.resultado.saldoConta?.atualizado && ` · saldo ${item.resultado.saldoConta.saldo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} na Reserva`}
              {!!item.resultado.reembolsosVinculados && ` · ${item.resultado.reembolsosVinculados} reembolso${item.resultado.reembolsosVinculados !== 1 ? "s" : ""} dividido${item.resultado.reembolsosVinculados !== 1 ? "s" : ""} pelo padrão`}
            </div>
          )}

          {item.status === "erro" && <div className="text-xs text-red-600">{item.erro}</div>}
        </div>
      </div>
    </li>
  );
}
