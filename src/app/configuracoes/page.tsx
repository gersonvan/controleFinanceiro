"use client";
import { useEffect, useState } from "react";

interface Perfil {
  id: number;
  nome: string;
  conta: string;
  formato: string;
  builtin: string | null;
  ativo: boolean;
  delimitador: string;
  linhasPular: number;
  formatoData: string;
  modoValor: string;
  colData: number | null;
  colDescricao: number | null;
  colParcela: number | null;
  colValor: number | null;
  colEntrada: number | null;
  colSaida: number | null;
  inverterSinal: boolean;
  usaMesReferencia: boolean;
}

export default function ConfiguracoesPage() {
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState<number | null>(null);
  const [editando, setEditando] = useState<Perfil | null>(null);
  const [erroEdicao, setErroEdicao] = useState("");

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      const r = await fetch("/api/perfis?todos=true");
      const data = await r.json();
      if (ativo) {
        setPerfis(data);
        setCarregando(false);
      }
    }
    void carregar();
    return () => { ativo = false; };
  }, []);

  const toggleAtivo = async (p: Perfil) => {
    setSalvando(p.id);
    await fetch("/api/perfis", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, ativo: !p.ativo }),
    });
    setPerfis((prev) => prev.map((x) => x.id === p.id ? { ...x, ativo: !x.ativo } : x));
    setSalvando(null);
  };

  const excluir = async (p: Perfil) => {
    if (!confirm(`Excluir perfil "${p.nome}"?`)) return;
    await fetch(`/api/perfis?id=${p.id}`, { method: "DELETE" });
    setPerfis((prev) => prev.filter((x) => x.id !== p.id));
  };

  const salvarEdicao = async () => {
    if (!editando) return;
    setSalvando(editando.id);
    setErroEdicao("");
    const r = await fetch("/api/perfis", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editando),
    });
    if (!r.ok) {
      const data = await r.json();
      setErroEdicao(data.error ?? "Não foi possível salvar o perfil.");
      setSalvando(null);
      return;
    }
    const perfilAtualizado = await r.json();
    setPerfis((prev) => prev.map((p) => p.id === perfilAtualizado.id ? perfilAtualizado : p));
    setEditando(null);
    setSalvando(null);
  };

  const atualizarEdicao = <K extends keyof Perfil>(campo: K, valor: Perfil[K]) => {
    setEditando((prev) => prev ? { ...prev, [campo]: valor } : null);
  };

  const nativos = perfis.filter((p) => p.builtin);
  const personalizados = perfis.filter((p) => !p.builtin);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Configurações</h1>
        <p className="text-sm text-slate-500 mt-1">
          Ative os bancos que você usa. Só os ativos aparecem na tela de importação.
        </p>
      </div>

      {carregando ? (
        <div className="text-slate-400 text-sm">Carregando…</div>
      ) : (
        <>
          {/* Perfis OFX nativos */}
          <div className="card">
            <h2 className="font-semibold text-slate-700 mb-1">Bancos com suporte nativo (OFX)</h2>
            <p className="text-xs text-slate-400 mb-4">
              Baixe o arquivo OFX direto do seu internet banking e importe sem configuração.
            </p>
            <div className="space-y-2">
              {nativos.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <div className="flex items-center gap-3">
                    <Toggle
                      ativo={p.ativo}
                      disabled={salvando === p.id}
                      onChange={() => toggleAtivo(p)}
                    />
                    <div>
                      <div className={`text-sm font-medium ${p.ativo ? "text-slate-800" : "text-slate-400"}`}>
                        {p.nome}
                      </div>
                      <div className="text-xs text-slate-400">{p.conta}</div>
                    </div>
                  </div>
                  <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">OFX</span>
                </div>
              ))}
            </div>
          </div>

          {/* Perfis personalizados */}
          {personalizados.length > 0 && (
            <div className="card">
              <h2 className="font-semibold text-slate-700 mb-4">Perfis personalizados</h2>
              <div className="space-y-2">
                {personalizados.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                    <div className="flex items-center gap-3">
                      <Toggle
                        ativo={p.ativo}
                        disabled={salvando === p.id}
                        onChange={() => toggleAtivo(p)}
                      />
                      <div>
                        <div className={`text-sm font-medium ${p.ativo ? "text-slate-800" : "text-slate-400"}`}>
                          {p.nome}
                        </div>
                        <div className="text-xs text-slate-400">{p.conta} · {p.formato.toUpperCase()}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => { setErroEdicao(""); setEditando(p); }}
                      className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => excluir(p)}
                      className="text-xs text-red-400 hover:text-red-600 transition-colors"
                    >
                      Excluir
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {personalizados.length === 0 && (
            <div className="text-sm text-slate-400">
              Você ainda não tem perfis personalizados.{" "}
              <a href="/importar" className="text-blue-600 hover:underline">
                Crie um na tela de importação.
              </a>
            </div>
          )}
        </>
      )}

      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white p-5 shadow-xl space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Editar perfil personalizado</h2>
              <p className="text-sm text-slate-500 mt-1">Ajuste como o arquivo será lido nas próximas importações.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Campo texto="Nome do perfil" value={editando.nome} onChange={(v) => atualizarEdicao("nome", v)} />
              <Campo texto="Conta" value={editando.conta} onChange={(v) => atualizarEdicao("conta", v)} />
              <label className="text-sm text-slate-700">Delimitador
                <select value={editando.delimitador} onChange={(e) => atualizarEdicao("delimitador", e.target.value)} className="mt-1 w-full">
                  <option value=",">Vírgula (,)</option><option value=";">Ponto e vírgula (;)</option><option value={"\t"}>Tabulação</option>
                </select>
              </label>
              <label className="text-sm text-slate-700">Formato da data
                <select value={editando.formatoData} onChange={(e) => atualizarEdicao("formatoData", e.target.value)} className="mt-1 w-full">
                  <option>DD/MM/AAAA</option><option>AAAA-MM-DD</option><option>DD-MM-AAAA</option><option>MM/DD/AAAA</option>
                </select>
              </label>
              <Numero texto="Linhas de cabeçalho" value={editando.linhasPular} onChange={(v) => atualizarEdicao("linhasPular", v ?? 0)} />
              <label className="text-sm text-slate-700">Valores
                <select value={editando.modoValor} onChange={(e) => atualizarEdicao("modoValor", e.target.value)} className="mt-1 w-full">
                  <option value="unica">Uma coluna</option><option value="separadas">Entrada e saída separadas</option>
                </select>
              </label>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <h3 className="text-sm font-medium text-slate-700 mb-3">Posição das colunas <span className="font-normal text-slate-400">(a primeira é 0)</span></h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Numero texto="Data" value={editando.colData} onChange={(v) => atualizarEdicao("colData", v)} />
                <Numero texto="Descrição" value={editando.colDescricao} onChange={(v) => atualizarEdicao("colDescricao", v)} />
                <Numero texto="Parcela" value={editando.colParcela} onChange={(v) => atualizarEdicao("colParcela", v)} />
                {editando.modoValor === "unica" ? (
                  <Numero texto="Valor" value={editando.colValor} onChange={(v) => atualizarEdicao("colValor", v)} />
                ) : <>
                  <Numero texto="Entrada" value={editando.colEntrada} onChange={(v) => atualizarEdicao("colEntrada", v)} />
                  <Numero texto="Saída" value={editando.colSaida} onChange={(v) => atualizarEdicao("colSaida", v)} />
                </>}
              </div>
            </div>

            <div className="space-y-2 text-sm text-slate-700">
              <label className="flex items-center gap-2"><input type="checkbox" checked={editando.inverterSinal} onChange={(e) => atualizarEdicao("inverterSinal", e.target.checked)} /> Inverter sinal (fatura: positivo = gasto)</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={editando.usaMesReferencia} onChange={(e) => atualizarEdicao("usaMesReferencia", e.target.checked)} /> Pedir mês de referência (fatura)</label>
            </div>

            {erroEdicao && <div className="text-sm text-red-600">{erroEdicao}</div>}
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn btn-secondary" onClick={() => setEditando(null)} disabled={salvando === editando.id}>Cancelar</button>
              <button className="btn btn-primary" onClick={salvarEdicao} disabled={salvando === editando.id}>{salvando === editando.id ? "Salvando…" : "Salvar alterações"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Campo({ texto, value, onChange }: { texto: string; value: string; onChange: (valor: string) => void }) {
  return <label className="text-sm text-slate-700">{texto}<input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full" /></label>;
}

function Numero({ texto, value, onChange }: { texto: string; value: number | null; onChange: (valor: number | null) => void }) {
  return <label className="text-sm text-slate-700">{texto}<input type="number" min={0} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} className="mt-1 w-full" /></label>;
}

function Toggle({ ativo, disabled, onChange }: { ativo: boolean; disabled: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 focus:outline-none ${
        ativo ? "bg-blue-500" : "bg-slate-300"
      } ${disabled ? "opacity-50 cursor-wait" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform duration-200 ${
          ativo ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
