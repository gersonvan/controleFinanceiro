"use client";
import { useState, useRef } from "react";

type TipoImportacao = "c6-credito" | "c6-debito" | "nubank-credito" | "nubank-debito";

const TIPOS: { id: TipoImportacao; label: string; dica: string }[] = [
  { id: "c6-credito", label: "C6 Bank — Fatura Crédito", dica: "Arquivo: Fatura_AAAA_MM.csv (delimitado por ;)" },
  { id: "c6-debito", label: "C6 Bank — Extrato Débito", dica: "Arquivo: Extrato_AAAA_MM.csv (9 linhas de cabeçalho)" },
  { id: "nubank-credito", label: "Nubank — Fatura Crédito", dica: "Arquivo: Nubank_AAAA_MM.csv" },
  { id: "nubank-debito", label: "Nubank — Extrato Débito", dica: "Arquivo: NU_AAAA_MM.csv" },
];

interface Resultado {
  processados: number;
  novos: number;
  duplicados: number;
  erro?: string;
}

export default function ImportarPage() {
  const [tipo, setTipo] = useState<TipoImportacao>("c6-credito");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [resultados, setResultados] = useState<Array<{ nome: string } & Resultado>>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const tipoSelecionado = TIPOS.find((t) => t.id === tipo)!;

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    setArquivos(Array.from(e.target.files || []));
    setResultados([]);
  };

  const importar = async () => {
    if (!arquivos.length) return;
    setCarregando(true);
    setResultados([]);

    const novosResultados: Array<{ nome: string } & Resultado> = [];
    for (const arquivo of arquivos) {
      const form = new FormData();
      form.append("file", arquivo);
      form.append("tipo", tipo);
      try {
        const res = await fetch("/api/importar", { method: "POST", body: form });
        const json = await res.json();
        if (!res.ok) {
          novosResultados.push({ nome: arquivo.name, processados: 0, novos: 0, duplicados: 0, erro: json.error });
        } else {
          novosResultados.push({ nome: arquivo.name, ...json });
        }
      } catch (e) {
        novosResultados.push({ nome: arquivo.name, processados: 0, novos: 0, duplicados: 0, erro: String(e) });
      }
    }

    setResultados(novosResultados);
    setCarregando(false);
    setArquivos([]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const totalNovos = resultados.reduce((acc, r) => acc + (r.novos || 0), 0);

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Importar CSV</h1>

      <div className="card space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Tipo de arquivo</label>
          <div className="grid grid-cols-2 gap-2">
            {TIPOS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTipo(t.id)}
                className={`p-3 rounded-lg border-2 text-left transition-all ${
                  tipo === t.id
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="font-medium text-sm text-slate-800">{t.label}</div>
                <div className="text-xs text-slate-400 mt-0.5">{t.dica}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Selecionar arquivo(s) CSV
          </label>
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            multiple
            onChange={handleFiles}
            className="w-full"
          />
          <p className="text-xs text-slate-400 mt-1">{tipoSelecionado.dica}</p>
        </div>

        {arquivos.length > 0 && (
          <div className="bg-slate-50 rounded-lg p-3 text-sm">
            <div className="font-medium text-slate-700 mb-1">{arquivos.length} arquivo(s) selecionado(s):</div>
            {arquivos.map((f) => (
              <div key={f.name} className="text-slate-500">• {f.name}</div>
            ))}
          </div>
        )}

        <button
          className="btn btn-primary w-full justify-center"
          onClick={importar}
          disabled={!arquivos.length || carregando}
        >
          {carregando ? <><span className="spinner" /> Importando…</> : "📥 Importar"}
        </button>
      </div>

      {resultados.length > 0 && (
        <div className="card space-y-3">
          <h2 className="font-semibold text-slate-700">Resultado da Importação</h2>
          {resultados.map((r) => (
            <div
              key={r.nome}
              className={`p-3 rounded-lg text-sm ${
                r.erro ? "bg-red-50 border border-red-200" : "bg-green-50 border border-green-200"
              }`}
            >
              <div className="font-medium">{r.nome}</div>
              {r.erro ? (
                <div className="text-red-600 mt-1">{r.erro}</div>
              ) : (
                <div className="text-green-700 mt-1">
                  ✅ {r.novos} novas transações adicionadas
                  {r.duplicados > 0 && <span className="text-slate-500"> · {r.duplicados} duplicadas ignoradas</span>}
                  <span className="text-slate-500"> · {r.processados} total processadas</span>
                </div>
              )}
            </div>
          ))}
          {totalNovos > 0 && (
            <div className="text-center text-sm font-medium text-green-700">
              Total: {totalNovos} novas transações importadas!
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h2 className="font-semibold text-slate-700 mb-3">Como usar</h2>
        <ol className="text-sm text-slate-600 space-y-1.5 list-decimal list-inside">
          <li>Baixe o arquivo CSV direto do app do C6 Bank ou Nubank</li>
          <li>Selecione o tipo de arquivo correspondente acima</li>
          <li>Clique em "Selecionar arquivo(s)" e escolha o(s) CSV(s)</li>
          <li>Clique em Importar — duplicatas são detectadas automaticamente</li>
          <li>Vá em Lançamentos para revisar e categorizar as transações novas</li>
        </ol>
      </div>
    </div>
  );
}
