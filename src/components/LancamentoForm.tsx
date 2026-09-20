"use client";
// Lançamento manual: a porta de entrada para quem ainda não importa extratos.
// Usa o POST /api/lancamentos (já validado no servidor).
import { useEffect, useState } from "react";
import CategoriaSelect from "@/components/CategoriaSelect";

interface Props {
  aberto: boolean;
  onFechar: () => void;
  onSalvo: () => void;
}

const hojeISO = () => new Date().toISOString().slice(0, 10);

export default function LancamentoForm({ aberto, onFechar, onSalvo }: Props) {
  const [data, setData] = useState(hojeISO);
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [tipo, setTipo] = useState<"Entrada" | "Saída">("Saída");
  const [conta, setConta] = useState("");
  const [contas, setContas] = useState<string[]>([]);
  const [categoria, setCategoria] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  // Contas conhecidas = as dos perfis de importação do usuário; sempre dá para digitar outra.
  useEffect(() => {
    if (!aberto) return;
    let ativo = true;
    fetch("/api/perfis?todos=true")
      .then((r) => (r.ok ? r.json() : []))
      .then((perfis: { conta: string }[]) => {
        if (!ativo) return;
        const nomes = [...new Set(perfis.map((p) => p.conta))].sort((a, b) => a.localeCompare(b, "pt-BR"));
        setContas(nomes);
      })
      .catch(() => {});
    return () => { ativo = false; };
  }, [aberto]);

  if (!aberto) return null;

  const valorNumero = parseFloat(valor.replace(/\./g, "").replace(",", "."));
  const valido = descricao.trim() && conta.trim() && !isNaN(valorNumero) && valorNumero > 0 && data;

  const salvar = async () => {
    if (!valido) return;
    setSalvando(true);
    setErro("");
    const r = await fetch("/api/lancamentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data,
        descricao: descricao.trim(),
        valor: tipo === "Saída" ? -Math.abs(valorNumero) : Math.abs(valorNumero),
        tipo,
        conta: conta.trim(),
        categoria: categoria || null,
        fonte: "Manual",
      }),
    });
    setSalvando(false);
    if (!r.ok) {
      const json = await r.json().catch(() => ({}));
      setErro(json.error ?? "Não foi possível salvar.");
      return;
    }
    setDescricao("");
    setValor("");
    setCategoria("");
    onSalvo();
  };

  return (
    <div className="fixed inset-0 z-20 bg-slate-900/40 flex items-center justify-center p-4" onClick={onFechar}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">Novo lançamento</h2>
          <button onClick={onFechar} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <div className="flex gap-2">
          {(["Saída", "Entrada"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTipo(t)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                tipo === t
                  ? t === "Saída" ? "bg-red-50 border-red-300 text-red-700" : "bg-emerald-50 border-emerald-300 text-emerald-700"
                  : "bg-white border-slate-300 text-slate-500"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm text-slate-600 space-y-1">
            <span>Data</span>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-full" />
          </label>
          <label className="text-sm text-slate-600 space-y-1">
            <span>Valor (R$)</span>
            <input type="text" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" className="w-full text-right" autoFocus />
          </label>
        </div>

        <label className="text-sm text-slate-600 space-y-1 block">
          <span>Descrição</span>
          <input type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Mercado da esquina" className="w-full" />
        </label>

        <label className="text-sm text-slate-600 space-y-1 block">
          <span>Conta</span>
          <input
            type="text"
            list="contas-conhecidas"
            value={conta}
            onChange={(e) => setConta(e.target.value)}
            placeholder={contas[0] ?? "Ex.: Carteira, Nubank Conta"}
            className="w-full"
          />
          <datalist id="contas-conhecidas">
            {contas.map((c) => <option key={c} value={c} />)}
          </datalist>
        </label>

        <label className="text-sm text-slate-600 space-y-1 block">
          <span>Categoria <span className="text-slate-400">(opcional)</span></span>
          <CategoriaSelect value={categoria} onChange={setCategoria} className="w-full" />
        </label>

        {erro && <p className="text-sm text-red-600">{erro}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onFechar} className="btn btn-secondary">Cancelar</button>
          <button onClick={salvar} disabled={!valido || salvando} className="btn btn-primary">
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
