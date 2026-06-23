"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import { detectarFormato, detectarBancoOFX, sugerirPapeis, type Papel } from "@/lib/importacao/detectar";

interface Perfil {
  id: number;
  nome: string;
  conta: string;
  formato: string;
  usaMesReferencia: boolean;
  builtin: string | null;
  ativo: boolean;
}

interface Resultado {
  processados: number;
  novos: number;
  duplicados: number;
  erro?: string;
}

type Fase =
  | "upload"
  | "detectando"
  | "confirmar_ofx"   // OFX reconhecido → perfil ativo encontrado
  | "novo_ofx"        // OFX sem perfil ativo correspondente
  | "selecionar_csv"  // CSV → escolher perfil existente ou criar novo
  | "mapeamento_csv"  // CSV → mapear colunas (perfil novo ou selecionado mas requerendo ajuste)
  | "importando"
  | "resultado";

const DELIMITADORES = [
  { v: ",",  label: "Vírgula ( , )" },
  { v: ";",  label: "Ponto e vírgula ( ; )" },
  { v: "\\t", label: "Tabulação" },
];
const FORMATOS_DATA = ["DD/MM/AAAA", "AAAA-MM-DD", "DD-MM-AAAA", "MM/DD/AAAA"];
const PAPEL_OPTS: { v: Papel; label: string }[] = [
  { v: "",          label: "— ignorar —" },
  { v: "data",      label: "📅 Data" },
  { v: "descricao", label: "📝 Descrição" },
  { v: "valor",     label: "💰 Valor (única)" },
  { v: "entrada",   label: "⬆ Entrada" },
  { v: "saida",     label: "⬇ Saída" },
];

async function lerArquivo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = (e) => resolve((e.target?.result as string) ?? "");
    r.onerror = reject;
    r.readAsText(file, "latin1");
  });
}

export default function ImportarPage() {
  const [perfisAtivos, setPerfisAtivos] = useState<Perfil[]>([]);
  const [fase, setFase] = useState<Fase>("upload");

  // arquivo atual
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [textoArquivo, setTextoArquivo] = useState("");

  // OFX
  const [perfilOFX, setPerfilOFX]     = useState<Perfil | null>(null); // perfil ativo encontrado
  const [orgName, setOrgName]         = useState("");
  const [nomeNovo, setNomeNovo]       = useState("");
  const [contaNovo, setContaNovo]     = useState("");
  const [salvarPerfil, setSalvarPerfil] = useState(true);
  const [mesRef, setMesRef]           = useState("");

  // CSV
  const [preview, setPreview]         = useState<string[][]>([]);
  const [papeis, setPapeis]           = useState<Papel[]>([]);
  const [delimitador, setDelimitador] = useState(",");
  const [linhasPular, setLinhasPular] = useState(0);
  const [formatoData, setFormatoData] = useState("DD/MM/AAAA");
  const [inverterSinal, setInverterSinal] = useState(false);
  const [usaMesRef, setUsaMesRef]     = useState(false);
  const [nomePerfil, setNomePerfil]   = useState("");
  const [contaPerfil, setContaPerfil] = useState("");
  const [perfilCSV, setPerfilCSV]     = useState<Perfil | null>(null); // perfil CSV selecionado

  // resultado
  const [resultado, setResultado]     = useState<Resultado | null>(null);
  const [erroImport, setErroImport]   = useState("");

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/perfis").then((r) => r.json()).then(setPerfisAtivos);
  }, []);

  const resetar = () => {
    setFase("upload");
    setArquivo(null);
    setTextoArquivo("");
    setPerfilOFX(null);
    setOrgName("");
    setNomeNovo("");
    setContaNovo("");
    setMesRef("");
    setPreview([]);
    setPapeis([]);
    setNomePerfil("");
    setContaPerfil("");
    setPerfilCSV(null);
    setResultado(null);
    setErroImport("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const processarArquivo = useCallback(async (file: File) => {
    setArquivo(file);
    setFase("detectando");

    const texto = await lerArquivo(file);
    setTextoArquivo(texto);

    const formato = detectarFormato(texto, file.name);

    if (formato === "ofx") {
      const { builtinKey, orgName: org } = detectarBancoOFX(texto);
      setOrgName(org);

      if (builtinKey) {
        const perfil = perfisAtivos.find((p) => p.builtin === builtinKey);
        if (perfil) {
          setPerfilOFX(perfil);
          setFase("confirmar_ofx");
          return;
        }
        // builtin conhecido mas não está ativo → oferecer como novo
        const nomeDefault = builtinKey.replace(/-ofx$/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        setNomeNovo(nomeDefault);
      }
      setFase("novo_ofx");
      return;
    }

    // CSV
    const csvPerfis = perfisAtivos.filter((p) => p.formato === "csv" && !p.builtin);
    if (csvPerfis.length > 0) {
      // Carrega preview em paralelo enquanto aguarda escolha
      const form = new FormData();
      form.append("file", file);
      form.append("delimitador", delimitador);
      fetch("/api/importar/preview", { method: "POST", body: form })
        .then((r) => r.json())
        .then((j) => {
          if (j.linhas) {
            setPreview(j.linhas);
            setPapeis(sugerirPapeis(j.linhas, linhasPular));
          }
        });
      setFase("selecionar_csv");
    } else {
      await carregarPreviewCSV(file, delimitador, linhasPular);
      setFase("mapeamento_csv");
    }
  }, [perfisAtivos, delimitador, linhasPular]);

  const carregarPreviewCSV = async (file: File, delim: string, pular: number) => {
    const form = new FormData();
    form.append("file", file);
    form.append("delimitador", delim);
    const res = await fetch("/api/importar/preview", { method: "POST", body: form });
    const json = await res.json();
    if (json.linhas) {
      setPreview(json.linhas);
      setPapeis(sugerirPapeis(json.linhas, pular));
    }
  };

  const setPapel = (col: number, papel: Papel) => {
    setPapeis((prev) => {
      const novo = [...prev];
      if (papel && ["data", "descricao", "valor"].includes(papel)) {
        novo.forEach((p, i) => { if (p === papel) novo[i] = ""; });
      }
      novo[col] = papel;
      return novo;
    });
  };

  const idxDe = (p: Papel) => { const i = papeis.indexOf(p); return i < 0 ? null : i; };
  const modoValor: "unica" | "separadas" =
    papeis.includes("entrada") || papeis.includes("saida") ? "separadas" : "unica";

  const importar = async (perfilId: number, mRef?: string) => {
    if (!arquivo) return;
    setFase("importando");
    setErroImport("");
    const form = new FormData();
    form.append("file", arquivo);
    form.append("perfilId", String(perfilId));
    if (mRef) form.append("mesReferencia", mRef);
    try {
      const res = await fetch("/api/importar", { method: "POST", body: form });
      const json = await res.json();
      if (res.ok) {
        setResultado(json);
      } else {
        setErroImport(json.error || "Erro ao importar");
        setResultado({ processados: 0, novos: 0, duplicados: 0 });
      }
    } catch (e) {
      setErroImport(String(e));
      setResultado({ processados: 0, novos: 0, duplicados: 0 });
    }
    setFase("resultado");
  };

  const importarNovoOFX = async () => {
    if (!nomeNovo || !contaNovo) return;
    setFase("importando");
    let idPerfil: number;
    if (salvarPerfil) {
      const res = await fetch("/api/perfis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nomeNovo, conta: contaNovo, formato: "ofx" }),
      });
      const json = await res.json();
      idPerfil = json.id;
      setPerfisAtivos((prev) => [...prev, json]);
    } else {
      // Cria temporariamente e deleta depois? Não — usa um perfil OFX genérico.
      // Por simplicidade: cria sem salvar com nome temporário.
      const res = await fetch("/api/perfis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nomeNovo, conta: contaNovo, formato: "ofx", ativo: false }),
      });
      const json = await res.json();
      idPerfil = json.id;
    }
    await importar(idPerfil, mesRef || undefined);
  };

  const importarCSVNovo = async () => {
    if (!nomePerfil || !contaPerfil) return;
    if (idxDe("data") == null || idxDe("descricao") == null) return;
    setFase("importando");
    const body = {
      nome: nomePerfil, conta: contaPerfil, formato: "csv",
      delimitador, linhasPular, formatoData, modoValor,
      colData: idxDe("data"), colDescricao: idxDe("descricao"), colValor: idxDe("valor"),
      colEntrada: idxDe("entrada"), colSaida: idxDe("saida"),
      inverterSinal, usaMesReferencia: usaMesRef,
    };
    const res = await fetch("/api/perfis", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const json = await res.json();
    setPerfisAtivos((prev) => [...prev, json]);
    await importar(json.id, usaMesRef ? mesRef : undefined);
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Importar Extratos</h1>

      {/* UPLOAD */}
      {fase === "upload" && (
        <DropZone onFile={processarArquivo} inputRef={inputRef} />
      )}

      {/* DETECTANDO */}
      {fase === "detectando" && (
        <div className="card flex items-center gap-3 text-slate-500">
          <span className="spinner" /> Analisando arquivo…
        </div>
      )}

      {/* CONFIRMAR OFX */}
      {fase === "confirmar_ofx" && perfilOFX && (
        <div className="card space-y-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <div className="font-semibold text-slate-800">Banco identificado: {perfilOFX.nome}</div>
              <div className="text-sm text-slate-400 mt-0.5">Arquivo: {arquivo?.name}</div>
            </div>
          </div>

          {perfilOFX.usaMesReferencia && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Mês de referência (fatura)</label>
              <input type="month" value={mesRef} onChange={(e) => setMesRef(e.target.value)} />
              <p className="text-xs text-slate-400 mt-1">Faturas de cartão são lançadas no mês em que serão pagas.</p>
            </div>
          )}

          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={resetar}>← Trocar arquivo</button>
            <button
              className="btn btn-primary flex-1 justify-center"
              disabled={perfilOFX.usaMesReferencia && !mesRef}
              onClick={() => importar(perfilOFX.id, mesRef || undefined)}
            >
              📥 Importar agora
            </button>
          </div>
        </div>
      )}

      {/* NOVO OFX */}
      {fase === "novo_ofx" && (
        <div className="card space-y-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">📄</span>
            <div>
              <div className="font-semibold text-slate-800">Arquivo OFX detectado</div>
              <div className="text-sm text-slate-400 mt-0.5">Banco: {orgName} · {arquivo?.name}</div>
              <div className="text-xs text-slate-500 mt-1">Banco não reconhecido automaticamente. Preencha os dados abaixo para importar.</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nome do perfil</label>
              <input value={nomeNovo} onChange={(e) => setNomeNovo(e.target.value)} placeholder="Ex: Sicredi Corrente" className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Conta</label>
              <input value={contaNovo} onChange={(e) => setContaNovo(e.target.value)} placeholder="Ex: Sicredi" className="w-full" />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={salvarPerfil} onChange={(e) => setSalvarPerfil(e.target.checked)} />
            Salvar perfil para próximas importações
          </label>

          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={resetar}>← Trocar arquivo</button>
            <button
              className="btn btn-primary flex-1 justify-center"
              disabled={!nomeNovo || !contaNovo}
              onClick={importarNovoOFX}
            >
              📥 Importar
            </button>
          </div>
        </div>
      )}

      {/* SELECIONAR CSV */}
      {fase === "selecionar_csv" && (
        <div className="card space-y-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">📋</span>
            <div>
              <div className="font-semibold text-slate-800">Arquivo CSV detectado</div>
              <div className="text-sm text-slate-400 mt-0.5">{arquivo?.name}</div>
            </div>
          </div>

          <div>
            <div className="text-sm font-medium text-slate-700 mb-2">Qual perfil usar?</div>
            <div className="grid grid-cols-2 gap-2">
              {perfisAtivos.filter((p) => p.formato === "csv" && !p.builtin).map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setPerfilCSV(p);
                    importar(p.id, p.usaMesReferencia ? mesRef : undefined);
                  }}
                  className="p-3 rounded-lg border-2 border-slate-200 hover:border-blue-400 text-left transition-all"
                >
                  <div className="font-medium text-sm text-slate-800">{p.nome}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{p.conta}</div>
                </button>
              ))}
              <button
                onClick={async () => {
                  if (preview.length === 0 && arquivo) {
                    await carregarPreviewCSV(arquivo, delimitador, linhasPular);
                  }
                  setFase("mapeamento_csv");
                }}
                className="p-3 rounded-lg border-2 border-dashed border-slate-300 hover:border-blue-400 text-left transition-all"
              >
                <div className="font-medium text-sm text-slate-600">➕ Novo mapeamento</div>
                <div className="text-xs text-slate-400 mt-0.5">Definir colunas manualmente</div>
              </button>
            </div>
          </div>

          <button className="btn btn-secondary" onClick={resetar}>← Trocar arquivo</button>
        </div>
      )}

      {/* MAPEAMENTO CSV */}
      {fase === "mapeamento_csv" && (
        <div className="card space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-semibold text-slate-800">Mapear colunas do CSV</div>
              <div className="text-sm text-slate-400 mt-0.5">{arquivo?.name}</div>
            </div>
            <button className="btn btn-secondary text-xs" onClick={resetar}>← Trocar arquivo</button>
          </div>

          {/* Config */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Delimitador</label>
              <select
                value={delimitador}
                onChange={async (e) => {
                  setDelimitador(e.target.value);
                  if (arquivo) await carregarPreviewCSV(arquivo, e.target.value, linhasPular);
                }}
                className="w-full"
              >
                {DELIMITADORES.map((d) => <option key={d.v} value={d.v}>{d.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Linhas de cabeçalho</label>
              <input
                type="number" min={0} value={linhasPular}
                onChange={(e) => {
                  const n = parseInt(e.target.value) || 0;
                  setLinhasPular(n);
                  if (preview.length > 0) setPapeis(sugerirPapeis(preview, n));
                }}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Formato da data</label>
              <select value={formatoData} onChange={(e) => setFormatoData(e.target.value)} className="w-full">
                {FORMATOS_DATA.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={inverterSinal} onChange={(e) => setInverterSinal(e.target.checked)} />
              Inverter sinal (fatura: positivo = gasto)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={usaMesRef} onChange={(e) => setUsaMesRef(e.target.checked)} />
              Pedir mês de referência (fatura)
            </label>
          </div>

          {usaMesRef && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Mês de referência</label>
              <input type="month" value={mesRef} onChange={(e) => setMesRef(e.target.value)} />
            </div>
          )}

          {/* Tabela de mapeamento */}
          {preview.length > 0 && (
            <>
              <div className="text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2">
                💡 Sugestão automática aplicada — ajuste se necessário.
              </div>
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
                  Linhas em vermelho serão ignoradas (cabeçalho).
                </div>
              </div>
            </>
          )}

          {/* Nome do perfil */}
          <div className="border-t border-slate-100 pt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nome do perfil</label>
              <input value={nomePerfil} onChange={(e) => setNomePerfil(e.target.value)} placeholder="Ex: Nubank Crédito" className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Conta</label>
              <input value={contaPerfil} onChange={(e) => setContaPerfil(e.target.value)} placeholder="Ex: Nubank" className="w-full" />
            </div>
          </div>

          <button
            className="btn btn-primary w-full justify-center"
            disabled={!nomePerfil || !contaPerfil || idxDe("data") == null || idxDe("descricao") == null || (usaMesRef && !mesRef)}
            onClick={importarCSVNovo}
          >
            💾 Salvar perfil e importar
          </button>
          <p className="text-xs text-slate-400 text-center -mt-2">
            O perfil fica salvo para as próximas importações.
          </p>
        </div>
      )}

      {/* IMPORTANDO */}
      {fase === "importando" && (
        <div className="card flex items-center gap-3 text-slate-500">
          <span className="spinner" /> Importando…
        </div>
      )}

      {/* RESULTADO */}
      {fase === "resultado" && resultado && (
        <div className="card space-y-4">
          {erroImport ? (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
              ❌ {erroImport}
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-green-50 border border-green-200 text-sm">
              <div className="font-semibold text-green-800 text-base mb-1">
                ✅ {resultado.novos} nova{resultado.novos !== 1 ? "s" : ""} transaç{resultado.novos !== 1 ? "ões" : "ão"} importada{resultado.novos !== 1 ? "s" : ""}
              </div>
              {resultado.duplicados > 0 && (
                <div className="text-slate-500">{resultado.duplicados} duplicadas ignoradas</div>
              )}
              <div className="text-slate-500">{resultado.processados} processadas no total</div>
            </div>
          )}
          <button className="btn btn-primary w-full justify-center" onClick={resetar}>
            📂 Importar outro arquivo
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Drop Zone ───────────────────────────────────────────────────────────────

function DropZone({ onFile, inputRef }: { onFile: (f: File) => void; inputRef: React.RefObject<HTMLInputElement | null> }) {
  const [drag, setDrag] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`card cursor-pointer transition-all text-center py-12 border-2 border-dashed ${
        drag ? "border-blue-400 bg-blue-50" : "border-slate-300 hover:border-blue-300 hover:bg-slate-50"
      }`}
    >
      <div className="text-4xl mb-3">📂</div>
      <div className="font-semibold text-slate-700 mb-1">Arraste o arquivo aqui ou clique para selecionar</div>
      <div className="text-sm text-slate-400">Formatos aceitos: CSV e OFX</div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.ofx,.txt"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />
    </div>
  );
}
