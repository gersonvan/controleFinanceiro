"use client";
// Configurações → Categorias: ocultar nativas, criar e editar as próprias
// (api/categorias, lib/catalogo-categorias.ts). As do sistema ficam sempre na
// lista. Ocultar ou excluir pede o destino do que já está na categoria.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import type { RespostaCategorias } from "@/app/api/categorias/route";
import {
  destinosPossiveis, GRUPO_OUTRAS, GRUPOS_PERSONALIZAVEIS, montarCatalogo, podeOcultar, type Catalogo,
} from "@/lib/catalogo-categorias";
import { GRUPOS_CATEGORIAS } from "@/lib/categorias";
import { useEspaco } from "@/components/Espaco";
import { FATIAS, fatiaDaCategoria, fatiaDoGrupo, INFO_FATIA, type Fatia } from "@/lib/fatias";

const plural = (n: number, s: string, p = `${s}s`) => `${n} ${n === 1 ? s : p}`;

type Acao = { tipo: "ocultar" | "excluir"; nome: string } | { tipo: "renomear"; nome: string };

export default function CategoriasPage() {
  const router = useRouter();
  const somenteVer = useEspaco().papel === "ver";
  const [dados, setDados] = useState<RespostaCategorias | null>(null);
  const [novoNome, setNovoNome] = useState("");
  const [novoGrupo, setNovoGrupo] = useState("Pessoal e Lazer");
  const [novaFatia, setNovaFatia] = useState<Fatia | null>(fatiaDoGrupo("Pessoal e Lazer"));
  const [acao, setAcao] = useState<Acao | null>(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    const r = await fetch("/api/categorias");
    if (r.ok) setDados(await r.json());
  }, []);
  useEffect(() => {
    let ativo = true;
    fetch("/api/categorias").then((r) => (r.ok ? r.json() : null)).then((j) => { if (ativo && j) setDados(j); });
    return () => { ativo = false; };
  }, []);

  const catalogo = useMemo(() => montarCatalogo(dados?.linhas ?? []), [dados]);
  const qtd = (nome: string) => dados?.lancamentos[nome] ?? 0;

  /** Manda a mudança, recarrega a lista e os seletores do app (layout). */
  const enviar = async (metodo: "POST" | "PATCH", corpo: object, sucesso: (j: Record<string, unknown>) => string) => {
    setErro(""); setAviso(""); setEnviando(true);
    try {
      const r = await fetch("/api/categorias", { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error ?? "Não foi possível salvar."); return false; }
      setAviso(sucesso(j));
      setAcao(null);
      await carregar();
      router.refresh();
      return true;
    } finally { setEnviando(false); }
  };

  const criar = async () => {
    if (await enviar("POST", { nome: novoNome, grupo: novoGrupo, fatia: novaFatia }, (j) => `Categoria “${j.nome}” criada em ${novoGrupo}.`)) setNovoNome("");
  };

  if (!dados) return <div className="flex justify-center py-20"><div className="spinner" /></div>;

  // todos os grupos, na ordem dos seletores; as ocultas saem daqui e vão para o fim
  const grupos = [...GRUPOS_CATEGORIAS.map((g) => g.grupo), GRUPO_OUTRAS]
    .map((grupo) => ({ grupo, categorias: catalogo.grupos.find((g) => g.grupo === grupo)?.categorias ?? [] }))
    .filter((g) => g.categorias.length > 0);
  const personalizada = (nome: string) => catalogo.personalizadas.some((p) => p.nome === nome);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Categorias</h1>
        <p className="text-sm text-slate-500 mt-1">
          Escolha quais categorias aparecem para você e crie as suas. As marcadas com <Lock size={12} className="inline -mt-0.5" aria-label="cadeado" /> o
          app usa nos cálculos (o que fica fora dos totais, estornos, reembolsos, empréstimos, investimentos) e ficam sempre na lista.
        </p>
      </div>

      {erro && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">{erro}</div>}
      {aviso && <div className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2" role="status">{aviso}</div>}

      {!somenteVer && (
        <section className="card space-y-3">
          <h2 className="font-semibold text-slate-700">Nova categoria</h2>
          <div className="flex gap-2 flex-wrap">
            <input aria-label="Nome da categoria" placeholder="Ex.: Cachorro, Igreja, Escola das crianças" value={novoNome} maxLength={40}
              onChange={(e) => setNovoNome(e.target.value)} className="flex-1 min-w-48" />
            <select aria-label="Grupo" value={novoGrupo} onChange={(e) => { setNovoGrupo(e.target.value); setNovaFatia(fatiaDoGrupo(e.target.value)); }}>
              {GRUPOS_PERSONALIZAVEIS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            {novaFatia && (
              <select aria-label="Fatia no 50/30/20" value={novaFatia} onChange={(e) => setNovaFatia(e.target.value as Fatia)}>
                {FATIAS.map((f) => <option key={f} value={f}>{INFO_FATIA[f].nome}</option>)}
              </select>
            )}
            <button className="btn btn-primary" disabled={enviando || novoNome.trim().length < 2} onClick={() => void criar()}>Criar</button>
          </div>
          <p className="text-xs text-slate-400">
            No grupo Entradas ela é de entrada (renda); nos outros, de gasto — e você escolhe se, no 50/30/20 do dashboard, ela é
            necessidade, desejo ou futuro. As regras automáticas não a conhecem: categorize o primeiro lançamento e a Memória aprende.
          </p>
        </section>
      )}

      {grupos.map(({ grupo, categorias }) => (
        <section key={grupo} className="card p-0 overflow-hidden">
          <h2 className="px-4 sm:px-6 py-3 border-b border-slate-100 font-semibold text-slate-700">{grupo}</h2>
          <ul className="divide-y divide-slate-100">
            {categorias.map((nome) => (
              <li key={nome} className="px-4 sm:px-6 py-2.5 space-y-2" data-categoria={nome}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0 text-sm text-slate-800">
                    {nome}
                    {personalizada(nome) && <span className="ml-2 badge bg-blue-50 text-blue-700">sua</span>}
                    <span className="ml-2 text-xs text-slate-400">{plural(qtd(nome), "lançamento")}</span>
                    {!personalizada(nome) && fatiaDaCategoria(catalogo, nome) && (
                      <span className="ml-2 text-xs text-slate-400">· {INFO_FATIA[fatiaDaCategoria(catalogo, nome)!].nome.toLowerCase()}</span>
                    )}
                    {personalizada(nome) && !catalogo.entradas.has(nome) && !somenteVer && (
                      // a fatia do 50/30/20 de uma categoria própria de gasto
                      <select aria-label={`Fatia de ${nome}`} value={fatiaDaCategoria(catalogo, nome) ?? "desejos"} disabled={enviando}
                        className="ml-2 text-xs py-0.5"
                        onChange={(e) => {
                          // o select é controlado: o valor escolhido é guardado antes de o React voltar ao atual
                          const fatia = e.target.value as Fatia;
                          void enviar("PATCH", { acao: "fatia", nome, fatia },
                            () => `“${nome}” agora conta como ${INFO_FATIA[fatia].nome.toLowerCase()} no 50/30/20.`);
                        }}>
                        {FATIAS.map((f) => <option key={f} value={f}>{INFO_FATIA[f].nome}</option>)}
                      </select>
                    )}
                  </div>
                  {!somenteVer && (
                    <div className="flex items-center gap-3 text-xs ml-auto">
                      {personalizada(nome) ? (
                        <>
                          <button className="text-blue-700 hover:text-blue-900" onClick={() => { setErro(""); setAcao({ tipo: "renomear", nome }); }}>Renomear</button>
                          <button className="text-red-600 hover:text-red-800" onClick={() => { setErro(""); setAcao({ tipo: "excluir", nome }); }}>Excluir</button>
                        </>
                      ) : podeOcultar(nome) ? (
                        <button className="text-slate-500 hover:text-slate-800" onClick={() => { setErro(""); setAcao({ tipo: "ocultar", nome }); }}>Ocultar</button>
                      ) : (
                        <span className="text-slate-400 inline-flex items-center gap-1" title="Usada nos cálculos do app"><Lock size={12} /> do sistema</span>
                      )}
                    </div>
                  )}
                </div>
                {acao?.nome === nome && (acao.tipo === "renomear"
                  ? <Renomear nome={nome} enviando={enviando} onCancelar={() => setAcao(null)}
                      onSalvar={(novo) => enviar("PATCH", { acao: "renomear", nome, novoNome: novo }, (j) => `“${nome}” agora é “${j.nome}”.`)} />
                  : <EscolherDestino catalogo={catalogo} nome={nome} tipo={acao.tipo} lancamentos={qtd(nome)} enviando={enviando}
                      onCancelar={() => setAcao(null)}
                      onConfirmar={(destino) => enviar("PATCH", { acao: acao.tipo, nome, destino }, (j) => {
                        const n = (j.migracao as { lancamentos: number } | undefined)?.lancamentos ?? 0;
                        const feito = acao.tipo === "ocultar" ? `“${nome}” oculta` : `“${nome}” excluída`;
                        if (n === 0) return `${feito}.`;
                        const verbo = destino ? (n === 1 ? "foi" : "foram") : (n === 1 ? "ficou" : "ficaram");
                        return `${feito}: ${plural(n, "lançamento")} ${verbo} ${destino ? `para “${destino}”` : "sem categoria"}.`;
                      })} />
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {catalogo.ocultas.size > 0 && (
        <section className="card p-0 overflow-hidden">
          <h2 className="px-4 sm:px-6 py-3 border-b border-slate-100 font-semibold text-slate-700">Ocultas</h2>
          <ul className="divide-y divide-slate-100">
            {[...catalogo.ocultas].map(([nome, destino]) => (
              <li key={nome} className="px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 flex-wrap" data-oculta={nome}>
                <div className="text-sm text-slate-500">
                  {nome} <span className="text-xs text-slate-400">· o que cair nela vai para {destino ? `“${destino}”` : "sem categoria"}</span>
                </div>
                {!somenteVer && (
                  <button className="text-xs text-blue-700 hover:text-blue-900" disabled={enviando}
                    onClick={() => void enviar("PATCH", { acao: "mostrar", nome }, () => `“${nome}” voltou para a lista. Os lançamentos que foram movidos continuam onde estão.`)}>
                    Mostrar de novo
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Renomear({ nome, enviando, onSalvar, onCancelar }: {
  nome: string; enviando: boolean; onSalvar: (novo: string) => void; onCancelar: () => void;
}) {
  const [novo, setNovo] = useState(nome);
  return (
    <div className="flex gap-2 flex-wrap" data-renomear>
      <input aria-label="Novo nome" value={novo} maxLength={40} onChange={(e) => setNovo(e.target.value)} className="flex-1 min-w-40 text-sm" autoFocus />
      <button className="btn btn-secondary text-xs py-1" onClick={onCancelar}>Cancelar</button>
      <button className="btn btn-primary text-xs py-1" disabled={enviando || novo.trim().length < 2} onClick={() => onSalvar(novo)}>Salvar</button>
    </div>
  );
}

/** Ocultar/excluir: para onde vai o que já está na categoria (e o que as regras mandariam para ela). */
function EscolherDestino({ catalogo, nome, tipo, lancamentos, enviando, onConfirmar, onCancelar }: {
  catalogo: Catalogo; nome: string; tipo: "ocultar" | "excluir"; lancamentos: number; enviando: boolean;
  onConfirmar: (destino: string | null) => void; onCancelar: () => void;
}) {
  const opcoes = destinosPossiveis(catalogo, nome);
  const [modo, setModo] = useState<"mover" | "sem">("mover");
  const [destino, setDestino] = useState("");
  const grupos = catalogo.grupos.map((g) => ({ ...g, categorias: g.categorias.filter((c) => opcoes.includes(c)) })).filter((g) => g.categorias.length > 0);
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 space-y-2 text-sm" data-escolher-destino>
      <p className="text-slate-700">
        {lancamentos > 0 ? `O que fazer com ${plural(lancamentos, "lançamento")} em “${nome}”` : `Para onde vai o que cairia em “${nome}”`}
        {tipo === "ocultar" ? " e com o que as regras mandariam para ela?" : "?"}
      </p>
      <label className="flex items-center gap-2 flex-wrap">
        <input type="radio" name={`destino-${nome}`} checked={modo === "mover"} onChange={() => setModo("mover")} />
        Mover para
        <select aria-label="Categoria de destino" value={destino} onChange={(e) => { setDestino(e.target.value); setModo("mover"); }} className="text-sm py-1">
          <option value="">Escolha…</option>
          {grupos.map((g) => (
            <optgroup key={g.grupo} label={g.grupo}>
              {g.categorias.map((c) => <option key={c} value={c}>{c}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2">
        <input type="radio" name={`destino-${nome}`} checked={modo === "sem"} onChange={() => setModo("sem")} />
        Deixar sem categoria
      </label>
      <div className="flex justify-end gap-2">
        <button className="btn btn-secondary text-xs py-1" onClick={onCancelar}>Cancelar</button>
        <button className={`btn text-xs py-1 ${tipo === "excluir" ? "bg-red-600 text-white hover:bg-red-700" : "btn-primary"}`}
          disabled={enviando || (modo === "mover" && !destino)}
          onClick={() => onConfirmar(modo === "mover" ? destino : null)}>
          {tipo === "ocultar" ? "Ocultar" : "Excluir"}
        </button>
      </div>
    </div>
  );
}
