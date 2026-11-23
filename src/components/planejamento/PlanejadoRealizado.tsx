"use client";
// Aba Planejado × Realizado: a fotografia do mês contra os lançamentos.
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Comparacao, LinhaComparacao } from "@/app/api/planejamento/realizado/route";
import { ROTULO_GRUPO } from "@/lib/planejamento";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// Os lançamentos que formam o "Realizado" de uma categoria no mês: as saídas dela no período.
function linkLancamentos(categoria: string, ano: number, mes: number) {
  const dois = (n: number) => String(n).padStart(2, "0");
  const fim = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const p = new URLSearchParams({
    categoria: categoria === "Sem categoria" ? "__sem__" : categoria,
    tipo: "Saída",
    dataInicio: `${ano}-${dois(mes)}-01`,
    dataFim: `${ano}-${dois(mes)}-${dois(fim)}`,
  });
  return `/lancamentos?${p}`;
}

export default function PlanejadoRealizado({ onIrParaFotografia }: { onIrParaFotografia: () => void }) {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  // Guarda o período junto com os dados: "carregando" é só a chave não bater.
  const chave = `${ano}-${mes}`;
  const [carregado, setCarregado] = useState<{ chave: string; dados: Comparacao | null } | null>(null);
  const dados = carregado?.chave === chave ? carregado.dados : null;
  const loading = carregado?.chave !== chave;

  useEffect(() => {
    let ativo = true;
    fetch(`/api/planejamento/realizado?ano=${ano}&mes=${mes}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => { if (ativo) setCarregado({ chave: `${ano}-${mes}`, dados: json }); });
    return () => { ativo = false; };
  }, [ano, mes]);

  const anos = Array.from({ length: 3 }, (_, i) => hoje.getFullYear() - 1 + i);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-slate-500">Quanto você planejou gastar e quanto os lançamentos mostram. Clique numa categoria para ver de onde vem o valor.</p>
        <div className="flex gap-2">
          <select value={mes} onChange={(e) => setMes(parseInt(e.target.value))}>
            {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select value={ano} onChange={(e) => setAno(parseInt(e.target.value))}>
            {anos.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {loading || !dados ? (
        <div className="flex justify-center py-16"><div className="spinner" /></div>
      ) : !dados.temFotografia ? (
        <div className="card text-center py-10 space-y-3">
          <div className="text-3xl">📸</div>
          <p className="text-slate-600">Você ainda não fez sua fotografia do mês — sem ela não há o que comparar.</p>
          <button onClick={onIrParaFotografia} className="btn btn-primary">Fazer a fotografia</button>
        </div>
      ) : (
        <>
          {dados.totalLancamentos === 0 && (
            <div className="card bg-amber-50 border-amber-200 text-sm text-slate-700 flex items-center justify-between gap-3 flex-wrap">
              <span>Nenhum lançamento em {MESES[mes - 1]}/{ano}. A coluna &quot;Realizado&quot; enche quando você importar um extrato ou lançar à mão.</span>
              <div className="flex gap-2">
                <Link href="/importar" className="btn btn-secondary">Importar</Link>
                <Link href="/lancamentos" className="btn btn-secondary">Lançar à mão</Link>
              </div>
            </div>
          )}

          <Cartoes dados={dados} />

          <div className="card p-0 overflow-hidden">
            <table>
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Categoria</th>
                  <th className="text-right px-4 py-2">Planejado</th>
                  <th className="text-right px-4 py-2">Realizado</th>
                  <th className="text-right px-4 py-2">Diferença</th>
                  <th className="px-4 py-2 w-40"></th>
                </tr>
              </thead>
              <tbody>
                {dados.linhas.map((l) => <LinhaTabela key={l.categoria} linha={l} href={linkLancamentos(l.categoria, ano, mes)} />)}
                {dados.linhas.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-slate-400 py-8">Nenhuma saída planejada.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {dados.naoPlanejado.length > 0 && (
            <div className="card p-0 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <h3 className="font-semibold text-slate-700">Gastos que não estavam na fotografia</h3>
                <p className="text-xs text-slate-500 mt-0.5">Vale decidir: entram no plano ou são exceção deste mês? Clique numa categoria para ver os lançamentos.</p>
              </div>
              <table>
                <tbody>
                  {dados.naoPlanejado.map((l) => (
                    <tr key={l.categoria} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-2">
                        <Link href={linkLancamentos(l.categoria, ano, mes)} className="text-slate-700 hover:text-blue-600 hover:underline" data-ver-lancamentos>
                          {l.categoria}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-right valor-negativo">{fmt(l.realizado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Cartoes({ dados }: { dados: Comparacao }) {
  const sobraPlanejada = dados.entradas.planejado - dados.saidas.planejado - dados.margem;
  const sobraReal = dados.entradas.realizado - dados.saidas.realizado;
  const diferencaSaidas = dados.saidas.planejado - dados.saidas.realizado;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="card">
        <div className="text-sm text-slate-500">Entradas</div>
        <div className="text-xl font-bold valor-positivo">{fmt(dados.entradas.realizado)}</div>
        <div className="text-xs text-slate-400">planejado {fmt(dados.entradas.planejado)}</div>
      </div>
      <div className="card">
        <div className="text-sm text-slate-500">Saídas</div>
        <div className="text-xl font-bold valor-negativo">{fmt(dados.saidas.realizado)}</div>
        <div className="text-xs text-slate-400">
          planejado {fmt(dados.saidas.planejado)} ·{" "}
          <span className={diferencaSaidas >= 0 ? "text-emerald-600" : "text-red-600"}>
            {diferencaSaidas >= 0 ? `${fmt(diferencaSaidas)} abaixo` : `${fmt(-diferencaSaidas)} acima`}
          </span>
        </div>
      </div>
      <div className="card">
        <div className="text-sm text-slate-500">Sobra do mês</div>
        <div className={`text-xl font-bold ${sobraReal >= 0 ? "valor-positivo" : "valor-negativo"}`}>{fmt(sobraReal)}</div>
        <div className="text-xs text-slate-400">planejado {fmt(sobraPlanejada)} (já descontando a margem)</div>
      </div>
    </div>
  );
}

function LinhaTabela({ linha, href }: { linha: LinhaComparacao; href: string }) {
  const diferenca = linha.planejado - linha.realizado;
  const pct = linha.planejado > 0 ? Math.min(100, (linha.realizado / linha.planejado) * 100) : 0;
  const estourou = linha.realizado > linha.planejado;

  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="px-4 py-2">
        <Link href={href} className="text-slate-700 hover:text-blue-600 hover:underline" title="Ver os lançamentos desta categoria no mês" data-ver-lancamentos>
          {linha.categoria}
        </Link>
        <div className="text-xs text-slate-400">{linha.grupos.map((g) => ROTULO_GRUPO[g]).join(" · ")}</div>
      </td>
      <td className="px-4 py-2 text-right text-slate-600">{fmt(linha.planejado)}</td>
      <td className="px-4 py-2 text-right font-medium text-slate-800">{fmt(linha.realizado)}</td>
      <td className={`px-4 py-2 text-right ${diferenca >= 0 ? "text-emerald-600" : "text-red-600"}`}>
        {diferenca >= 0 ? "+" : "−"}{fmt(Math.abs(diferenca))}
      </td>
      <td className="px-4 py-2">
        <div className="h-1.5 bg-slate-100 rounded-full">
          <div
            className={`h-1.5 rounded-full ${estourou ? "bg-red-500" : "bg-blue-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </td>
    </tr>
  );
}
