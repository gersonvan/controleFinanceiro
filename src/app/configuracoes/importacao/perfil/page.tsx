"use client";
// Editar um perfil personalizado vendo o arquivo: solte um extrato de exemplo,
// escolha o papel de cada coluna e confira a prévia dos lançamentos antes de
// salvar. Sem arquivo, dá para ajustar pelo número da coluna.
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import SeletorConta from "@/components/SeletorConta";
import MapeamentoColunas from "@/components/importacao/MapeamentoColunas";
import PreviaLancamentos from "@/components/importacao/PreviaLancamentos";
import { decodificarBytes } from "@/lib/importacao/decodificar";
import { parseCSV, type PerfilConfig } from "@/lib/importacao/tipos";
import {
  colunasDosPapeis, papeisDoPerfil, sugerirJuntarLinhas, type ColunasPerfil, type Papel,
} from "@/lib/importacao/detectar";

interface Perfil extends ColunasPerfil {
  id: number;
  nome: string;
  conta: string;
  formato: "csv" | "ofx" | "pdf";
  builtin: string | null;
  delimitador: string;
  linhasPular: number;
  formatoData: string;
  inverterSinal: boolean;
  usaMesReferencia: boolean;
  juntarLinhasSemData: boolean;
}

const DELIMITADORES = [{ v: ",", label: "Vírgula ( , )" }, { v: ";", label: "Ponto e vírgula ( ; )" }, { v: "\t", label: "Tabulação" }];
const FORMATOS_DATA = ["DD/MM/AAAA", "AAAA-MM-DD", "DD-MM-AAAA", "MM/DD/AAAA"];
const AMOSTRA = 15; // linhas do arquivo na tabela de colunas
const COLUNAS: [keyof ColunasPerfil, string][] = [
  ["colData", "Data"], ["colDescricao", "Descrição"], ["colComplemento", "Complemento"], ["colParcela", "Parcela"],
  ["colValor", "Valor (única)"], ["colEntrada", "Entrada"], ["colSaida", "Saída"],
];

function EditarPerfil() {
  const id = Number(useSearchParams().get("id"));
  const router = useRouter();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [naoAchou, setNaoAchou] = useState(false);
  const [texto, setTexto] = useState("");
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    fetch("/api/perfis?todos=true")
      .then((r) => (r.ok ? r.json() : []))
      .then((lista: Perfil[]) => {
        if (!ativo) return;
        const p = lista.find((x) => x.id === id && !x.builtin);
        if (p) setPerfil(p); else setNaoAchou(true);
      });
    return () => { ativo = false; };
  }, [id]);

  const linhas = useMemo(() => (texto && perfil ? parseCSV(texto, perfil.delimitador) : []), [texto, perfil]);
  const nColunas = Math.max(0, ...linhas.slice(0, 50).map((l) => l.length));
  const papeis = useMemo(() => (perfil ? papeisDoPerfil(perfil, nColunas) : []), [perfil, nColunas]);
  const config: PerfilConfig | null = useMemo(() => perfil && ({ ...perfil, formato: "csv" as const }), [perfil]);

  if (naoAchou) return <p className="text-slate-500">Perfil personalizado não encontrado. <Link href="/configuracoes/importacao" className="text-blue-600 hover:underline">Voltar</Link></p>;
  if (!perfil || !config) return <div className="flex justify-center py-20"><div className="spinner" /></div>;

  const mudar = (mudanca: Partial<Perfil>) => setPerfil((p) => (p ? { ...p, ...mudanca } : p));
  const csv = perfil.formato === "csv";

  const carregarArquivo = async (file: File) => {
    setNomeArquivo(file.name);
    const t = decodificarBytes(await file.arrayBuffer());
    setTexto(t);
    // arquivo novo: se ele traz a descrição em duas linhas, já sugere juntar
    const amostra = parseCSV(t, perfil.delimitador);
    if (!perfil.juntarLinhasSemData && sugerirJuntarLinhas(amostra, perfil.linhasPular, papeisDoPerfil(perfil, Math.max(0, ...amostra.map((l) => l.length)))))
      mudar({ juntarLinhasSemData: true });
  };

  const salvar = async () => {
    setSalvando(true); setErro("");
    const p = perfil;
    const r = await fetch("/api/perfis", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: p.id, nome: p.nome, conta: p.conta, delimitador: p.delimitador, linhasPular: p.linhasPular, formatoData: p.formatoData,
        modoValor: p.modoValor, colData: p.colData, colDescricao: p.colDescricao, colComplemento: p.colComplemento,
        colParcela: p.colParcela, colValor: p.colValor, colEntrada: p.colEntrada, colSaida: p.colSaida,
        inverterSinal: p.inverterSinal, usaMesReferencia: p.usaMesReferencia, juntarLinhasSemData: p.juntarLinhasSemData,
      }),
    });
    setSalvando(false);
    if (!r.ok) { setErro((await r.json().catch(() => null))?.error ?? "Não foi possível salvar o perfil."); return; }
    router.push("/configuracoes/importacao");
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/configuracoes/importacao" className="text-sm text-blue-600 hover:underline">← Perfis de importação</Link>
        <h1 className="text-2xl font-bold text-slate-800 mt-1">Editar perfil: {perfil.nome}</h1>
        <p className="text-sm text-slate-500 mt-1">Vale para as próximas importações. O que já foi importado não muda — se importou errado, desfaça em Importar → Importações recentes.</p>
      </div>

      <div className="card grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-sm text-slate-700">Nome do perfil
          <input value={perfil.nome} onChange={(e) => mudar({ nome: e.target.value })} className="mt-1 w-full" />
        </label>
        <div className="text-sm text-slate-700">Conta
          <div className="mt-1"><SeletorConta key={perfil.id} valorInicial={perfil.conta} onChange={(v) => { if (v) mudar({ conta: v }); }} /></div>
        </div>
      </div>

      {csv && (
        <div className="card space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-sm text-slate-700">Delimitador
              <select value={perfil.delimitador} onChange={(e) => mudar({ delimitador: e.target.value })} className="mt-1 w-full">
                {DELIMITADORES.map((d) => <option key={d.v} value={d.v}>{d.label}</option>)}
              </select>
            </label>
            <label className="text-sm text-slate-700">Linhas de cabeçalho
              <input type="number" min={0} value={perfil.linhasPular} onChange={(e) => mudar({ linhasPular: Math.max(0, parseInt(e.target.value) || 0) })} className="mt-1 w-full" />
            </label>
            <label className="text-sm text-slate-700">Formato da data
              <select value={perfil.formatoData} onChange={(e) => mudar({ formatoData: e.target.value })} className="mt-1 w-full">
                {FORMATOS_DATA.map((f) => <option key={f}>{f}</option>)}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-700">
            <label className="flex items-center gap-2"><input type="checkbox" checked={perfil.juntarLinhasSemData} onChange={(e) => mudar({ juntarLinhasSemData: e.target.checked })} /> Linhas sem data completam a descrição da linha de cima</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={perfil.inverterSinal} onChange={(e) => mudar({ inverterSinal: e.target.checked })} /> Inverter sinal (fatura: positivo = gasto)</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={perfil.usaMesReferencia} onChange={(e) => mudar({ usaMesReferencia: e.target.checked })} /> Pedir mês de referência (fatura)</label>
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="font-semibold text-slate-700">Colunas</h2>
                <p className="text-xs text-slate-400">{texto ? `Arquivo de exemplo: ${nomeArquivo}` : "Escolha um extrato deste banco para ver as colunas e a prévia."}</p>
              </div>
              <label className="btn btn-secondary text-sm cursor-pointer">
                {texto ? "Trocar arquivo" : "📂 Escolher arquivo de exemplo"}
                <input type="file" accept=".csv,.txt,text/csv" className="hidden" aria-label="Arquivo de exemplo"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void carregarArquivo(f); }} />
              </label>
            </div>

            {texto ? (
              <>
                <MapeamentoColunas linhas={linhas.slice(0, AMOSTRA)} linhasPular={perfil.linhasPular} papeis={papeis}
                  onPapeis={(p: Papel[]) => mudar(colunasDosPapeis(p))} />
                <PreviaLancamentos texto={texto} perfil={config} />
              </>
            ) : (
              <details className="text-sm">
                <summary className="cursor-pointer text-slate-500">Ajustar pelo número da coluna (a primeira é 0)</summary>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                  {COLUNAS.map(([campo, rotulo]) => (
                    <label key={campo} className="text-slate-700">{rotulo}
                      <input type="number" min={0} value={perfil[campo] ?? ""} className="mt-1 w-full"
                        onChange={(e) => {
                          const v = e.target.value === "" ? null : Number(e.target.value);
                          const mudanca: Partial<Perfil> = { [campo]: v };
                          if (campo === "colEntrada" || campo === "colSaida") mudanca.modoValor = "separadas";
                          if (campo === "colValor") mudanca.modoValor = "unica";
                          mudar(mudanca);
                        }} />
                    </label>
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>
      )}

      {erro && <div className="text-sm text-red-600" role="alert">{erro}</div>}
      <div className="flex justify-end gap-2">
        <Link href="/configuracoes/importacao" className="btn btn-secondary">Cancelar</Link>
        <button className="btn btn-primary" onClick={salvar}
          disabled={salvando || !perfil.nome.trim() || (csv && (perfil.colData == null || perfil.colDescricao == null))}>
          {salvando ? "Salvando…" : "Salvar perfil"}
        </button>
      </div>
    </div>
  );
}

export default function EditarPerfilPage() {
  return <Suspense fallback={<div className="flex justify-center py-20"><div className="spinner" /></div>}><EditarPerfil /></Suspense>;
}
