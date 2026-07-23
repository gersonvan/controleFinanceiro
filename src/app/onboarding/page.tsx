"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";

type Perfil = {
  id: number;
  nome: string;
  formato: string;
  builtin: string | null;
  ativo: boolean;
};

const PASSOS = ["Boas-vindas", "Seus bancos", "Pronto!"];

export default function OnboardingPage() {
  const { data: session, update } = useSession();
  const router = useRouter();

  const [passo, setPasso] = useState(1);
  const [nome, setNome] = useState("");
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Redirect if already completed
  useEffect(() => {
    if (session?.onboardingCompleto === true) {
      router.replace("/");
    }
  }, [session, router]);

  // Pre-fill with Google first name
  useEffect(() => {
    const nomeGoogle = session?.user?.name;
    if (nomeGoogle && !nome) {
      queueMicrotask(() => setNome(nomeGoogle.split(" ")[0]));
    }
  }, [session, nome]);

  // Load bank profiles when reaching step 2 (also triggers seeding)
  useEffect(() => {
    if (passo === 2 && perfis.length === 0) {
      let ativo = true;
      async function carregarPerfis() {
        const r = await fetch("/api/perfis?todos=true");
        const data: Perfil[] = await r.json();
        if (ativo) {
          setPerfis(data.filter((p) => p.builtin !== null));
          setCarregando(false);
        }
      }
      void carregarPerfis();
      return () => { ativo = false; };
    }
  }, [passo, perfis.length]);

  const irParaBancos = () => {
    if (perfis.length === 0) setCarregando(true);
    setPasso(2);
  };

  const togglePerfil = async (id: number, ativo: boolean) => {
    setPerfis((prev) => prev.map((p) => (p.id === id ? { ...p, ativo } : p)));
    await fetch("/api/perfis", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ativo }),
    });
  };

  const concluir = async (destino: string) => {
    setSalvando(true);
    await fetch("/api/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome }),
    });
    await update({ onboardingCompleto: true });
    router.push(destino);
  };

  const ofxPerfis = perfis.filter((p) => p.formato === "ofx");
  const pdfPerfis = perfis.filter((p) => p.formato === "pdf");

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <div className="flex justify-between items-center px-8 py-4 bg-white border-b border-slate-200">
        <span className="font-semibold text-slate-700">Controle Financeiro</span>
        {session?.user && (
          <div className="flex items-center gap-2">
            {session.user.image && (
              <Image
                src={session.user.image}
                alt=""
                width={28}
                height={28}
                className="rounded-full"
              />
            )}
            <span className="text-sm text-slate-600">{session.user.name}</span>
          </div>
        )}
      </div>

      {/* Progress */}
      <div className="flex justify-center pt-8 pb-2">
        <div className="flex items-center gap-3">
          {PASSOS.map((label, i) => {
            const n = i + 1;
            const done = n < passo;
            const active = n === passo;
            return (
              <div key={n} className="flex items-center gap-3">
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                      done
                        ? "bg-emerald-500 text-white"
                        : active
                        ? "bg-blue-600 text-white"
                        : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {done ? "✓" : n}
                  </div>
                  <span
                    className={`text-xs ${active ? "text-blue-600 font-medium" : "text-slate-400"}`}
                  >
                    {label}
                  </span>
                </div>
                {i < PASSOS.length - 1 && (
                  <div
                    className={`w-16 h-0.5 mb-4 ${done ? "bg-emerald-400" : "bg-slate-200"}`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center px-4 pt-8">
        <div className="w-full max-w-lg">

          {/* Passo 1: Boas-vindas */}
          {passo === 1 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
              <div className="text-4xl mb-4">👋</div>
              <h1 className="text-2xl font-bold text-slate-800 mb-1">
                Bem-vindo ao Controle Financeiro!
              </h1>
              <p className="text-slate-500 mb-6">
                Vamos configurar sua conta em alguns passos rápidos.
              </p>

              <label className="block text-sm font-medium text-slate-700 mb-1">
                Como você quer ser chamado?
              </label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Seu nome"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-6"
              />

              <div className="flex justify-end">
                <button
                  onClick={irParaBancos}
                  disabled={!nome.trim()}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Próximo →
                </button>
              </div>
            </div>
          )}

          {/* Passo 2: Seus bancos */}
          {passo === 2 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
              <div className="text-4xl mb-4">🏦</div>
              <h1 className="text-2xl font-bold text-slate-800 mb-1">
                Quais bancos você usa?
              </h1>
              <p className="text-slate-500 mb-6">
                Ative os bancos para importar extratos e faturas. Você pode alterar depois em{" "}
                <span className="font-medium">Configurações</span>.
              </p>

              {carregando ? (
                <div className="text-center py-8 text-slate-400 text-sm">Carregando bancos...</div>
              ) : (
                <div className="space-y-6">
                  {ofxPerfis.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                        Conta corrente (OFX)
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {ofxPerfis.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => togglePerfil(p.id, !p.ativo)}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                              p.ativo
                                ? "bg-blue-50 border-blue-300 text-blue-700"
                                : "bg-white border-slate-300 text-slate-500"
                            }`}
                          >
                            {p.ativo ? "✓ " : ""}{p.nome.replace(" (OFX)", "").replace(" OFX", "")}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {pdfPerfis.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                        Cartão de crédito (PDF)
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {pdfPerfis.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => togglePerfil(p.id, !p.ativo)}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                              p.ativo
                                ? "bg-purple-50 border-purple-300 text-purple-700"
                                : "bg-white border-slate-300 text-slate-500"
                            }`}
                          >
                            {p.ativo ? "✓ " : ""}{p.nome.replace(" (PDF)", "").replace(" PDF", "").replace("Fatura", "").trim()}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-between mt-8">
                <button
                  onClick={() => setPasso(1)}
                  className="text-slate-500 px-4 py-2 rounded-lg text-sm hover:bg-slate-100 transition-colors"
                >
                  ← Voltar
                </button>
                <button
                  onClick={() => setPasso(3)}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  Próximo →
                </button>
              </div>
            </div>
          )}

          {/* Passo 3: Pronto! */}
          {passo === 3 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
              <div className="text-4xl mb-4">✅</div>
              <h1 className="text-2xl font-bold text-slate-800 mb-1">
                Tudo configurado, {nome}!
              </h1>
              <p className="text-slate-500 mb-6">
                Você já pode importar seus extratos. Baixe um arquivo OFX ou PDF do
                seu banco e arraste na área de importação — o sistema detecta o banco
                automaticamente.
              </p>

              <div className="bg-slate-50 rounded-xl p-4 mb-6 text-sm text-slate-600 space-y-2">
                <p className="font-medium text-slate-700">Dicas rápidas:</p>
                <p>• <span className="font-medium">OFX</span> — extratos de conta corrente. Baixe no internet banking.</p>
                <p>• <span className="font-medium">PDF</span> — faturas de cartão de crédito.</p>
                <p>• <span className="font-medium">CSV</span> — planilhas exportadas de qualquer banco.</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-between">
                <button
                  onClick={irParaBancos}
                  className="text-slate-500 px-4 py-2 rounded-lg text-sm hover:bg-slate-100 transition-colors"
                >
                  ← Voltar
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={() => concluir("/")}
                    disabled={salvando}
                    className="border border-slate-300 text-slate-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-40 transition-colors"
                  >
                    Ir ao Dashboard
                  </button>
                  <button
                    onClick={() => concluir("/importar")}
                    disabled={salvando}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
                  >
                    {salvando ? "Salvando..." : "Importar agora →"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
