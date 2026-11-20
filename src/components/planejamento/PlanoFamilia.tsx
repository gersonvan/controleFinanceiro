"use client";
// Aba "Família" do Planejamento (lib/familia.ts, /api/familia): planos da família
// compartilhados entre os membros (quem criou convida). Cada membro diz quem é na
// casa e traz a própria Fotografia do mês; pessoas, renda de cada uma, contas
// fixas com quem paga e para quem, e cenários. Edita na tela e grava de uma vez
// ("Salvar"); se outro membro salvou nesse meio-tempo, as alterações se juntam.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import CategoriaSelect from "@/components/CategoriaSelect";
import { CatalogoProvider } from "@/components/Categorias";
import { parseValor } from "@/lib/importacao/tipos";
import {
  aplicarDaFotografia, compararCenarios, duplicarCenario, grupoDoItem, mesclarPlanos, novaChave, novidadesDaFotografia, pagaContas,
  pessoaSugerida, problemasDePrivacidade, problemasDoPlano, resumirCenario, semLinhasVazias, TIPOS_PESSOA, trazerDaFotografia,
  type Cenario, type DadosFamilia, type DaFotografia, type ItemFamilia, type Ocultacao, type Pessoa, type TipoPessoa,
} from "@/lib/familia";
import { montarCatalogo, type Catalogo, type LinhaCategoriaUsuario } from "@/lib/catalogo-categorias";
import type { ItemPlanejado } from "@/lib/planejamento";
import { INFO_FATIA } from "@/lib/fatias";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDelta = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmt(Math.abs(v))}`;
const pct = (v: number, base: number) => (base > 0 ? `${Math.round((v / base) * 100)}%` : "—");
const rotuloTipo = (t: TipoPessoa) => TIPOS_PESSOA.find((x) => x.v === t)!.rotulo;
const plural = (n: number, s: string, p = `${s}s`) => `${n} ${n === 1 ? s : p}`;
const hora = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

interface Membro {
  id: number; email: string; nome: string; pessoa: string | null; aceito: boolean; eu: boolean; criador: boolean; podeEntrar?: boolean;
  mostrarRenda: boolean; mostrarPessoais: boolean;
}
interface PlanoCarregado {
  id: number; nome: string; versao: number; souCriador: boolean; dados: DadosFamilia;
  atualizadoPor: string | null; atualizadoEm: string; vistos: string[] | null;
  ocultas: Ocultacao[]; // o que os outros membros mantêm privado (não vem nos dados)
  categorias: LinhaCategoriaUsuario[]; membros: Membro[];
}
interface Resposta {
  eu: { email: string; nome: string };
  planos: { id: number; nome: string; souCriador: boolean }[];
  convites: { plano: number; nome: string; de: string }[];
  plano: PlanoCarregado | null;
}
type InfoPlano = Omit<PlanoCarregado, "dados" | "versao">;
function infoDe(p: PlanoCarregado): InfoPlano {
  const info: Partial<PlanoCarregado> = { ...p };
  delete info.dados; delete info.versao;
  return info as InfoPlano;
}

async function enviar(metodo: "POST" | "PATCH" | "DELETE", corpo?: object, query = "") {
  try {
    const r = await fetch(`/api/familia${query}`, { method: metodo, headers: { "Content-Type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true as const, j } : { ok: false as const, erro: (j.error as string) ?? "Não foi possível concluir." };
  } catch {
    return { ok: false as const, erro: "Sem conexão com o servidor. Tente de novo." };
  }
}

/** Valor em reais: texto livre enquanto digita, número ao sair do campo. */
function CampoValor({ valor, onChange, rotulo }: { valor: number; onChange: (v: number) => void; rotulo: string }) {
  const [texto, setTexto] = useState(valor ? valor.toFixed(2).replace(".", ",") : "");
  return (
    <input aria-label={rotulo} inputMode="decimal" placeholder="0,00" value={texto} className="text-sm w-28 min-w-0"
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        const v = parseValor(texto);
        const ok = Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0;
        onChange(ok);
        setTexto(ok ? ok.toFixed(2).replace(".", ",") : "");
      }} />
  );
}

export default function PlanoFamilia() {
  const [resp, setResp] = useState<Resposta | null>(null);
  const [pedido, setPedido] = useState<number | null>(null);
  const [carga, setCarga] = useState(0);
  const [erroCarga, setErroCarga] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const sujo = useRef(false);

  useEffect(() => {
    let ativo = true;
    // falha ao carregar não vira plano vazio: salvar por cima apagaria o que existe
    fetch(`/api/familia${pedido ? `?plano=${pedido}` : ""}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: Resposta) => { if (ativo) { setResp(j); setErroCarga(false); } })
      .catch(() => { if (ativo) setErroCarga(true); });
    return () => { ativo = false; };
  }, [pedido, carga]);

  const recarregar = (plano: number | null) => { sujo.current = false; setPedido(plano); setCarga((c) => c + 1); };
  const podeSair = () => !sujo.current || confirm("Há alterações não salvas neste plano. Sair mesmo assim?");

  if (erroCarga && !resp) {
    return (
      <div className="card text-sm text-red-700 bg-red-50 border-red-200 flex items-center justify-between gap-3 flex-wrap" role="alert">
        Não foi possível carregar o plano da família.
        <button className="btn btn-secondary text-sm" onClick={() => { setErroCarga(false); setCarga((c) => c + 1); }}>Tentar de novo</button>
      </div>
    );
  }
  if (!resp) return <div className="flex justify-center py-20"><div className="spinner" /></div>;

  const responderConvite = async (plano: number, aceitar: boolean) => {
    const r = await enviar("PATCH", { plano, acao: aceitar ? "aceitar" : "recusar" });
    if (!r.ok) { setAviso({ tipo: "erro", texto: r.erro }); return; }
    if (aceitar && !podeSair()) return;
    setAviso(aceitar ? { tipo: "ok", texto: "Convite aceito. Diga em “Quem participa” quem é você na casa e traga sua Fotografia do mês." } : null);
    recarregar(aceitar ? plano : resp.plano?.id ?? null);
  };

  return (
    <div className="space-y-6" data-plano-familia>
      <p className="text-sm text-slate-500">
        As contas fixas da casa, quem paga cada uma e quanto sobra para cada pessoa — num plano que vocês editam juntos.
        Só o que está no plano é compartilhado: os lançamentos e a Fotografia de cada um continuam só de cada um.
      </p>

      {resp.convites.map((c) => (
        <div key={c.plano} className="card border-blue-200 bg-blue-50/40 flex flex-wrap items-center gap-3 text-sm" data-convite={c.nome}>
          <span className="flex-1 min-w-48"><strong>{c.de}</strong> convidou você para o plano da família <strong>“{c.nome}”</strong>.</span>
          <button className="btn btn-primary text-sm" onClick={() => void responderConvite(c.plano, true)}>Aceitar</button>
          <button className="btn btn-secondary text-sm" onClick={() => void responderConvite(c.plano, false)}>Recusar</button>
        </div>
      ))}

      {aviso && (
        <div className={`text-sm rounded-lg px-3 py-2 border ${aviso.tipo === "ok" ? "text-green-800 bg-green-50 border-green-200" : "text-red-700 bg-red-50 border-red-200"}`}
          role={aviso.tipo === "ok" ? "status" : "alert"}>{aviso.texto}</div>
      )}

      {resp.plano ? (
        <>
          <BarraPlanos planos={resp.planos} atual={resp.plano.id}
            onEscolher={(id) => { if (podeSair()) { setAviso(null); recarregar(id); } }}
            onCriado={(id) => { if (podeSair()) { setAviso(null); recarregar(id); } }} />
          <EditorPlano key={`${resp.plano.id}:${carga}`} inicial={resp.plano} eu={resp.eu}
            onSujo={(s) => { sujo.current = s; }}
            onRenomeado={(nome) => setResp((r) => r && { ...r, planos: r.planos.map((p) => (p.id === r.plano?.id ? { ...p, nome } : p)) })}
            onSaiu={(texto) => { setAviso({ tipo: "ok", texto }); recarregar(null); }} />
        </>
      ) : (
        <SemPlano onCriado={(id) => { setAviso(null); recarregar(id); }} />
      )}
    </div>
  );
}

function SemPlano({ onCriado }: { onCriado: (id: number) => void }) {
  const [nome, setNome] = useState("Plano da família");
  const [erro, setErro] = useState("");
  return (
    <section className="card space-y-3" data-sem-plano>
      <h2 className="font-semibold text-slate-700">Crie o plano da família</h2>
      <p className="text-sm text-slate-500">
        Depois convide quem divide as contas com você. Cada um traz a própria Fotografia do mês e vocês veem juntos quem paga
        o quê, quanto sobra para cada um e quanto custa cada filho.
      </p>
      <div className="flex flex-wrap gap-2">
        <input aria-label="Nome do plano" value={nome} maxLength={60} onChange={(e) => setNome(e.target.value)} className="text-sm flex-1 min-w-48" />
        <button className="btn btn-primary text-sm" disabled={!nome.trim()} onClick={async () => {
          const r = await enviar("POST", { nome });
          if (r.ok) onCriado(r.j.id); else setErro(r.erro);
        }}>Criar plano</button>
      </div>
      {erro && <p className="text-sm text-red-700" role="alert">{erro}</p>}
    </section>
  );
}

function BarraPlanos({ planos, atual, onEscolher, onCriado }: {
  planos: Resposta["planos"]; atual: number; onEscolher: (id: number) => void; onCriado: (id: number) => void;
}) {
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState("");
  const criar = async () => {
    if (!nome.trim()) return;
    const r = await enviar("POST", { nome });
    if (r.ok) { setCriando(false); setNome(""); setErro(""); onCriado(r.j.id); } else setErro(r.erro);
  };
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm" data-planos>
      {planos.length > 1 ? (
        <label className="flex items-center gap-2 text-slate-600">Plano
          <select aria-label="Plano" value={atual} onChange={(e) => onEscolher(Number(e.target.value))} className="text-sm font-medium">
            {planos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </label>
      ) : <h2 className="text-lg font-semibold text-slate-800" data-nome-plano>{planos.find((p) => p.id === atual)?.nome}</h2>}
      {criando ? (
        <span className="flex items-center gap-2">
          <input aria-label="Nome do novo plano" autoFocus value={nome} maxLength={60} placeholder="Ex.: Casa dos meus pais" className="text-sm w-56"
            onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void criar(); }} />
          <button className="btn btn-primary text-xs py-1" onClick={() => void criar()}>Criar</button>
          <button className="btn btn-secondary text-xs py-1" onClick={() => { setCriando(false); setErro(""); }}>Cancelar</button>
        </span>
      ) : (
        <button className="text-slate-500 hover:text-slate-800 ml-auto" onClick={() => setCriando(true)}
          title="Outro plano, com outras pessoas (ex.: a casa dos seus pais)">+ Outro plano</button>
      )}
      {erro && <span className="text-red-700" role="alert">{erro}</span>}
    </div>
  );
}

function EditorPlano({ inicial, eu, onSujo, onRenomeado, onSaiu }: {
  inicial: PlanoCarregado; eu: Resposta["eu"];
  onSujo: (sujo: boolean) => void; onRenomeado: (nome: string) => void; onSaiu: (aviso: string) => void;
}) {
  const [info, setInfo] = useState<InfoPlano>(() => infoDe(inicial));
  const catalogo = useMemo(() => montarCatalogo(info.categorias), [info.categorias]);
  const [dados, setDados] = useState<DadosFamilia>(inicial.dados);
  const [base, setBase] = useState<DadosFamilia>(inicial.dados); // como está no servidor: a base para juntar edições
  const [versao, setVersao] = useState(inicial.versao);
  const [atual, setAtual] = useState(() => inicial.dados.cenarios.find((c) => c.principal)?.chave ?? "principal");
  const [sujo, setSujoLocal] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string; detalhes?: string[] } | null>(null);
  const [tentouSalvar, setTentouSalvar] = useState(false); // a partir daí, os problemas aparecem e somem enquanto o usuário corrige
  const [vistosPendentes, setVistosPendentes] = useState<string[] | null>(null); // trazidos da Fotografia: marcados ao salvar
  const [fotografia, setFotografia] = useState<ItemPlanejado[] | null>(null);

  const sujoRef = useRef(false);
  const setSujo = useCallback((s: boolean) => { sujoRef.current = s; setSujoLocal(s); onSujo(s); }, [onSujo]);

  useEffect(() => {
    let ativo = true;
    fetch("/api/familia/fotografia")
      .then((r) => (r.ok ? r.json() : { itens: [] }))
      .then((j) => { if (ativo) setFotografia(j.itens ?? []); })
      .catch(() => { if (ativo) setFotografia([]); });
    return () => { ativo = false; };
  }, []);

  // sair com alterações não salvas: o navegador pergunta
  useEffect(() => {
    if (!sujo) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sujo]);

  const mudar = useCallback((f: (d: DadosFamilia) => void) => {
    setDados((d) => { const novo = structuredClone(d); f(novo); return novo; });
    setSujo(true);
    setAviso(null);
  }, [setSujo]);

  /**
   * Membros, nome, categorias e privacidade de novo do servidor (após convidar,
   * mudar o que os outros veem…). O plano também, se não há edição em andamento —
   * havendo, o "Salvar" junta com a versão nova.
   */
  const atualizarInfo = async () => {
    const r = await fetch(`/api/familia?plano=${inicial.id}`).catch(() => null);
    if (!r?.ok) return;
    const j: Resposta = await r.json();
    if (j.plano?.id !== inicial.id) return;
    setInfo(infoDe(j.plano));
    if (!sujoRef.current) { setDados(j.plano.dados); setBase(j.plano.dados); setVersao(j.plano.versao); }
  };

  /** O que impede salvar: o que falta preencher e o que é privado de outro membro. */
  const conferir = (d: DadosFamilia) => [...problemasDoPlano(d), ...problemasDePrivacidade(d, info.ocultas)];

  const salvar = async () => {
    const limpo = semLinhasVazias(dados);
    setTentouSalvar(true); setAviso(null);
    if (conferir(limpo).length > 0) return;
    setSalvando(true);
    try {
      let mandar = limpo, v = versao, b = base, juntou: string | null = null;
      for (let vez = 0; vez < 3; vez++) {
        const r = await fetch("/api/familia", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plano: inicial.id, dados: mandar, versao: v, ...(vistosPendentes && { vistos: vistosPendentes }) }),
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok) {
          setDados(j.dados); setBase(j.dados); setVersao(j.versao); setSujo(false); setTentouSalvar(false);
          setInfo((i) => ({ ...i, atualizadoPor: eu.nome, atualizadoEm: new Date().toISOString(), ...(vistosPendentes && { vistos: vistosPendentes }) }));
          setVistosPendentes(null);
          void atualizarInfo(); // quem entrou, saiu ou mudou de pessoa enquanto isso
          setAviso({ tipo: "ok", texto: `Plano salvo às ${hora(new Date())}.${juntou ? ` Suas alterações foram juntadas com as que ${juntou} salvou enquanto você editava.` : ""}` });
          return;
        }
        if (r.status === 409 && j.dados) {
          // outro membro salvou: junta o que cada um mudou e tenta de novo
          juntou = j.atualizadoPor ?? "outra pessoa";
          const m = mesclarPlanos(b, mandar, j.dados);
          if (m.conflitos.length > 0 || conferir(m.dados).length > 0) {
            setDados(m.dados); setBase(j.dados); setVersao(j.versao); setSujo(true);
            setAviso(m.conflitos.length > 0 ? {
              tipo: "erro",
              texto: `${juntou} salvou o plano enquanto você editava. Juntei as alterações, mas vocês dois mexeram no mesmo ponto — ficou como ${juntou} deixou. Confira e salve de novo:`,
              detalhes: m.conflitos,
            } : { tipo: "erro", texto: `${juntou} salvou o plano enquanto você editava. Juntei as alterações: confira os itens destacados e salve de novo.` });
            return;
          }
          mandar = m.dados; v = j.versao; b = j.dados;
          continue;
        }
        // "Dados inválidos" traz detalhes técnicos (caminhos do validador): não servem ao usuário
        const tecnico = r.status === 400 && j.error === "Dados inválidos";
        setAviso({ tipo: "erro", texto: tecnico ? "O plano não pôde ser salvo. Confira os itens e tente de novo." : j.error ?? "Não foi possível salvar.", detalhes: tecnico ? undefined : j.detalhes });
        return;
      }
      setAviso({ tipo: "erro", texto: "O plano está sendo alterado por outras pessoas agora. Tente salvar de novo em instantes." });
    } catch {
      setAviso({ tipo: "erro", texto: "Sem conexão com o servidor. Suas alterações continuam na tela: tente salvar de novo." });
    } finally { setSalvando(false); }
  };

  const cenario = dados.cenarios.find((c) => c.chave === atual) ?? dados.cenarios[0];
  const principal = dados.cenarios.find((c) => c.principal);
  const resumo = useMemo(() => resumirCenario(dados, cenario, catalogo), [dados, cenario, catalogo]);
  const comparacao = useMemo(
    () => (principal && !cenario.principal ? compararCenarios(dados, principal, cenario, catalogo) : null),
    [dados, cenario, principal, catalogo]);

  const problemas = tentouSalvar ? conferir(semLinhasVazias(dados)) : [];
  const comProblema = new Set(problemas.filter((p) => p.cenario === cenario.chave).map((p) => p.item));
  const destaque = (i: ItemFamilia) => (comProblema.has(i.chave) ? "ring-1 ring-red-300 bg-red-50 rounded -mx-2 px-2 py-1" : "");

  const eu_ = info.membros.find((m) => m.eu);
  const minhaPessoa = eu_?.pessoa ?? null;
  const ligadas = new Map(info.membros.filter((m) => m.pessoa).map((m) => [m.pessoa!, m.eu ? "você" : m.nome]));
  const varios = info.membros.length > 1;
  const autor = (i: ItemFamilia) => (varios && i.por ? (i.fonte === "fotografia" ? `da Fotografia de ${i.por}` : `incluído por ${i.por}`) : null);

  const pagadores = dados.pessoas.filter(pagaContas);
  const mudarCenario = (f: (c: Cenario) => void) => mudar((d) => f(d.cenarios.find((c) => c.chave === cenario.chave)!));
  const mudarItem = (chave: string, campos: Partial<ItemFamilia>) =>
    mudarCenario((c) => { Object.assign(c.itens.find((i) => i.chave === chave)!, campos); });
  const novoItem = (tipo: ItemFamilia["tipo"]) => mudarCenario((c) => c.itens.push({
    chave: novaChave(), tipo, descricao: "", valor: 0, periodicidade: "mensal",
    pessoa: (minhaPessoa && pagadores.some((p) => p.chave === minhaPessoa) ? minhaPessoa : pagadores[0]?.chave) ?? "",
    para: null, categoria: null, grupo: null, origem: null, por: eu.nome, fonte: null,
  }));
  // no cenário, o que mudou em relação ao item do principal
  const doPrincipal = new Map(principal?.itens.map((i) => [i.chave, i]) ?? []);
  const mudou = (i: ItemFamilia) => !cenario.principal && (!i.origem || (doPrincipal.get(i.origem)?.valor !== i.valor));
  const ultimo = info.atualizadoPor
    ? `salvo por ${info.atualizadoPor === eu.nome ? "você" : info.atualizadoPor} em ${new Date(info.atualizadoEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${hora(new Date(info.atualizadoEm))}`
    : null;

  return (
    <CatalogoProvider catalogo={catalogo}>
      <div className="space-y-6">
        <BarraCenarios dados={dados} atual={cenario} sujo={sujo} salvando={salvando} ultimo={ultimo}
          onEscolher={setAtual} onSalvar={() => void salvar()}
          onNovo={(nome) => { const novo = duplicarCenario(dados, cenario, nome); mudar((d) => { d.cenarios.push(novo); }); setAtual(novo.chave); }}
          onRenomear={(nome) => mudarCenario((c) => { c.nome = nome; })}
          onExcluir={() => { mudar((d) => { d.cenarios = d.cenarios.filter((c) => c.chave !== cenario.chave); }); setAtual(principal!.chave); }} />

        <DaMinhaFotografia fotografia={fotografia} minhaPessoa={pagadores.some((p) => p.chave === minhaPessoa) ? minhaPessoa : null}
          nomePessoa={pagadores.find((p) => p.chave === minhaPessoa)?.nome ?? ""} cenario={cenario} catalogo={catalogo}
          vistos={vistosPendentes ?? info.vistos} por={eu.nome} rendaPrivada={!eu_?.mostrarRenda} varios={varios}
          onTrazer={(previa) => {
            mudarCenario((c) => aplicarDaFotografia(c, previa));
            setVistosPendentes(previa.assinaturas);
            const n = previa.novos.length, a = previa.alterados.length;
            setAviso({ tipo: "ok", texto: `${[n && plural(n, "item trazido", "itens trazidos"), a && plural(a, "valor atualizado", "valores atualizados")].filter(Boolean).join(" e ")} da sua Fotografia para "${cenario.nome}". Confira quem paga e para quem, e salve.` });
          }}
          onDispensar={async (assinaturas) => {
            const r = await enviar("PATCH", { plano: inicial.id, acao: "vistos", vistos: assinaturas });
            if (r.ok) setInfo((i) => ({ ...i, vistos: assinaturas }));
          }} />

        {problemas.length > 0 && (
          <div className="text-sm rounded-lg px-3 py-2 border text-red-700 bg-red-50 border-red-200" role="alert" data-problemas>
            Falta completar {problemas.length === 1 ? "um item" : `${problemas.length} itens`} antes de salvar (destacados em vermelho):
            <ul className="list-disc pl-5 mt-1">{problemas.map((p, k) => <li key={k}>{p.texto}</li>)}</ul>
          </div>
        )}

        {aviso && (
          <div className={`text-sm rounded-lg px-3 py-2 border ${aviso.tipo === "ok" ? "text-green-800 bg-green-50 border-green-200" : "text-red-700 bg-red-50 border-red-200"}`}
            role={aviso.tipo === "ok" ? "status" : "alert"} data-aviso-plano>
            {aviso.texto}
            {aviso.detalhes && <ul className="list-disc pl-5 mt-1">{aviso.detalhes.map((d) => <li key={d}>{d}</li>)}</ul>}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
          <div className="space-y-6 min-w-0">
            <Participantes planoId={inicial.id} info={info} salvos={base}
              sugerida={eu_ && !eu_.pessoa ? pessoaSugerida(base, eu.nome, info.membros.map((m) => m.pessoa)) : null}
              onMudou={() => void atualizarInfo()}
              onRenomeado={(nome) => { setInfo((i) => ({ ...i, nome })); onRenomeado(nome); }}
              onSaiu={onSaiu} />

            <Pessoas dados={dados} ligadas={ligadas} mudar={mudar} />

            <section className="card space-y-3" data-secao="rendas">
              <h2 className="font-semibold text-slate-700">Renda</h2>
              {cenario.itens.filter((i) => i.tipo === "renda").length === 0 && <p className="text-sm text-slate-400">Nenhuma renda ainda.</p>}
              {cenario.itens.filter((i) => i.tipo === "renda").map((i) => (
                <div key={`${cenario.chave}-${i.chave}`} className={`flex flex-wrap items-center gap-2 ${mudou(i) ? "bg-amber-50 -mx-2 px-2 py-1 rounded" : ""} ${destaque(i)}`} data-item={i.descricao}>
                  <select aria-label="De quem" value={i.pessoa} onChange={(e) => mudarItem(i.chave, { pessoa: e.target.value })} className="text-sm">
                    {pagadores.map((p) => <option key={p.chave} value={p.chave}>{p.nome}</option>)}
                  </select>
                  <input aria-label="Descrição da renda" placeholder="Salário, aluguel recebido…" value={i.descricao} maxLength={80}
                    onChange={(e) => mudarItem(i.chave, { descricao: e.target.value })} className="text-sm flex-1 min-w-32" />
                  <CampoValor key={`${i.chave}-${i.valor}`} rotulo="Valor da renda" valor={i.valor} onChange={(valor) => mudarItem(i.chave, { valor })} />
                  <Periodicidade item={i} onChange={(periodicidade) => mudarItem(i.chave, { periodicidade })} />
                  <Remover onClick={() => mudarCenario((c) => { c.itens = c.itens.filter((x) => x.chave !== i.chave); })} />
                  {autor(i) && <span className="basis-full text-xs text-slate-400" data-autor>{autor(i)}</span>}
                </div>
              ))}
              <button className="text-sm text-blue-700 hover:text-blue-900 inline-flex items-center gap-1" disabled={pagadores.length === 0}
                onClick={() => novoItem("renda")}><Plus size={14} /> Adicionar renda</button>
              {pagadores.length === 0 && <p className="text-xs text-slate-400">Cadastre primeiro um adulto (ou um imóvel, empresa…) que tenha renda.</p>}
            </section>

            <section className="card space-y-4" data-secao="contas">
              <h2 className="font-semibold text-slate-700">Contas fixas</h2>
              {cenario.itens.filter((i) => i.tipo === "conta").length === 0 && <p className="text-sm text-slate-400">Nenhuma conta ainda.</p>}
              {[...new Set(cenario.itens.filter((i) => i.tipo === "conta").map((i) => grupoDoItem(i, catalogo)))].map((grupo) => (
                <div key={grupo} className="space-y-2">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-slate-400">{grupo}</h3>
                  {cenario.itens.filter((i) => i.tipo === "conta" && grupoDoItem(i, catalogo) === grupo).map((i) => (
                    <div key={`${cenario.chave}-${i.chave}`} className={`space-y-1.5 border-b border-slate-100 pb-2 ${mudou(i) ? "bg-amber-50 -mx-2 px-2 pt-1 rounded" : ""} ${destaque(i)}`} data-item={i.descricao}>
                      <div className="flex flex-wrap items-center gap-2">
                        <input aria-label="Descrição da conta" placeholder="Aluguel, escola, plano de saúde…" value={i.descricao} maxLength={80}
                          onChange={(e) => mudarItem(i.chave, { descricao: e.target.value })} className="text-sm basis-full sm:basis-auto sm:flex-1 min-w-0" />
                        <CampoValor key={`${i.chave}-${i.valor}`} rotulo="Valor da conta" valor={i.valor} onChange={(valor) => mudarItem(i.chave, { valor })} />
                        <Periodicidade item={i} onChange={(periodicidade) => mudarItem(i.chave, { periodicidade })} />
                        <Remover onClick={() => mudarCenario((c) => { c.itens = c.itens.filter((x) => x.chave !== i.chave); })} />
                      </div>
                      {/* celular: grade de 2 colunas; tela larga: uma linha */}
                      <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 text-xs text-slate-500">
                        <label className="flex items-center gap-1 min-w-0">paga
                          <select aria-label="Quem paga" value={i.pessoa} onChange={(e) => mudarItem(i.chave, { pessoa: e.target.value })} className="text-xs py-1 min-w-0 flex-1 sm:flex-none sm:w-24">
                            {pagadores.map((p) => <option key={p.chave} value={p.chave}>{p.nome}</option>)}
                          </select>
                        </label>
                        <label className="flex items-center gap-1 min-w-0">para
                          <select aria-label="Para quem" value={i.para ?? ""} onChange={(e) => mudarItem(i.chave, { para: e.target.value || null })} className="text-xs py-1 min-w-0 flex-1 sm:flex-none sm:w-24">
                            <option value="">a casa</option>
                            {dados.pessoas.map((p) => <option key={p.chave} value={p.chave}>{p.nome}</option>)}
                          </select>
                        </label>
                        <CategoriaSelect value={i.categoria ?? ""} placeholder="Categoria…" className="text-xs py-1 min-w-0 w-full sm:w-44"
                          onChange={(categoria) => mudarItem(i.chave, { categoria: categoria || null })} />
                        {/* grupo livre: junta contas de uma mesma coisa (Carro, Apartamento…) na lista e em "Por grupo"; vazio = o da categoria */}
                        <input aria-label="Agrupar em (opcional)" placeholder="agrupar em (ex.: Carro)" value={i.grupo ?? ""} maxLength={40}
                          title="Opcional. Junta contas de uma mesma coisa, mesmo de categorias diferentes — ex.: IPVA, seguro e licenciamento em “Carro”. Aparece como título na lista e no resumo “Por grupo”. Vazio: fica no grupo da categoria."
                          onChange={(e) => mudarItem(i.chave, { grupo: e.target.value || null })} className="text-xs py-1 min-w-0 w-full col-span-2 sm:w-48" />
                        {mudou(i) && <span className="badge bg-amber-100 text-amber-800 col-span-2 justify-self-start">{i.origem ? "mudou neste cenário" : "só neste cenário"}</span>}
                        {autor(i) && <span className="col-span-2 text-slate-400" data-autor>{autor(i)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              <button className="text-sm text-blue-700 hover:text-blue-900 inline-flex items-center gap-1" disabled={pagadores.length === 0}
                onClick={() => novoItem("conta")}><Plus size={14} /> Adicionar conta</button>
            </section>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-4">
            <Resumo resumo={resumo} ocultas={info.ocultas} pessoas={dados.pessoas} />
            {comparacao && <Comparacao comparacao={comparacao} privados={info.ocultas.length > 0} />}
          </aside>
        </div>
      </div>
    </CatalogoProvider>
  );
}

/**
 * Quem participa do plano. Quem criou convida (por e-mail), renomeia, remove e
 * exclui; os outros podem sair. Cada um diz quem é na casa — é para essa pessoa
 * que vai o que ele traz da própria Fotografia.
 */
function Participantes({ planoId, info, salvos, sugerida, onMudou, onRenomeado, onSaiu }: {
  planoId: number; info: InfoPlano; salvos: DadosFamilia; sugerida: string | null;
  onMudou: () => void; onRenomeado: (nome: string) => void; onSaiu: (aviso: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [renomeando, setRenomeando] = useState(false);
  const [nome, setNome] = useState(info.nome);
  const pessoasSalvas = salvos.pessoas.filter(pagaContas);
  const nomePessoa = (chave: string | null) => salvos.pessoas.find((p) => p.chave === chave)?.nome;
  const eu = info.membros.find((m) => m.eu);
  const deOutros = new Set(info.membros.filter((m) => !m.eu && m.pessoa).map((m) => m.pessoa));

  const acao = async (corpo: object, ok?: string) => {
    const r = await enviar("PATCH", { plano: planoId, ...corpo });
    setMsg(r.ok ? (ok ? { tipo: "ok", texto: ok } : null) : { tipo: "erro", texto: r.erro });
    if (r.ok) onMudou();
    return r;
  };

  return (
    <section className="card space-y-3" data-secao="participantes">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {renomeando ? (
          <span className="flex items-center gap-2">
            <input aria-label="Nome do plano" autoFocus value={nome} maxLength={60} onChange={(e) => setNome(e.target.value)} className="text-sm w-56" />
            <button className="btn btn-primary text-xs py-1" onClick={async () => {
              const r = await acao({ acao: "renomear", nome });
              if (r.ok) { setRenomeando(false); onRenomeado(nome.trim()); }
            }}>OK</button>
            <button className="btn btn-secondary text-xs py-1" onClick={() => { setRenomeando(false); setNome(info.nome); }}>Cancelar</button>
          </span>
        ) : <h2 className="font-semibold text-slate-700">Quem participa</h2>}
        {info.souCriador && !renomeando && (
          <span className="ml-auto flex gap-3 text-xs">
            <button className="text-slate-500 hover:text-slate-800" onClick={() => setRenomeando(true)}>Renomear plano</button>
            <button className="text-red-600 hover:text-red-800" onClick={async () => {
              if (!confirm(`Excluir o plano “${info.nome}” para todos os participantes? Não dá para desfazer.`)) return;
              const r = await enviar("DELETE", undefined, `?plano=${planoId}`);
              if (r.ok) onSaiu(`Plano “${info.nome}” excluído.`); else setMsg({ tipo: "erro", texto: r.erro });
            }}>Excluir plano</button>
          </span>
        )}
      </div>

      <ul className="space-y-1.5">
        {info.membros.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm" data-membro={m.email}>
            <span className="text-slate-800">{m.eu ? `${m.nome} (você)` : m.nome}</span>
            <span className="text-xs text-slate-400">{m.email}</span>
            {m.criador && <span className="badge bg-slate-100 text-slate-600">criou o plano</span>}
            {!m.aceito && <span className="badge bg-amber-100 text-amber-800">convite pendente</span>}
            {m.aceito && !m.eu && <span className="text-xs text-slate-500">{m.pessoa ? `é ${nomePessoa(m.pessoa) ?? "—"} na casa` : "ainda não disse quem é na casa"}</span>}
            {m.aceito && !m.eu && m.pessoa && (!m.mostrarRenda || !m.mostrarPessoais) && (
              <span className="text-xs text-slate-400" title="Só essa pessoa vê">🔒 {[!m.mostrarRenda && "renda", !m.mostrarPessoais && "contas pessoais"].filter(Boolean).join(" e ")} privadas</span>
            )}
            {m.podeEntrar === false && <span className="text-xs text-amber-700">este e-mail ainda não consegue entrar no Prumo (lista de acesso)</span>}
            {info.souCriador && !m.eu && (
              <button className="text-xs text-red-600 hover:text-red-800 ml-auto" onClick={async () => {
                if (!confirm(`Tirar ${m.nome} do plano? O que ${m.nome} incluiu continua no plano.`)) return;
                await acao({ acao: "remover", membro: m.id }, `${m.nome} saiu do plano.`);
              }}>{m.aceito ? "Tirar" : "Cancelar convite"}</button>
            )}
          </li>
        ))}
      </ul>

      {eu && (
        <label className={`flex flex-wrap items-center gap-2 text-sm ${eu.pessoa ? "text-slate-600" : "text-blue-800 font-medium"}`}>
          Na casa, você é
          <select aria-label="Quem é você na casa" value={eu.pessoa ?? ""} className="text-sm"
            onChange={(e) => void acao({ acao: "pessoa", pessoa: e.target.value || null })}>
            <option value="" disabled={!!eu.pessoa}>{sugerida ? "escolha…" : "escolha (salve antes uma pessoa nova)…"}</option>
            {pessoasSalvas.map((p) => <option key={p.chave} value={p.chave} disabled={deOutros.has(p.chave)}>{p.nome}{p.chave === sugerida ? " (sugerido)" : ""}</option>)}
          </select>
        </label>
      )}
      {eu?.pessoa && (
        <fieldset className="text-sm text-slate-600 space-y-1" data-privacidade>
          <legend className="text-xs text-slate-500 mb-1">O que os outros participantes veem de você (as contas da casa são sempre de todos):</legend>
          {([
            ["mostrarRenda", "Minha renda", "Sua renda agora aparece para os outros participantes.", "Sua renda agora é privada: só você vê."],
            ["mostrarPessoais", "Minhas contas pessoais (pagas por mim, para mim)", "Suas contas pessoais agora aparecem para os outros participantes.", "Suas contas pessoais agora são privadas: só você vê."],
          ] as const).map(([campo, rotulo, aberto, fechado]) => (
            <label key={campo} className="flex items-center gap-2">
              <input type="checkbox" checked={eu[campo]} onChange={(e) => void acao({
                acao: "privacidade", mostrarRenda: eu.mostrarRenda, mostrarPessoais: eu.mostrarPessoais, [campo]: e.target.checked,
              }, e.target.checked ? aberto : fechado)} />
              {rotulo} <span className="text-xs text-slate-400">{eu[campo] ? "— visível" : "— 🔒 só você vê"}</span>
            </label>
          ))}
        </fieldset>
      )}

      {info.souCriador ? (
        <form className="flex flex-wrap gap-2" onSubmit={async (e) => {
          e.preventDefault();
          const r = await acao({ acao: "convidar", email }, `Convite enviado para ${email.trim()}: o plano aparece na aba Família quando a pessoa entrar no Prumo.`);
          if (r.ok) {
            setEmail("");
            if (r.j.podeEntrar === false) setMsg({ tipo: "erro", texto: `Convite criado, mas ${r.j.email} ainda não consegue entrar no Prumo: o e-mail precisa estar na lista de acesso.` });
          }
        }}>
          <input aria-label="E-mail para convidar" type="email" placeholder="e-mail de quem divide as contas" value={email} maxLength={200}
            onChange={(e) => setEmail(e.target.value)} className="text-sm flex-1 min-w-48" />
          <button className="btn btn-secondary text-sm" disabled={!email.trim()}>Convidar</button>
        </form>
      ) : (
        <button className="text-xs text-slate-500 hover:text-red-700" onClick={async () => {
          if (!confirm(`Sair do plano “${info.nome}”? Você deixa de vê-lo; o que você incluiu continua lá.`)) return;
          const r = await enviar("PATCH", { plano: planoId, acao: "sair" });
          if (r.ok) onSaiu(`Você saiu do plano “${info.nome}”.`); else setMsg({ tipo: "erro", texto: r.erro });
        }}>Sair do plano</button>
      )}
      {msg && <p className={`text-sm ${msg.tipo === "ok" ? "text-green-800" : "text-red-700"}`} role={msg.tipo === "ok" ? "status" : "alert"}>{msg.texto}</p>}
    </section>
  );
}

function Periodicidade({ item, onChange }: { item: ItemFamilia; onChange: (p: ItemFamilia["periodicidade"]) => void }) {
  return (
    <select aria-label="Periodicidade" value={item.periodicidade} onChange={(e) => onChange(e.target.value as ItemFamilia["periodicidade"])} className="text-sm">
      <option value="mensal">por mês</option>
      <option value="anual">por ano</option>
    </select>
  );
}

function Remover({ onClick }: { onClick: () => void }) {
  return <button type="button" aria-label="Remover" title="Remover" onClick={onClick} className="text-slate-400 hover:text-red-600"><Trash2 size={15} /></button>;
}

function BarraCenarios({ dados, atual, sujo, salvando, ultimo, onEscolher, onNovo, onRenomear, onExcluir, onSalvar }: {
  dados: DadosFamilia; atual: Cenario; sujo: boolean; salvando: boolean; ultimo: string | null;
  onEscolher: (chave: string) => void; onNovo: (nome: string) => void; onRenomear: (nome: string) => void; onExcluir: () => void; onSalvar: () => void;
}) {
  const [editando, setEditando] = useState<"novo" | "renomear" | null>(null);
  const [nome, setNome] = useState("");
  const confirmar = () => {
    const n = nome.trim();
    if (!n) return;
    if (editando === "novo") onNovo(n); else onRenomear(n);
    setEditando(null);
  };
  return (
    <div className="card flex flex-wrap items-center gap-3" data-cenarios>
      <label className="text-sm text-slate-600 flex items-center gap-2">Cenário
        <select aria-label="Cenário" value={atual.chave} onChange={(e) => onEscolher(e.target.value)} className="text-sm">
          {dados.cenarios.map((c) => <option key={c.chave} value={c.chave}>{c.nome}{c.principal ? " (principal)" : ""}</option>)}
        </select>
      </label>
      {editando ? (
        <div className="flex items-center gap-2">
          <input aria-label="Nome do cenário" autoFocus value={nome} maxLength={60} onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") confirmar(); }} className="text-sm w-48" placeholder="Ex.: Escola um turno" />
          <button className="btn btn-primary text-xs py-1" onClick={confirmar}>OK</button>
          <button className="btn btn-secondary text-xs py-1" onClick={() => setEditando(null)}>Cancelar</button>
        </div>
      ) : (
        <div className="flex items-center gap-3 text-sm">
          <button className="text-blue-700 hover:text-blue-900" onClick={() => { setNome(""); setEditando("novo"); }}
            title="Cria uma cópia deste cenário para alterar à vontade">+ Novo cenário</button>
          <button className="text-slate-500 hover:text-slate-800" onClick={() => { setNome(atual.nome); setEditando("renomear"); }}>Renomear</button>
          {!atual.principal && (
            <button className="text-red-600 hover:text-red-800" onClick={() => { if (confirm(`Excluir o cenário "${atual.nome}"?`)) onExcluir(); }}>Excluir</button>
          )}
        </div>
      )}
      <div className="ml-auto flex items-center gap-3">
        {sujo ? <span className="text-xs text-amber-700">Alterações não salvas</span> : ultimo && <span className="text-xs text-slate-400" data-ultimo>{ultimo}</span>}
        <button className="btn btn-primary" disabled={!sujo || salvando} onClick={onSalvar}>{salvando ? "Salvando…" : "Salvar"}</button>
      </div>
    </div>
  );
}

function Pessoas({ dados, ligadas, mudar }: { dados: DadosFamilia; ligadas: Map<string, string>; mudar: (f: (d: DadosFamilia) => void) => void }) {
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<TipoPessoa>("adulto");
  const [erro, setErro] = useState("");
  const usos = (p: Pessoa) => dados.cenarios.flatMap((c) => c.itens).filter((i) => i.pessoa === p.chave || i.para === p.chave).length;
  const pagaAlgo = (p: Pessoa) => dados.cenarios.flatMap((c) => c.itens).some((i) => i.pessoa === p.chave);
  return (
    <section className="card space-y-3" data-secao="pessoas">
      <h2 className="font-semibold text-slate-700">Pessoas da casa</h2>
      {dados.pessoas.length === 0 && (
        <p className="text-sm text-slate-500">
          Comece por quem tem renda e paga contas (os adultos), os dependentes (filhos) e, se quiser, um imóvel ou empresa
          com renda e contas próprias — como um apartamento alugado que paga o próprio condomínio.
        </p>
      )}
      <ul className="flex flex-wrap gap-2">
        {dados.pessoas.map((p) => (
          <li key={p.chave} className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 pl-3 pr-2 py-1 text-sm" data-pessoa={p.nome}>
            <span className="text-slate-800">{p.nome}</span>
            <span className="text-xs text-slate-400">{rotuloTipo(p.tipo).split(" (")[0].toLowerCase()}</span>
            {ligadas.has(p.chave) && <span className="text-xs text-blue-700" title="Participante do plano">· {ligadas.get(p.chave)}</span>}
            {/* quem participa do plano não sai da lista de pessoas */}
            {!ligadas.has(p.chave) && (
              <button aria-label={`Tirar ${p.nome}`} title="Tirar" className="text-slate-400 hover:text-red-600"
                onClick={() => {
                  const n = usos(p);
                  if (n > 0) { setErro(`${p.nome} aparece em ${n} ${n === 1 ? "item" : "itens"} (renda, quem paga ou para quem). Troque ou remova antes.`); return; }
                  setErro("");
                  mudar((d) => { d.pessoas = d.pessoas.filter((x) => x.chave !== p.chave); });
                }}><Trash2 size={13} /></button>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
          <input aria-label="Nome da pessoa" placeholder="Nome" value={nome} maxLength={40} onChange={(e) => setNome(e.target.value)} className="text-sm flex-1 min-w-32" />
          <select aria-label="Tipo de pessoa" value={tipo} onChange={(e) => setTipo(e.target.value as TipoPessoa)} className="text-sm">
            {TIPOS_PESSOA.map((t) => <option key={t.v} value={t.v}>{t.rotulo}</option>)}
          </select>
          <button className="btn btn-secondary text-sm" disabled={!nome.trim()}
            onClick={() => {
              if (dados.pessoas.some((p) => p.nome.toLowerCase() === nome.trim().toLowerCase())) { setErro("Já tem alguém com esse nome."); return; }
              setErro("");
              mudar((d) => { d.pessoas.push({ chave: novaChave(), nome: nome.trim(), tipo }); });
              setNome("");
            }}>Adicionar</button>
      </div>
      {erro && <p className="text-sm text-amber-700" role="alert">{erro}</p>}
      {dados.pessoas.some((p) => p.tipo === "dependente" && pagaAlgo(p)) && (
        <p className="text-sm text-amber-700">Dependente não tem renda nem paga contas: ajuste os itens marcados.</p>
      )}
    </section>
  );
}

/**
 * Com a renda (ou as contas pessoais) de alguém privada, os números que a
 * revelariam não aparecem: a sobra dessa pessoa e a renda e a sobra da casa
 * (com duas pessoas, o total menos a minha renda é a renda da outra).
 */
function Resumo({ resumo, ocultas, pessoas }: { resumo: ReturnType<typeof resumirCenario>; ocultas: Ocultacao[]; pessoas: Pessoa[] }) {
  const { renda, contas, sobra, porPessoa, porDependente, grupos, fatias } = resumo;
  const nomeDe = (chave: string) => pessoas.find((p) => p.chave === chave)?.nome;
  const doPlano = ocultas.filter((o) => nomeDe(o.pessoa));
  const rendaPrivada = doPlano.filter((o) => o.renda).map((o) => nomeDe(o.pessoa)!);
  const pessoaisPrivadas = doPlano.filter((o) => o.pessoais).map((o) => nomeDe(o.pessoa)!);
  const privado = (chave: string) => doPlano.find((o) => o.pessoa === chave);
  const lista = (nomes: string[]) => nomes.join(" e ");
  return (
    <>
      <section className="card space-y-2" data-resumo>
        <h2 className="font-semibold text-slate-700">Por mês</h2>
        {rendaPrivada.length > 0 ? (
          <div className="flex justify-between gap-3 text-sm"><span className="text-slate-600">Renda da casa</span>
            <span className="text-slate-800 text-right">{renda > 0 && `${fmt(renda)} + `}a de {lista(rendaPrivada)} <span className="text-xs text-slate-400">(privada)</span></span></div>
        ) : <Linha rotulo="Renda da casa" valor={renda} />}
        <Linha rotulo={pessoaisPrivadas.length > 0 ? `Contas fixas (sem as pessoais de ${lista(pessoaisPrivadas)})` : "Contas fixas"} valor={contas} />
        {rendaPrivada.length > 0 ? (
          <p className="text-xs text-slate-500 pt-1 border-t border-slate-100" data-sobra>A sobra da casa não aparece: a renda de {lista(rendaPrivada)} é privada.</p>
        ) : (
          <div className={`flex justify-between text-sm font-semibold pt-1 border-t border-slate-100 ${sobra < 0 ? "text-amber-700" : "text-slate-800"}`} data-sobra>
            <span>{sobra < 0 ? "Falta" : "Sobra"}</span><span>{fmt(Math.abs(sobra))}</span>
          </div>
        )}
        <p className="text-xs text-slate-400">Contas anuais entram divididas por 12.</p>
      </section>

      {porPessoa.length > 0 && (
        <section className="card space-y-2" data-por-pessoa>
          <h2 className="font-semibold text-slate-700">Quem paga o quê</h2>
          {porPessoa.map((p) => {
            const o = privado(p.chave);
            return (
              <div key={p.chave} className="text-sm border-b border-slate-100 last:border-0 pb-2" data-pessoa-resumo={p.nome}>
                <div className="flex justify-between font-medium text-slate-800"><span>{p.nome}</span>
                  {o ? <span className="text-slate-400 font-normal">sobra privada</span>
                    : <span className={p.sobra < 0 ? "text-amber-700" : ""}>{p.sobra < 0 ? "falta " : "sobra "}{fmt(Math.abs(p.sobra))}</span>}</div>
                <div className="text-xs text-slate-500">
                  {o?.renda ? "renda privada" : `renda ${fmt(p.renda)}`} · paga da casa {fmt(p.pagaCasa)}
                  {o?.pessoais ? " · contas pessoais privadas" : p.pagaIndividual > 0 && ` · individual ${fmt(p.pagaIndividual)}`}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {porDependente.length > 0 && (
        <section className="card space-y-2" data-por-dependente>
          <h2 className="font-semibold text-slate-700">Custo por filho</h2>
          {porDependente.map((d) => (
            <div key={d.chave} className="text-sm">
              <div className="flex justify-between"><span className="text-slate-800">{d.nome}</span><span className="font-medium">{fmt(d.total)}</span></div>
              {d.itens.length > 0 && <div className="text-xs text-slate-500">{d.itens.map((i) => `${i.descricao} ${fmt(i.valor)}`).join(" · ")}</div>}
            </div>
          ))}
        </section>
      )}

      {grupos.length > 0 && (
        <section className="card space-y-1.5">
          <h2 className="font-semibold text-slate-700">Por grupo</h2>
          {grupos.map((g) => <Linha key={g.grupo} rotulo={g.grupo} valor={g.total} />)}
          <p className="text-xs text-slate-400">Cada conta entra no grupo da categoria, ou no que você escrever em “agrupar em” (ex.: Carro, Apartamento).</p>
        </section>
      )}

      {renda > 0 && rendaPrivada.length === 0 && (
        <section className="card space-y-1.5" data-fatias-familia>
          <h2 className="font-semibold text-slate-700">50/30/20 das contas fixas</h2>
          <Linha rotulo={`${INFO_FATIA.necessidades.nome} (até 50%)`} valor={fatias.necessidades} extra={pct(fatias.necessidades, renda)} />
          <Linha rotulo={`${INFO_FATIA.desejos.nome} (até 30%)`} valor={fatias.desejos} extra={pct(fatias.desejos, renda)} />
          {fatias.semFatia > 0 && <Linha rotulo="Sem categoria" valor={fatias.semFatia} extra={pct(fatias.semFatia, renda)} />}
          <Linha rotulo={`Sobra para o resto e o futuro`} valor={fatias.futuro} extra={pct(fatias.futuro, renda)} />
          <p className="text-xs text-slate-400">Só as contas fixas: os gastos do dia a dia saem da sobra.</p>
        </section>
      )}
    </>
  );
}

function Linha({ rotulo, valor, extra }: { rotulo: string; valor: number; extra?: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-slate-600">{rotulo}</span>
      <span className="text-slate-800 whitespace-nowrap">{fmt(valor)}{extra && <span className="text-xs text-slate-400 ml-1">{extra}</span>}</span>
    </div>
  );
}

function Comparacao({ comparacao, privados }: { comparacao: ReturnType<typeof compararCenarios>; privados: boolean }) {
  const { mudancas, contas, sobra, porPessoa } = comparacao;
  return (
    <section className="card space-y-2 border-amber-200" data-comparacao>
      <h2 className="font-semibold text-slate-700">Em relação ao plano principal</h2>
      {/* só as diferenças: o valor de cada cenário está no resumo acima */}
      <div className="flex justify-between text-sm"><span className="text-slate-600">Contas fixas</span><span>{fmtDelta(contas)}</span></div>
      <div className="flex justify-between text-sm font-semibold"><span>Sobra da casa</span><span className={sobra < 0 ? "text-amber-700" : "text-emerald-700"}>{fmtDelta(sobra)}</span></div>
      {porPessoa.filter((p) => Math.abs(p.sobra) >= 0.01).map((p) => (
        <div key={p.chave} className="flex justify-between text-xs text-slate-600" data-delta-pessoa={p.nome}><span>sobra de {p.nome}</span><span>{fmtDelta(p.sobra)}</span></div>
      ))}
      {mudancas.length === 0 ? <p className="text-xs text-slate-400">Ainda igual ao principal: altere valores, inclua ou tire itens.</p> : (
        <ul className="text-xs space-y-1 pt-1 border-t border-slate-100">
          {mudancas.map((m, i) => (
            <li key={i} className="text-slate-600">
              <span className="font-medium text-slate-800">{m.item}</span>{" "}
              {m.tipo === "novo" ? `entrou (${fmt(m.depois!)})` : m.tipo === "removido" ? `saiu (${fmt(m.antes!)})` : `${fmt(m.antes!)} → ${fmt(m.depois!)}`}
              {m.detalhe && <span className="text-slate-400"> · {m.detalhe}</span>}
            </li>
          ))}
        </ul>
      )}
      {privados && <p className="text-xs text-slate-400">Sem os valores que outros participantes mantêm privados.</p>}
    </section>
  );
}

/** "1 renda e 2 contas" (o que é novo). */
const novosDaPrevia = (p: Pick<DaFotografia, "novos">) => {
  const rendas = p.novos.filter((i) => i.tipo === "renda").length;
  return `${plural(rendas, "renda")} e ${plural(p.novos.length - rendas, "conta")}`;
};
/** "1 renda e 1 conta ainda não estão no plano e 2 valores estão diferentes do plano" */
const resumoDaPrevia = (p: Pick<DaFotografia, "novos" | "alterados">) => [
  p.novos.length && `${novosDaPrevia(p)} ainda não ${p.novos.length === 1 ? "está" : "estão"} no plano`,
  p.alterados.length && `${plural(p.alterados.length, "valor está diferente", "valores estão diferentes")} do plano`,
].filter(Boolean).join(" e ");

/**
 * A Fotografia do mês de quem está logado entra no plano como renda e contas da
 * pessoa que ele é na casa (lib/familia.ts, trazerDaFotografia). Quem nunca trouxe
 * vê um convite em destaque; depois, só o que é novo ou mudou de valor desde a
 * última vez vira aviso (MembroPlano.vistos). Mostra antes o que entra e o que fica de fora.
 */
function DaMinhaFotografia({ fotografia, minhaPessoa, nomePessoa, cenario, catalogo, vistos, por, rendaPrivada, varios, onTrazer, onDispensar }: {
  fotografia: ItemPlanejado[] | null; minhaPessoa: string | null; nomePessoa: string; cenario: Cenario; catalogo: Catalogo;
  vistos: string[] | null; por: string; rendaPrivada: boolean; varios: boolean;
  onTrazer: (previa: DaFotografia) => void; onDispensar: (assinaturas: string[]) => void;
}) {
  const [aberto, setAberto] = useState(false);
  if (fotografia === null) return null;
  if (!minhaPessoa) {
    return <p className="text-sm text-slate-500" data-trazer-fotografia>📸 Para trazer sua Fotografia do mês, diga em “Quem participa” quem é você na casa.</p>;
  }
  if (fotografia.length === 0) {
    return <p className="text-sm text-slate-500" data-trazer-fotografia>📸 Sua Fotografia do mês está vazia: preencha na aba Fotografia do mês para trazer suas rendas e contas para cá.</p>;
  }
  const previa = trazerDaFotografia(fotografia, minhaPessoa, cenario, catalogo, por);
  const novidades = novidadesDaFotografia(previa, vistos);
  const temNovidade = novidades.novos.length + novidades.alterados.length > 0;
  const nada = previa.novos.length + previa.alterados.length === 0;

  if (!aberto) {
    if (temNovidade && vistos === null) {
      return (
        <section className="card border-blue-200 bg-blue-50/40 flex flex-wrap items-center gap-3 text-sm" data-trazer-fotografia data-novidade="primeira">
          <span className="flex-1 min-w-48">
            <strong>📸 Comece pela sua Fotografia do mês:</strong> {resumoDaPrevia(previa)}.
          </span>
          <button className="btn btn-primary text-sm" onClick={() => setAberto(true)}>Ver e trazer</button>
        </section>
      );
    }
    if (temNovidade) {
      return (
        <section className="card border-amber-200 bg-amber-50/50 flex flex-wrap items-center gap-3 text-sm" data-trazer-fotografia data-novidade="mudou">
          <span className="flex-1 min-w-48"><strong>📸 Sua Fotografia do mês mudou</strong> desde a última vez que você trouxe: {resumoDaPrevia(novidades)}.</span>
          <button className="btn btn-primary text-sm" onClick={() => setAberto(true)}>Ver e trazer</button>
          <button className="btn btn-secondary text-sm" onClick={() => onDispensar(previa.assinaturas)}>Agora não</button>
        </section>
      );
    }
    return (
      <button className="text-sm text-blue-700 hover:text-blue-900" onClick={() => setAberto(true)} data-trazer-fotografia>
        📸 Trazer da minha Fotografia do mês
      </button>
    );
  }
  return (
    <section className="card space-y-3 border-blue-200" data-trazer-fotografia data-painel>
      <span className="font-semibold text-slate-700 text-sm">Trazer da minha Fotografia do mês</span>
      <p className="text-sm text-slate-600">
        {nada ? "Nada novo para trazer: o que a Fotografia tem já está neste cenário, com os mesmos valores." : (
          <>
            {previa.novos.length > 0 && <>Entram como de <strong>{nomePessoa}</strong>: {novosDaPrevia(previa)}, como “da casa” — depois ajuste quem paga e para quem. </>}
            {previa.alterados.length > 0 && <>{previa.alterados.length === 1 ? "Um valor do plano é atualizado" : `${previa.alterados.length} valores do plano são atualizados`} com o da sua Fotografia.</>}
          </>
        )}
      </p>
      {!nada && varios && (
        <p className="text-xs text-slate-500" data-aviso-privacidade>
          🔒 {rendaPrivada ? "Sua renda fica privada: só você vê." : "Sua renda fica visível para quem participa do plano."} As contas entram como da casa e
          todos veem; marque “para: {nomePessoa}” nas que são só suas para que fiquem como contas pessoais. Mude o que os outros veem em “Quem participa”.
        </p>
      )}
      {!nada && (
        <ul className="text-xs text-slate-600 grid sm:grid-cols-2 gap-x-6 gap-y-0.5">
          {previa.novos.map((i) => (
            <li key={i.chave} className="flex justify-between gap-2">
              <span className="truncate">{i.tipo === "renda" ? "renda · " : ""}{i.descricao}</span>
              <span className="whitespace-nowrap text-slate-500">{fmt(i.valor)}{i.periodicidade === "anual" ? "/ano" : "/mês"}</span>
            </li>
          ))}
          {previa.alterados.map((a) => (
            <li key={a.chave} className="flex justify-between gap-2" data-alterado={a.descricao}>
              <span className="truncate">{a.tipo === "renda" ? "renda · " : ""}{a.descricao}</span>
              <span className="whitespace-nowrap text-amber-700">{fmt(a.antes)} → {fmt(a.valor)}</span>
            </li>
          ))}
        </ul>
      )}
      {(previa.repetidos + previa.variaveis + previa.quitadas) > 0 && (
        <p className="text-xs text-slate-400">
          Ficam de fora: {[previa.repetidos && `${plural(previa.repetidos, "item")} que já ${previa.repetidos === 1 ? "está" : "estão"} aqui`,
            previa.variaveis && `${plural(previa.variaveis, "gasto variável", "gastos variáveis")} (o dia a dia, não é conta fixa)`,
            previa.quitadas && `${plural(previa.quitadas, "parcela quitada", "parcelas quitadas")}`].filter(Boolean).join(", ")}.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button className="btn btn-secondary text-sm" onClick={() => setAberto(false)}>Cancelar</button>
        <button className="btn btn-primary text-sm" disabled={nada}
          onClick={() => { onTrazer(previa); setAberto(false); }}>Trazer</button>
      </div>
    </section>
  );
}
