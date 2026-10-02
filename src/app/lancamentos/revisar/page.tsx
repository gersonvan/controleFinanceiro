"use client";
// Revisar categorias em grupo: lançamentos sem categoria (ou no "coringa"
// Transferência para Terceiros) agrupados pela descrição. Categorizar um grupo
// atualiza todos os lançamentos dele e, se marcado, ensina a Memória Local
// para as próximas importações.
import { useEffect, useState } from "react";
import Link from "next/link";
import CategoriaSelect from "@/components/CategoriaSelect";
import type { GrupoDescricao, ItemGrupo } from "@/app/api/lancamentos/agrupados/route";
import { CATEGORIAS_EMPRESTIMO, chaveMemoria } from "@/lib/categorias";
import { nomeContraparte } from "@/lib/reembolso-padroes";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (iso: string) => { const [a, m, d] = iso.split("-"); return `${d}/${m}/${a}`; };

const ABAS = [
  { id: "__sem__", rotulo: "Sem categoria" },
  { id: "Transferência para Terceiros", rotulo: "Transferência para Terceiros" },
] as const;

type AbaId = (typeof ABAS)[number]["id"];

export default function RevisarPage() {
  const [aba, setAba] = useState<AbaId>("__sem__");
  const [dados, setDados] = useState<{ aba: AbaId; totalLancamentos: number; grupos: GrupoDescricao[] } | null>(null);
  const [aviso, setAviso] = useState("");
  const carregando = dados?.aba !== aba;

  useEffect(() => {
    let ativo = true;
    fetch(`/api/lancamentos/agrupados?categoria=${encodeURIComponent(aba)}`)
      .then((r) => (r.ok ? r.json() : { totalLancamentos: 0, grupos: [] }))
      .then((json) => { if (ativo) setDados({ aba, ...json }); });
    return () => { ativo = false; };
  }, [aba]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(""), 3500);
    return () => clearTimeout(t);
  }, [aviso]);

  // aplicados = null → o grupo inteiro; senão, só esses (o grupo continua com o resto)
  const aplicado = (g: GrupoDescricao, categoria: string, lembrar: boolean, aplicados: ItemGrupo[] | null) => {
    const n = aplicados ? aplicados.length : g.quantidade;
    setDados((prev) => {
      if (!prev) return prev;
      const grupos = aplicados && n < g.quantidade
        ? prev.grupos.map((x) => x.chave !== g.chave ? x : {
            ...x,
            quantidade: x.quantidade - n,
            ids: x.ids.filter((id) => !aplicados.some((i) => i.id === id)),
            total: Math.round((x.total - aplicados.reduce((a, i) => a + i.valor, 0)) * 100) / 100,
          })
        : prev.grupos.filter((x) => x.chave !== g.chave);
      return { ...prev, totalLancamentos: prev.totalLancamentos - n, grupos };
    });
    setAviso(`✅ ${n} lançamento${n !== 1 ? "s" : ""} → ${categoria}${lembrar ? " · lembrado para as próximas importações" : ""}`);
  };

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Revisar categorias</h1>
          <p className="text-sm text-slate-500 mt-1">
            Lançamentos iguais agrupados: escolha a categoria para o grupo inteiro, ou abra o grupo (“Ver os N”) e aplique só a alguns.
          </p>
        </div>
        <Link href="/lancamentos" className="btn btn-secondary">← Lançamentos</Link>
      </div>

      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {ABAS.map((a) => (
          <button
            key={a.id}
            onClick={() => { setAba(a.id); setAviso(""); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
              aba === a.id ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {a.rotulo}
            {dados?.aba === a.id && <span className="ml-1.5 text-xs text-slate-400">({dados.totalLancamentos})</span>}
          </button>
        ))}
      </div>

      {aba === "Transferência para Terceiros" && (
        <p className="text-sm text-slate-500">
          Pix para pessoas e empresas caem aqui por padrão. Se um destinatário é sempre o mesmo tipo de gasto
          (diarista, aluguel, contador…), dê a categoria certa ao grupo.
        </p>
      )}

      {/* flutuante: quem rolou até o meio da lista vê a confirmação sem voltar ao topo */}
      {aviso && (
        <div role="status" className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg max-w-lg text-center">
          {aviso}
        </div>
      )}

      {carregando ? (
        <div className="flex justify-center py-16"><div className="spinner" /></div>
      ) : dados!.grupos.length === 0 ? (
        <div className="card text-center text-slate-500 py-12">🎉 Nada para revisar aqui.</div>
      ) : (
        <ul className="card p-0 divide-y divide-slate-100 overflow-hidden">
          {dados!.grupos.map((g) => (
            <Grupo key={g.chave} grupo={g} categoriaAtual={aba} onAplicado={aplicado} />
          ))}
        </ul>
      )}
    </div>
  );
}

// Pix/transferência para uma pessoa: cada envio pode ser uma coisa diferente,
// então por padrão não vira regra da Memória.
const ehPixParaPessoa = (d: string) => /(pix (enviado|recebido)|pix - (enviado|recebido)|transfer[êe]ncia)/i.test(d);

function Grupo({ grupo, categoriaAtual, onAplicado }: {
  grupo: GrupoDescricao;
  categoriaAtual: AbaId;
  onAplicado: (g: GrupoDescricao, categoria: string, lembrar: boolean, aplicados: ItemGrupo[] | null) => void;
}) {
  const [categoria, setCategoria] = useState("");
  const [lembrar, setLembrar] = useState(() => !ehPixParaPessoa(grupo.descricao));
  const [pessoa, setPessoa] = useState(() => nomeContraparte(grupo.descricao));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  // "Ver os N": itens do grupo e os marcados (null = grupo fechado)
  const [itens, setItens] = useState<ItemGrupo[] | null>(null);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [abrindo, setAbrindo] = useState(false);

  const aberto = itens !== null;
  const parcial = aberto && marcados.size < itens.length;
  const quantos = aberto ? marcados.size : grupo.quantidade;
  const emprestimo = (CATEGORIAS_EMPRESTIMO as readonly string[]).includes(categoria);

  const alternarAberto = async () => {
    if (aberto) { setItens(null); return; }
    setAbrindo(true);
    const q = new URLSearchParams({ categoria: categoriaAtual, chave: grupo.chave });
    const r = await fetch(`/api/lancamentos/agrupados?${q}`);
    const j = r.ok ? await r.json() : { itens: [] };
    setAbrindo(false);
    setItens(j.itens);
    setMarcados(new Set(j.itens.map((i: ItemGrupo) => i.id)));
  };

  const marcar = (id: number) => setMarcados((prev) => {
    const novo = new Set(prev);
    if (novo.has(id)) novo.delete(id); else novo.add(id);
    return novo;
  });

  const aplicar = async () => {
    if (!categoria || quantos === 0) return;
    setSalvando(true);
    setErro("");
    const filtroCategoria = categoriaAtual === "__sem__" ? { somenteSemCategoria: true } : { categoriaErrada: categoriaAtual };
    const r = await fetch("/api/lancamentos", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // o grupo junta variações da descrição: aplica pelos ids (até 1000 por vez na API)
        ids: parcial ? [...marcados] : grupo.ids.slice(0, 1000),
        categoriaCorreta: categoria,
        ...(emprestimo && pessoa.trim() ? { pessoa: pessoa.trim() } : {}),
        ...filtroCategoria,
      }),
    });
    // só vira regra da Memória quando vale para o grupo inteiro
    const ensinar = lembrar && !parcial;
    if (r.ok && ensinar) {
      // uma regra por chave distinta (variações com a mesma chave valem por uma só)
      const porChave = new Map(grupo.descricoes.map((d) => [chaveMemoria(d), d]));
      for (const descricao of porChave.values()) {
        await fetch("/api/memoria-ia", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ descricao, categoriaCorreta: categoria }),
        });
      }
    }
    setSalvando(false);
    if (!r.ok) { setErro("Não foi possível aplicar."); return; }
    if (parcial) {
      const aplicados = itens.filter((i) => marcados.has(i.id));
      setItens(itens.filter((i) => !marcados.has(i.id)));
      setMarcados(new Set());
      setCategoria("");
      onAplicado(grupo, categoria, false, aplicados);
    } else {
      onAplicado(grupo, categoria, ensinar, null);
    }
  };

  return (
    <li className="px-4 sm:px-6 py-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {grupo.apelido && <div className="text-xs font-medium text-blue-700">🔗 {grupo.apelido}</div>}
          <div className="text-sm font-medium text-slate-800 break-words">{grupo.descricao}</div>
          <div className="text-xs text-slate-400 mt-0.5">
            {grupo.quantidade}× · último em {fmtData(grupo.ultimaData)} · {grupo.contas.join(", ")}
            {grupo.descricoes.length > 1 && (
              <span title={grupo.descricoes.join("\n")} className="ml-1 underline decoration-dotted cursor-help">
                · {grupo.descricoes.length} variações da descrição
              </span>
            )}
            {grupo.quantidade > 1 && (
              <>
                {" · "}
                <button onClick={alternarAberto} className="text-blue-600 hover:underline" disabled={abrindo}>
                  {abrindo ? "abrindo…" : aberto ? "fechar" : `Ver os ${grupo.quantidade}`}
                </button>
              </>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-sm font-semibold whitespace-nowrap ${grupo.total >= 0 ? "valor-positivo" : "valor-negativo"}`}>
            {fmt(grupo.total)}
          </div>
          {grupo.quantidade > 1 && <div className="text-xs text-slate-400">total de {grupo.quantidade}</div>}
        </div>
      </div>

      {aberto && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60">
          <div className="flex items-center justify-between px-3 py-1.5 text-xs text-slate-500 border-b border-slate-200">
            <span>{marcados.size} de {itens.length} marcados</span>
            <span className="flex gap-3">
              <button onClick={() => setMarcados(new Set(itens.map((i) => i.id)))} className="text-blue-600 hover:underline">todos</button>
              <button onClick={() => setMarcados(new Set())} className="text-blue-600 hover:underline">nenhum</button>
            </span>
          </div>
          <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100">
            {itens.map((i) => (
              <li key={i.id}>
                <label className="flex items-center gap-3 px-3 py-1.5 text-sm cursor-pointer hover:bg-white">
                  <input type="checkbox" checked={marcados.has(i.id)} onChange={() => marcar(i.id)} />
                  <span className="text-slate-600 w-24">{fmtData(i.data)}</span>
                  <span className="text-xs text-slate-400 flex-1">{i.conta}</span>
                  <span className={`font-medium whitespace-nowrap ${i.valor >= 0 ? "valor-positivo" : "valor-negativo"}`}>{fmt(i.valor)}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <CategoriaSelect value={categoria} onChange={setCategoria} className="text-sm flex-1 min-w-48" />
        {emprestimo && (
          <input value={pessoa} onChange={(e) => setPessoa(e.target.value)} placeholder="Pessoa" className="text-sm w-48" title="Aparece em Empréstimos" />
        )}
        <label className={`flex items-center gap-1.5 text-xs ${parcial ? "text-slate-300" : "text-slate-500"}`}
          title={parcial ? "Só dá para lembrar quando a categoria vale para o grupo inteiro" : undefined}>
          <input type="checkbox" checked={lembrar && !parcial} disabled={parcial} onChange={(e) => setLembrar(e.target.checked)} />
          Lembrar nas próximas importações
        </label>
        <button onClick={aplicar} disabled={!categoria || salvando || quantos === 0} className="btn btn-primary text-sm">
          {salvando ? "Aplicando…" : `Aplicar a ${quantos}`}
        </button>
      </div>
      {!lembrar && !parcial && grupo.quantidade > 1 && ehPixParaPessoa(grupo.descricao) && (
        <div className="text-xs text-slate-400">Pix para a mesma pessoa pode ser coisa diferente a cada vez — por isso não vira regra automática.</div>
      )}
      {erro && <div className="text-xs text-red-600">{erro}</div>}
    </li>
  );
}
