"use client";
import { useEffect, useState } from "react";

interface Perfil {
  id: number;
  nome: string;
  conta: string;
  formato: string;
  builtin: string | null;
  ativo: boolean;
}

export default function ConfiguracoesPage() {
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState<number | null>(null);

  const carregar = async () => {
    setCarregando(true);
    const r = await fetch("/api/perfis?todos=true");
    setPerfis(await r.json());
    setCarregando(false);
  };
  useEffect(() => { carregar(); }, []);

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
    </div>
  );
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
