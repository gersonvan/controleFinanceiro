"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import ComoBaixarExtrato from "@/components/ComoBaixarExtrato";
import { vencimentoNoNome } from "@/lib/importacao/mes-referencia";
import { decodificarBytes } from "@/lib/importacao/decodificar";
import ImportacaoLote, { type ItemLote } from "@/components/importacao/ImportacaoLote";
import type { AnaliseArquivo } from "@/app/api/importar/analisar/route";
import { detectarFormato, detectarBancoOFX, detectarPerfilCSV, sugerirPapeis, type Papel } from "@/lib/importacao/detectar";

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
  reembolsosVinculados?: number;
  erro?: string;
}

type Fase =
  | "upload"
  | "detectando"
  | "confirmar_ofx"   // OFX reconhecido → perfil ativo encontrado
  | "novo_ofx"        // OFX sem perfil ativo correspondente
  | "confirmar_pdf"   // PDF → banco identificado + preview de transações
  | "confirmar_csv"   // CSV reconhecido → perfil nativo encontrado
  | "novo_pdf"        // PDF → banco não identificado
  | "selecionar_csv"  // CSV → escolher perfil existente ou criar novo
  | "mapeamento_csv"  // CSV → mapear colunas
  | "importando"
  | "resultado"
  | "lote";           // vários arquivos: fila analisada, importação em conjunto

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
  { v: "parcela",    label: "🔢 Parcela" },
  { v: "valor",     label: "💰 Valor (única)" },
  { v: "entrada",   label: "⬆ Entrada" },
  { v: "saida",     label: "⬇ Saída" },
];

// Mesma decodificação do servidor. Ler tudo como Latin-1 estragava "Cartão"
// nos CSV do C6 e a fatura deixava de ser reconhecida.
async function lerArquivo(file: File): Promise<string> {
  return decodificarBytes(await file.arrayBuffer());
}

export default function ImportarPage() {
  const [perfisAtivos, setPerfisAtivos] = useState<Perfil[]>([]);
  const [fase, setFase] = useState<Fase>("upload");

  // arquivo atual
  const [arquivo, setArquivo] = useState<File | null>(null);

  // OFX
  const [perfilOFX, setPerfilOFX]     = useState<Perfil | null>(null);
  const [orgName, setOrgName]         = useState("");
  const [nomeNovo, setNomeNovo]       = useState("");
  const [contaNovo, setContaNovo]     = useState("");
  const [salvarPerfil, setSalvarPerfil] = useState(true);
  const [mesRef, setMesRef]           = useState("");

  // PDF
  const [perfilPDF, setPerfilPDF]     = useState<Perfil | null>(null);
  const [perfilCSV, setPerfilCSV]     = useState<Perfil | null>(null);
  const [bancoNomePDF, setBancoNomePDF] = useState("");
  const [previewPDF, setPreviewPDF]   = useState<Array<{ data: string; descricao: string; valor: number }>>([]);
  const [contaPDF, setContaPDF]       = useState("");

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

  // resultado
  const [resultado, setResultado]     = useState<Resultado | null>(null);
  const [erroImport, setErroImport]   = useState("");

  // lote (vários arquivos)
  const [lote, setLote]               = useState<ItemLote[]>([]);
  const [loteAtual, setLoteAtual]     = useState<number | null>(null); // item em configuração manual
  const [importandoLote, setImportandoLote] = useState(false);
  const proximoIdLote = useRef(1);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/perfis").then((r) => r.json()).then(setPerfisAtivos);
  }, []);

  const resetar = () => {
    setFase("upload");
    setArquivo(null);
    setPerfilOFX(null);
    setOrgName("");
    setNomeNovo("");
    setContaNovo("");
    setMesRef("");
    setPerfilPDF(null);
    setPerfilCSV(null);
    setBancoNomePDF("");
    setPreviewPDF([]);
    setContaPDF("");
    setPreview([]);
    setPapeis([]);
    setNomePerfil("");
    setContaPerfil("");
    setResultado(null);
    setErroImport("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const carregarPreviewCSV = useCallback(async (file: File, delim: string, pular: number) => {
    const form = new FormData();
    form.append("file", file);
    form.append("delimitador", delim);
    const res = await fetch("/api/importar/preview", { method: "POST", body: form });
    const json = await res.json();
    if (json.linhas) {
      setPreview(json.linhas);
      setPapeis(sugerirPapeis(json.linhas, pular));
    }
  }, []);

  const processarArquivo = useCallback(async (file: File) => {
    setArquivo(file);
    setFase("detectando");

    const texto = await lerArquivo(file);

    const formato = detectarFormato(texto, file.name);

    if (formato === "pdf") {
      // Para PDF: envia ao servidor para extração de texto + detecção de banco
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/importar/pdf-preview", { method: "POST", body: form });
      const json = await res.json();
      setBancoNomePDF(json.bancoNome ?? "Banco não identificado");
      setPreviewPDF(json.preview ?? []);

      if (json.perfilId) {
        const perfil = perfisAtivos.find((p) => p.id === json.perfilId);
        setPerfilPDF(perfil ?? null);
        setFase("confirmar_pdf");
      } else {
        setFase("novo_pdf");
      }
      return;
    }

    if (formato === "ofx") {
      const { builtinKey, orgName: org } = detectarBancoOFX(texto);
      setOrgName(org);

      if (builtinKey) {
        const perfil = perfisAtivos.find((p) => p.builtin === builtinKey);
        if (perfil) {
          setPerfilOFX(perfil);
          if (perfil.usaMesReferencia) setMesRef(vencimentoNoNome(file.name) ?? "");
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
    const { builtinKey, nome } = detectarPerfilCSV(texto);
    if (builtinKey) {
      const perfil = perfisAtivos.find((p) => p.builtin === builtinKey);
      if (perfil) {
        setPerfilCSV(perfil);
        setNomePerfil(nome);
        setMesRef(perfil.usaMesReferencia ? vencimentoNoNome(file.name) ?? "" : "");
        setFase("confirmar_csv");
        return;
      }
    }

    const csvPerfis = perfisAtivos.filter((p) => p.formato === "csv");
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
  }, [carregarPreviewCSV, perfisAtivos, delimitador, linhasPular]);

  const setPapel = (col: number, papel: Papel) => {
    setPapeis((prev) => {
      const novo = [...prev];
      if (papel && ["data", "descricao", "parcela", "valor"].includes(papel)) {
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
      colParcela: idxDe("parcela"),
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

  // ─── Lote ────────────────────────────────────────────────────────────────

  const atualizarItem = (id: number, mudanca: Partial<ItemLote>) =>
    setLote((prev) => prev.map((i) => (i.id === id ? { ...i, ...mudanca } : i)));

  const analisarItem = async (item: ItemLote) => {
    const form = new FormData();
    form.append("file", item.file);
    try {
      const res = await fetch("/api/importar/analisar", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        atualizarItem(item.id, { status: "erro", erro: json.error ?? "Não foi possível analisar o arquivo." });
        return;
      }
      const analise = json as AnaliseArquivo;
      atualizarItem(item.id, {
        analise,
        status: analise.reconhecido ? "pronto" : "configurar",
        mesRef: analise.mesReferenciaSugerido ?? "",
      });
    } catch {
      atualizarItem(item.id, { status: "erro", erro: "Falha de conexão ao analisar o arquivo." });
    }
  };

  const adicionarAoLote = async (files: File[]) => {
    const novos: ItemLote[] = files.map((file) => ({
      id: proximoIdLote.current++, file, status: "analisando", mesRef: "",
    }));
    setLote((prev) => [...prev, ...novos]);
    setFase("lote");
    // Até 3 análises simultâneas: cada uma lê o arquivo inteiro no servidor.
    const fila = [...novos];
    const trabalhador = async () => {
      for (let item = fila.shift(); item; item = fila.shift()) await analisarItem(item);
    };
    await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
  };

  // Um arquivo só (e nenhum lote em andamento) segue o fluxo guiado de sempre.
  const receberArquivos = (files: File[]) => {
    if (files.length === 0) return;
    if (files.length === 1 && lote.length === 0) void processarArquivo(files[0]);
    else void adicionarAoLote(files);
  };

  // Em sequência: cada importação consulta o que já existe, então arquivos que
  // se sobrepõem não geram duplicatas entre si.
  const importarLote = async () => {
    const fila = lote.filter((i) => i.status === "pronto" && i.analise?.perfil);
    setImportandoLote(true);
    for (const item of fila) {
      atualizarItem(item.id, { status: "importando" });
      const form = new FormData();
      form.append("file", item.file);
      form.append("perfilId", String(item.analise!.perfil!.id));
      if (item.analise!.perfil!.usaMesReferencia && item.mesRef) form.append("mesReferencia", item.mesRef);
      try {
        const res = await fetch("/api/importar", { method: "POST", body: form });
        const json = await res.json();
        if (res.ok) atualizarItem(item.id, { status: "importado", resultado: json });
        else atualizarItem(item.id, { status: "erro", erro: json.error ?? "Erro ao importar" });
      } catch {
        atualizarItem(item.id, { status: "erro", erro: "Falha de conexão ao importar." });
      }
    }
    setImportandoLote(false);
  };

  const configurarDoLote = (id: number) => {
    const item = lote.find((i) => i.id === id);
    if (!item) return;
    setLoteAtual(id);
    void processarArquivo(item.file);
  };

  // Volta do fluxo de um arquivo para a fila, levando o resultado se houve importação.
  const voltarParaLote = () => {
    if (loteAtual !== null && fase === "resultado" && resultado) {
      atualizarItem(loteAtual, erroImport
        ? { status: "erro", erro: erroImport }
        : { status: "importado", resultado });
    }
    setLoteAtual(null);
    resetar();
    setFase("lote");
  };

  const recomecar = () => {
    setLote([]);
    setLoteAtual(null);
    resetar();
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Importar Extratos</h1>

      {/* UPLOAD */}
      {fase === "upload" && (
        <>
          <DropZone onFiles={receberArquivos} inputRef={inputRef} />
          <ComoBaixarExtrato />
        </>
      )}

      {/* LOTE */}
      {fase === "lote" && (
        <ImportacaoLote
          itens={lote}
          importando={importandoLote}
          onMesRef={(id, mesRef) => atualizarItem(id, { mesRef })}
          onRemover={(id) => setLote((prev) => prev.filter((i) => i.id !== id))}
          onConfigurar={configurarDoLote}
          onAdicionar={(files) => void adicionarAoLote(files)}
          onImportarTodos={() => void importarLote()}
          onRecomecar={recomecar}
        />
      )}

      {/* Configurando um arquivo do lote */}
      {loteAtual !== null && fase !== "lote" && fase !== "importando" && fase !== "resultado" && (
        <button onClick={voltarParaLote} className="text-sm text-blue-600 hover:underline">
          ← Voltar para a lista sem importar {lote.find((i) => i.id === loteAtual)?.file.name ?? "este arquivo"}
        </button>
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

      {/* CONFIRMAR PDF */}
      {fase === "confirmar_pdf" && perfilPDF && (
        <div className="card space-y-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">📄</span>
            <div>
              <div className="font-semibold text-slate-800">Banco identificado: {bancoNomePDF}</div>
              <div className="text-sm text-slate-400 mt-0.5">Arquivo: {arquivo?.name}</div>
            </div>
          </div>

          {previewPDF.length > 0 && (
            <div>
              <div className="text-xs font-medium text-slate-500 mb-1">Prévia das transações encontradas</div>
              <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
                <table className="w-full">
                  <tbody>
                    {previewPDF.map((t, i) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-1.5 text-slate-400 whitespace-nowrap">{t.data}</td>
                        <td className="px-3 py-1.5 text-slate-700 truncate max-w-xs">{t.descricao}</td>
                        <td className={`px-3 py-1.5 text-right whitespace-nowrap font-medium ${t.valor < 0 ? "text-red-600" : "text-green-600"}`}>
                          {t.valor < 0 ? "-" : "+"}R$ {Math.abs(t.valor).toFixed(2).replace(".", ",")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {previewPDF.length === 10 && (
                  <div className="px-3 py-1.5 text-xs text-slate-400 bg-slate-50">Mostrando as primeiras 10 transações…</div>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Mês de referência (fatura)</label>
            <input type="month" value={mesRef} onChange={(e) => setMesRef(e.target.value)} />
            <p className="text-xs text-slate-400 mt-1">Informe o mês em que esta fatura será paga.</p>
          </div>

          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={resetar}>← Trocar arquivo</button>
            <button
              className="btn btn-primary flex-1 justify-center"
              disabled={!mesRef}
              onClick={() => importar(perfilPDF.id, mesRef)}
            >
              📥 Importar {previewPDF.length > 0 ? `(~${previewPDF.length}+ transações)` : ""}
            </button>
          </div>
        </div>
      )}

      {fase === "confirmar_csv" && perfilCSV && (
        <div className="card space-y-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">{perfilCSV.usaMesReferencia ? "💳" : "🏦"}</span>
            <div>
              <div className="font-semibold text-slate-800">
                {perfilCSV.usaMesReferencia ? "Fatura identificada" : "Extrato identificado"}: {perfilCSV.nome}
              </div>
              <div className="text-sm text-slate-400 mt-0.5">{arquivo?.name}</div>
            </div>
          </div>
          <p className="text-sm text-slate-500">
            As colunas, o sinal de compras e as parcelas serão tratados automaticamente.
          </p>
          {perfilCSV.usaMesReferencia && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Mês de referência da fatura</label>
              <input type="month" value={mesRef} onChange={(e) => setMesRef(e.target.value)} />
              <p className="text-xs text-slate-400 mt-1">O mês do vencimento: é nele que os gastos da fatura entram.</p>
            </div>
          )}
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={resetar}>← Trocar arquivo</button>
            <button
              className="btn btn-primary flex-1 justify-center"
              disabled={perfilCSV.usaMesReferencia && !mesRef}
              onClick={() => importar(perfilCSV.id, perfilCSV.usaMesReferencia ? mesRef : undefined)}
            >
              📥 Importar {perfilCSV.usaMesReferencia ? "fatura" : "extrato"}
            </button>
          </div>
        </div>
      )}

      {/* NOVO PDF — banco não identificado */}
      {fase === "novo_pdf" && (
        <div className="card space-y-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">📄</span>
            <div>
              <div className="font-semibold text-slate-800">PDF detectado</div>
              <div className="text-sm text-slate-400 mt-0.5">
                {bancoNomePDF !== "Banco não identificado" ? `Banco: ${bancoNomePDF}` : "Banco não reconhecido automaticamente"} · {arquivo?.name}
              </div>
            </div>
          </div>

          {previewPDF.length > 0 && (
            <div>
              <div className="text-xs font-medium text-slate-500 mb-1">Transações encontradas</div>
              <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
                <table className="w-full">
                  <tbody>
                    {previewPDF.map((t, i) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-1.5 text-slate-400 whitespace-nowrap">{t.data}</td>
                        <td className="px-3 py-1.5 text-slate-700 truncate max-w-xs">{t.descricao}</td>
                        <td className={`px-3 py-1.5 text-right whitespace-nowrap font-medium ${t.valor < 0 ? "text-red-600" : "text-green-600"}`}>
                          {t.valor < 0 ? "-" : "+"}R$ {Math.abs(t.valor).toFixed(2).replace(".", ",")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="text-sm text-slate-500">
            {previewPDF.length === 0
              ? "Não foi possível extrair transações deste PDF. Certifique-se de que é um PDF digital (não escaneado)."
              : "Banco não está nos perfis ativos. Ative-o em Configurações, ou preencha os dados abaixo para importar diretamente."}
          </p>

          {previewPDF.length > 0 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nome do banco / conta</label>
                  <input value={contaPDF} onChange={(e) => setContaPDF(e.target.value)} placeholder="Ex: Santander Cartão" className="w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Mês de referência</label>
                  <input type="month" value={mesRef} onChange={(e) => setMesRef(e.target.value)} />
                </div>
              </div>

              <button
                className="btn btn-primary w-full justify-center"
                disabled={!contaPDF || !mesRef}
                onClick={async () => {
                  // Cria perfil genérico PDF e importa
                  const res = await fetch("/api/perfis", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ nome: contaPDF, conta: contaPDF, formato: "pdf", usaMesReferencia: true }),
                  });
                  const json = await res.json();
                  setPerfisAtivos((prev) => [...prev, json]);
                  await importar(json.id, mesRef);
                }}
              >
                📥 Importar assim mesmo
              </button>
            </>
          )}

          <button className="btn btn-secondary w-full justify-center" onClick={resetar}>← Trocar arquivo</button>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {perfisAtivos.filter((p) => p.formato === "csv").map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    // fatura precisa do mês: confirma antes de importar
                    if (p.usaMesReferencia) {
                      setPerfilCSV(p);
                      setMesRef(arquivo ? vencimentoNoNome(arquivo.name) ?? "" : "");
                      setFase("confirmar_csv");
                    } else {
                      importar(p.id);
                    }
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

          <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800">
            <span className="font-semibold">💡 Dica para faturas de cartão:</span>{" "}
            marque <strong>Inverter sinal</strong> quando as compras vierem com valor positivo no arquivo — assim elas entram como gastos. Use o <strong>mês de referência</strong> para informar em qual mês a fatura será paga, mesmo que a compra tenha ocorrido antes.
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
              {!!resultado.reembolsosVinculados && (
                <div className="text-emerald-700">
                  {resultado.reembolsosVinculados} Pix de reembolso dividido{resultado.reembolsosVinculados !== 1 ? "s" : ""} pelo seu padrão
                </div>
              )}
              {resultado.duplicados > 0 && (
                <div className="text-slate-500">{resultado.duplicados} duplicadas ignoradas</div>
              )}
              <div className="text-slate-500">{resultado.processados} processadas no total</div>
            </div>
          )}
          {loteAtual !== null ? (
            <button className="btn btn-primary w-full justify-center" onClick={voltarParaLote}>
              ← Voltar para a lista
            </button>
          ) : (
            <button className="btn btn-primary w-full justify-center" onClick={resetar}>
              📂 Importar outro arquivo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Drop Zone ───────────────────────────────────────────────────────────────

function DropZone({ onFiles, inputRef }: { onFiles: (f: File[]) => void; inputRef: React.RefObject<HTMLInputElement | null> }) {
  const [drag, setDrag] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    onFiles(Array.from(e.dataTransfer.files));
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
      <div className="font-semibold text-slate-700 mb-1">Arraste os arquivos aqui ou clique para selecionar</div>
      <div className="text-sm text-slate-400">PDF, CSV e OFX — pode escolher vários de uma vez (extratos e faturas de bancos diferentes)</div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.ofx,.txt,.pdf"
        multiple
        className="hidden"
        onChange={(e) => { onFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }}
      />
    </div>
  );
}
