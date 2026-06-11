"use client";
import { useEffect, useState } from "react";
import CategoriaSelect from "@/components/CategoriaSelect";

interface Regra {
  id: number;
  descricao: string;
  categoriaCorreta: string;
  updatedAt: string;
}

export default function MemoriaIAPage() {
  const [regras, setRegras] = useState<Regra[]>([]);
  const [loading, setLoading] = useState(true);
  const [nova, setNova] = useState({ descricao: "", categoriaCorreta: "" });
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState("");

  const carregar = async () => {
    const res = await fetch("/api/memoria-ia");
    setRegras(await res.json());
    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);

  const salvar = async () => {
    if (!nova.descricao || !nova.categoriaCorreta) return;
    setSalvando(true);
    await fetch("/api/memoria-ia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nova),
    });
    setNova({ descricao: "", categoriaCorreta: "" });
    setSalvando(false);
    carregar();
  };

  const excluir = async (id: number) => {
    if (!confirm("Remover esta regra?")) return;
    await fetch(`/api/memoria-ia?id=${id}`, { method: "DELETE" });
    carregar();
  };

  const filtradas = regras.filter(
    (r) =>
      !busca ||
      r.descricao.toLowerCase().includes(busca.toLowerCase()) ||
      r.categoriaCorreta.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Memória Local</h1>
      <p className="text-slate-500 text-sm">
        Regras de categorização automática. Quando uma descrição exata bater com uma regra aqui, a categoria será aplicada diretamente — sem precisar da IA externa.
      </p>

      {/* Adicionar nova regra */}
      <div className="card space-y-3">
        <h2 className="font-semibold text-slate-700">Adicionar Regra</h2>
        <div className="flex gap-2">
          <input
            className="flex-1"
            placeholder="Descrição exata da transação…"
            value={nova.descricao}
            onChange={(e) => setNova({ ...nova, descricao: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && salvar()}
          />
          <CategoriaSelect
            value={nova.categoriaCorreta}
            onChange={(v) => setNova({ ...nova, categoriaCorreta: v })}
          />
          <button
            className="btn btn-primary"
            onClick={salvar}
            disabled={!nova.descricao || !nova.categoriaCorreta || salvando}
          >
            {salvando ? <span className="spinner" /> : "+"} Salvar
          </button>
        </div>
      </div>

      {/* Lista de regras */}
      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <span className="font-semibold text-slate-700">{regras.length} regras cadastradas</span>
          <input
            placeholder="Filtrar…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-48"
          />
        </div>
        {loading ? (
          <div className="flex justify-center py-10"><div className="spinner" /></div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Descrição</th>
                <th>Categoria</th>
                <th>Atualizado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 ? (
                <tr><td colSpan={4} className="text-center text-slate-400 py-8">Nenhuma regra encontrada</td></tr>
              ) : (
                filtradas.map((r) => (
                  <tr key={r.id}>
                    <td className="font-mono text-xs text-slate-700">{r.descricao}</td>
                    <td>
                      <span className="badge bg-blue-50 text-blue-700">{r.categoriaCorreta}</span>
                    </td>
                    <td className="text-slate-400 text-xs">
                      {new Date(r.updatedAt).toLocaleDateString("pt-BR")}
                    </td>
                    <td>
                      <button onClick={() => excluir(r.id)} className="text-slate-300 hover:text-red-500 text-lg leading-none">×</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
