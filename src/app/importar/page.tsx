"use client";
import { useState, useRef, useEffect } from "react";

interface Perfil {
  id: number;
  nome: string;
  conta: string;
  formato: string;
  usaMesReferencia: boolean;
  builtin: string | null;
}

interface Resultado {
  processados: number;
  novos: number;
  duplicados: number;
  erro?: string;
}

type Papel = "" | "data" | "descricao" | "valor" | "entrada" | "saida";

const DELIMITADORES = [
  { v: ",", label: "Vírgula ( , )" },
  { v: ";", label: "Ponto e vírgula ( ; )" },
  { v: "\\t", label: "Tabulação" },
];
const FORMATOS_DATA = ["DD/MM/AAAA", "AAAA-MM-DD", "DD-MM-AAAA", "MM/DD/AAAA"];

export default function ImportarPage() {
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [modo, setModo] = useState<"importar" | "novo">("importar");

  const carregarPerfis = () => {
    fetch("/api/perfis").then((r) => r.json()).then(setPerfis);
  };
  useEffect(carregarPerfis, []);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Importar Extratos</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setModo("importar")}
            className={`btn ${modo === "importar" ? "btn-primary" : "btn-secondary"}`}
          >📥 Importar</button>
          <button
            onClick={() => setModo("novo")}
            className={`btn ${modo === "novo" ? "btn-primary" : "btn-secondary"}`}
          >➕ Novo perfil</button>
        </div>
      </div>

      {modo === "importar"
        ? <Importar perfis={perfis} />
        : <NovoPerfil onSalvo={() => { carregarPerfis(); setModo("importar"); }} />}

      {/* Perfis existentes */}
      {modo === "importar" && perfis.length > 0 && (
        <div className="card">
          <h2 className="font-semibold text-slate-700 mb-3">Perfis cadastrados</h2>
          <div className="space-y-1.5">
            {perfis.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-100 last:border-0">
                <div>
                  <span className="font-medium text-slate-700">{p.nome}</span>
                  <span className="text-slate-400"> · {p.conta} · {p.formato.toUpperCase()}</span>
                  {p.builtin && <span className="badge bg-slate-100 text-slate-500 ml-2">nativo</span>}
                </div>
                {!p.builtin && (
                  <button
                    onClick={async () => {
                      if (!confirm(`Excluir perfil "${p.nome}"?`)) return;
                      await fetch(`/api/perfis?id=${p.id}`, { method: "DELETE" });
                      carregarPerfis();
                    }}
                    className="text-red-500 hover:text-red-700 text-xs"
                  >Excluir</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Modo Importar ──────────────────────────────────────────────────────────

function Importar({ perfis }: { perfis: Perfil[] }) {
  const [perfilId, setPerfilId] = useState<number | null>(null);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [mesRef, setMesRef] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [resultados, setResultados] = useState<Array<{ nome: string } & Resultado>>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const perfil = perfis.find((p) => p.id === perfilId);

  const importar = async () => {
    if (!arquivos.length || !perfilId) return;
    setCarregando(true);
    setResultados([]);
    const out: Array<{ nome: string } & Resultado> = [];
    for (const arquivo of arquivos) {
      const form = new FormData();
      form.append("file", arquivo);
      form.append("perfilId", String(perfilId));
      if (mesRef) form.append("mesReferencia", mesRef);
      try {
        const res = await fetch("/api/importar", { method: "POST", body: form });
        const json = await res.json();
        out.push(res.ok
          ? { nome: arquivo.name, ...json }
          : { nome: arquivo.name, processados: 0, novos: 0, duplicados: 0, erro: json.error });
      } catch (e) {
        out.push({ nome: arquivo.name, processados: 0, novos: 0, duplicados: 0, erro: String(e) });
      }
    }
    setResultados(out);
    setCarregando(false);
    setArquivos([]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const totalNovos = resultados.reduce((a, r) => a + (r.novos || 0), 0);

  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Perfil de importação</label>
          <div className="grid grid-cols-2 gap-2">
            {perfis.map((p) => (
              <button
                key={p.id}
                onClick={() => setPerfilId(p.id)}
                className={`p-3 rounded-lg border-2 text-left transition-all ${
                  perfilId === p.id ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="font-medium text-sm text-slate-800">{p.nome}</div>
                <div className="text-xs text-slate-400 mt-0.5">{p.conta} · {p.formato.toUpperCase()}</div>
              </button>
            ))}
          </div>
        </div>

        {perfil?.usaMesReferencia && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Mês de referência (fatura)</label>
            <input type="month" value={mesRef} onChange={(e) => setMesRef(e.target.value)} />
            <p className="text-xs text-slate-400 mt-1">Faturas de cartão são lançadas no mês em que serão pagas.</p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Arquivo(s)</label>
          <input ref={inputRef} type="file" accept=".csv,.ofx,.txt" multiple
            onChange={(e) => { setArquivos(Array.from(e.target.files || [])); setResultados([]); }}
            className="w-full" />
        </div>

        {arquivos.length > 0 && (
          <div className="bg-slate-50 rounded-lg p-3 text-sm">
            {arquivos.map((f) => <div key={f.name} className="text-slate-500">• {f.name}</div>)}
          </div>
        )}

        <button className="btn btn-primary w-full justify-center"
          onClick={importar}
          disabled={!arquivos.length || !perfilId || carregando || (perfil?.usaMesReferencia && !mesRef)}>
          {carregando ? <><span className="spinner" /> Importando…</> : "📥 Importar"}
        </button>
      </div>

      {resultados.length > 0 && (
        <div className="card space-y-3">
          <h2 className="font-semibold text-slate-700">Resultado</h2>
          {resultados.map((r) => (
            <div key={r.nome} className={`p-3 rounded-lg text-sm ${r.erro ? "bg-red-50 border border-red-200" : "bg-green-50 border border-green-200"}`}>
              <div className="font-medium">{r.nome}</div>
              {r.erro ? <div className="text-red-600 mt-1">{r.erro}</div> : (
                <div className="text-green-700 mt-1">
                  ✅ {r.novos} novas
                  {r.duplicados > 0 && <span className="text-slate-500"> · {r.duplicados} duplicadas ignoradas</span>}
                  <span className="text-slate-500"> · {r.processados} processadas</span>
                </div>
              )}
            </div>
          ))}
          {totalNovos > 0 && <div className="text-center text-sm font-medium text-green-700">Total: {totalNovos} novas transações!</div>}
        </div>
      )}
    </div>
  );
}

// ─── Modo Novo Perfil ───────────────────────────────────────────────────────

function NovoPerfil({ onSalvo }: { onSalvo: () => void }) {
  const [nome, setNome] = useState("");
  const [conta, setConta] = useState("");
  const [formato, setFormato] = useState<"csv" | "ofx">("csv");
  const [delimitador, setDelimitador] = useState(",");
  const [linhasPular, setLinhasPular] = useState(0);
  const [formatoData, setFormatoData] = useState("DD/MM/AAAA");
  const [inverterSinal, setInverterSinal] = useState(false);
  const [usaMesReferencia, setUsaMesReferencia] = useState(false);

  const [preview, setPreview] = useState<string[][] | null>(null);
  const [papeis, setPapeis] = useState<Papel[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const carregarPreview = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    form.append("delimitador", delimitador);
    const res = await fetch("/api/importar/preview", { method: "POST", body: form });
    const json = await res.json();
    if (json.linhas) {
      setPreview(json.linhas);
      setPapeis(new Array(json.maxCols).fill(""));
    }
  };

  const setPapel = (col: number, papel: Papel) => {
    setPapeis((prev) => {
      const novo = [...prev];
      // Data, descrição e valor são únicos — limpa duplicados
      if (papel && ["data", "descricao", "valor"].includes(papel)) {
        novo.forEach((p, i) => { if (p === papel) novo[i] = ""; });
      }
      novo[col] = papel;
      return novo;
    });
  };

  const idxDe = (papel: Papel) => { const i = papeis.indexOf(papel); return i < 0 ? null : i; };
  const modoValor: "unica" | "separadas" =
    papeis.includes("entrada") || papeis.includes("saida") ? "separadas" : "unica";

  const podeSalvar = nome && conta && (
    formato === "ofx" ||
    (idxDe("data") != null && idxDe("descricao") != null &&
      (modoValor === "unica" ? idxDe("valor") != null : true))
  );

  const salvar = async () => {
    setSalvando(true);
    setErro("");
    const body = {
      nome, conta, formato,
      delimitador, linhasPular, formatoData,
      modoValor,
      colData: idxDe("data"), colDescricao: idxDe("descricao"), colValor: idxDe("valor"),
      colEntrada: idxDe("entrada"), colSaida: idxDe("saida"),
      inverterSinal, usaMesReferencia,
    };
    const res = await fetch("/api/perfis", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    setSalvando(false);
    if (res.ok) onSalvo();
    else setErro((await res.json()).error || "Erro ao salvar");
  };

  const PAPEL_OPTS: { v: Papel; label: string }[] = [
    { v: "", label: "— ignorar —" },
    { v: "data", label: "📅 Data" },
    { v: "descricao", label: "📝 Descrição" },
    { v: "valor", label: "💰 Valor (única)" },
    { v: "entrada", label: "⬆ Entrada" },
    { v: "saida", label: "⬇ Saída" },
  ];

  return (
    <div className="card space-y-5">
      {/* Dados básicos */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Nome do perfil</label>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Itaú Extrato" className="w-full" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Conta</label>
          <input value={conta} onChange={(e) => setConta(e.target.value)} placeholder="Ex: Itaú Corrente" className="w-full" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Formato do arquivo</label>
        <div className="flex gap-2">
          {(["csv", "ofx"] as const).map((f) => (
            <button key={f} onClick={() => { setFormato(f); setPreview(null); }}
              className={`btn ${formato === f ? "btn-primary" : "btn-secondary"}`}>
              {f.toUpperCase()}
            </button>
          ))}
        </div>
        {formato === "ofx" && (
          <p className="text-xs text-slate-400 mt-1">OFX é estruturado — não precisa mapear colunas.</p>
        )}
      </div>

      {/* Opções comuns */}
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={inverterSinal} onChange={(e) => setInverterSinal(e.target.checked)} />
          Inverter sinal (fatura de cartão: positivo = gasto)
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={usaMesReferencia} onChange={(e) => setUsaMesReferencia(e.target.checked)} />
          Pedir mês de referência (fatura)
        </label>
      </div>

      {/* Config CSV + mapeamento */}
      {formato === "csv" && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Delimitador</label>
              <select value={delimitador} onChange={(e) => setDelimitador(e.target.value)} className="w-full">
                {DELIMITADORES.map((d) => <option key={d.v} value={d.v}>{d.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Linhas de cabeçalho</label>
              <input type="number" min={0} value={linhasPular}
                onChange={(e) => setLinhasPular(parseInt(e.target.value) || 0)} className="w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Formato da data</label>
              <select value={formatoData} onChange={(e) => setFormatoData(e.target.value)} className="w-full">
                {FORMATOS_DATA.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Suba uma amostra do CSV para mapear as colunas
            </label>
            <input type="file" accept=".csv,.txt"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) carregarPreview(f); }} className="w-full" />
          </div>

          {preview && (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    {papeis.map((p, col) => (
                      <th key={col} style={{ padding: 6, borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
                        <select value={p} onChange={(e) => setPapel(col, e.target.value as Papel)}
                          style={{ fontSize: 11, padding: "2px 4px" }}>
                          {PAPEL_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                        </select>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((linha, li) => (
                    <tr key={li} style={{ opacity: li < linhasPular ? 0.35 : 1, background: li < linhasPular ? "#fef2f2" : undefined }}>
                      {papeis.map((_, col) => (
                        <td key={col} style={{ padding: "4px 6px", borderBottom: "0.5px solid #f1f5f9", whiteSpace: "nowrap", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}
                          title={linha[col]}>
                          {linha[col] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-xs text-slate-400 p-2 bg-slate-50">
                Linhas em vermelho serão ignoradas (cabeçalho). Ajuste &quot;Linhas de cabeçalho&quot; acima.
              </div>
            </div>
          )}
        </>
      )}

      {erro && <div className="text-sm text-red-600">{erro}</div>}

      <button className="btn btn-primary w-full justify-center" onClick={salvar} disabled={!podeSalvar || salvando}>
        {salvando ? "Salvando…" : "💾 Salvar perfil"}
      </button>
      {!podeSalvar && formato === "csv" && (
        <p className="text-xs text-slate-400 text-center -mt-2">
          Preencha nome, conta e marque pelo menos Data, Descrição e Valor (ou Entrada/Saída).
        </p>
      )}
    </div>
  );
}
