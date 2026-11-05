"use client";
// Aba "Família" do Planejamento (lib/familia.ts, /api/familia): pessoas da casa,
// renda de cada uma, contas fixas com quem paga e para quem, e cenários para
// comparar alternativas. Edita tudo na tela e grava de uma vez ("Salvar").
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import CategoriaSelect from "@/components/CategoriaSelect";
import { useCategorias } from "@/components/Categorias";
import { useEspaco } from "@/components/Espaco";
import { parseValor } from "@/lib/importacao/tipos";
import {
  compararCenarios, dadosVazios, duplicarCenario, grupoDoItem, novaChave, pagaContas, resumirCenario, TIPOS_PESSOA,
  type Cenario, type DadosFamilia, type ItemFamilia, type Pessoa, type TipoPessoa,
} from "@/lib/familia";
import { INFO_FATIA } from "@/lib/fatias";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDelta = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmt(Math.abs(v))}`;
const pct = (v: number, base: number) => (base > 0 ? `${Math.round((v / base) * 100)}%` : "—");
const rotuloTipo = (t: TipoPessoa) => TIPOS_PESSOA.find((x) => x.v === t)!.rotulo;

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
  const catalogo = useCategorias();
  const somenteVer = useEspaco().papel === "ver";
  const [dados, setDados] = useState<DadosFamilia | null>(null);
  const [versao, setVersao] = useState(0);
  const [atual, setAtual] = useState("principal");
  const [sujo, setSujo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string; detalhes?: string[] } | null>(null);

  useEffect(() => {
    let ativo = true;
    fetch("/api/familia").then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!ativo) return;
      setDados(j?.dados ?? dadosVazios());
      setVersao(j?.versao ?? 0);
      setAtual((j?.dados?.cenarios ?? []).find((c: Cenario) => c.principal)?.chave ?? "principal");
    });
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
    setDados((d) => { if (!d) return d; const novo = structuredClone(d); f(novo); return novo; });
    setSujo(true);
    setAviso(null);
  }, []);

  const salvar = async () => {
    if (!dados) return;
    setSalvando(true); setAviso(null);
    try {
      const r = await fetch("/api/familia", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dados, versao }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setAviso({ tipo: "erro", texto: j.error ?? "Não foi possível salvar.", detalhes: j.detalhes }); return; }
      setVersao(j.versao); setSujo(false);
      setAviso({ tipo: "ok", texto: `Plano salvo às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.` });
    } finally { setSalvando(false); }
  };

  const cenario = dados?.cenarios.find((c) => c.chave === atual) ?? dados?.cenarios[0];
  const principal = dados?.cenarios.find((c) => c.principal);
  const resumo = useMemo(() => (dados && cenario ? resumirCenario(dados, cenario, catalogo) : null), [dados, cenario, catalogo]);
  const comparacao = useMemo(
    () => (dados && cenario && principal && !cenario.principal ? compararCenarios(dados, principal, cenario, catalogo) : null),
    [dados, cenario, principal, catalogo]);

  if (!dados || !cenario || !resumo) return <div className="flex justify-center py-20"><div className="spinner" /></div>;

  const pagadores = dados.pessoas.filter(pagaContas);
  const mudarCenario = (f: (c: Cenario) => void) => mudar((d) => f(d.cenarios.find((c) => c.chave === cenario.chave)!));
  const mudarItem = (chave: string, campos: Partial<ItemFamilia>) =>
    mudarCenario((c) => { Object.assign(c.itens.find((i) => i.chave === chave)!, campos); });
  const novoItem = (tipo: ItemFamilia["tipo"]) => mudarCenario((c) => c.itens.push({
    chave: novaChave(), tipo, descricao: "", valor: 0, periodicidade: "mensal",
    pessoa: pagadores[0]?.chave ?? "", para: null, categoria: null, grupo: null, origem: null,
  }));
  // no cenário, o que mudou em relação ao item do principal
  const doPrincipal = new Map(principal?.itens.map((i) => [i.chave, i]) ?? []);
  const mudou = (i: ItemFamilia) => !cenario.principal && (!i.origem || (doPrincipal.get(i.origem)?.valor !== i.valor));

  const desabilitado = somenteVer;
  return (
    <div className="space-y-6" data-plano-familia>
      <p className="text-sm text-slate-500">
        As contas fixas da casa, quem paga cada uma e quanto sobra para cada pessoa. Use cenários para comparar alternativas
        (ex.: escola integral × um turno) sem mexer no plano principal.
      </p>

      <BarraCenarios dados={dados} atual={cenario} desabilitado={desabilitado} sujo={sujo} salvando={salvando}
        onEscolher={setAtual} onSalvar={() => void salvar()}
        onNovo={(nome) => { const novo = duplicarCenario(dados, cenario, nome); mudar((d) => { d.cenarios.push(novo); }); setAtual(novo.chave); }}
        onRenomear={(nome) => mudarCenario((c) => { c.nome = nome; })}
        onExcluir={() => { mudar((d) => { d.cenarios = d.cenarios.filter((c) => c.chave !== cenario.chave); }); setAtual(principal!.chave); }} />

      {aviso && (
        <div className={`text-sm rounded-lg px-3 py-2 border ${aviso.tipo === "ok" ? "text-green-800 bg-green-50 border-green-200" : "text-red-700 bg-red-50 border-red-200"}`}
          role={aviso.tipo === "ok" ? "status" : "alert"}>
          {aviso.texto}
          {aviso.detalhes && <ul className="list-disc pl-5 mt-1">{aviso.detalhes.map((d) => <li key={d}>{d}</li>)}</ul>}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
        <div className="space-y-6 min-w-0">
          <Pessoas dados={dados} desabilitado={desabilitado} mudar={mudar} />

          <section className="card space-y-3" data-secao="rendas">
            <h2 className="font-semibold text-slate-700">Renda</h2>
            {cenario.itens.filter((i) => i.tipo === "renda").length === 0 && <p className="text-sm text-slate-400">Nenhuma renda ainda.</p>}
            {cenario.itens.filter((i) => i.tipo === "renda").map((i) => (
              <div key={`${cenario.chave}-${i.chave}`} className={`flex flex-wrap items-center gap-2 ${mudou(i) ? "bg-amber-50 -mx-2 px-2 py-1 rounded" : ""}`} data-item={i.descricao}>
                <select aria-label="De quem" value={i.pessoa} disabled={desabilitado} onChange={(e) => mudarItem(i.chave, { pessoa: e.target.value })} className="text-sm">
                  {pagadores.map((p) => <option key={p.chave} value={p.chave}>{p.nome}</option>)}
                </select>
                <input aria-label="Descrição da renda" placeholder="Salário, aluguel recebido…" value={i.descricao} disabled={desabilitado} maxLength={80}
                  onChange={(e) => mudarItem(i.chave, { descricao: e.target.value })} className="text-sm flex-1 min-w-32" />
                <CampoValor rotulo="Valor da renda" valor={i.valor} onChange={(valor) => mudarItem(i.chave, { valor })} />
                <Periodicidade item={i} desabilitado={desabilitado} onChange={(periodicidade) => mudarItem(i.chave, { periodicidade })} />
                {!desabilitado && <Remover onClick={() => mudarCenario((c) => { c.itens = c.itens.filter((x) => x.chave !== i.chave); })} />}
              </div>
            ))}
            {!desabilitado && (
              <button className="text-sm text-blue-700 hover:text-blue-900 inline-flex items-center gap-1" disabled={pagadores.length === 0}
                onClick={() => novoItem("renda")}><Plus size={14} /> Adicionar renda</button>
            )}
            {pagadores.length === 0 && <p className="text-xs text-slate-400">Cadastre primeiro um adulto (ou um imóvel, empresa…) que tenha renda.</p>}
          </section>

          <section className="card space-y-4" data-secao="contas">
            <h2 className="font-semibold text-slate-700">Contas fixas</h2>
            {cenario.itens.filter((i) => i.tipo === "conta").length === 0 && <p className="text-sm text-slate-400">Nenhuma conta ainda.</p>}
            {[...new Set(cenario.itens.filter((i) => i.tipo === "conta").map((i) => grupoDoItem(i, catalogo)))].map((grupo) => (
              <div key={grupo} className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-slate-400">{grupo}</h3>
                {cenario.itens.filter((i) => i.tipo === "conta" && grupoDoItem(i, catalogo) === grupo).map((i) => (
                  <div key={`${cenario.chave}-${i.chave}`} className={`space-y-1.5 border-b border-slate-100 pb-2 ${mudou(i) ? "bg-amber-50 -mx-2 px-2 pt-1 rounded" : ""}`} data-item={i.descricao}>
                    <div className="flex flex-wrap items-center gap-2">
                      <input aria-label="Descrição da conta" placeholder="Aluguel, escola, plano de saúde…" value={i.descricao} disabled={desabilitado} maxLength={80}
                        onChange={(e) => mudarItem(i.chave, { descricao: e.target.value })} className="text-sm basis-full sm:basis-auto sm:flex-1 min-w-0" />
                      <CampoValor rotulo="Valor da conta" valor={i.valor} onChange={(valor) => mudarItem(i.chave, { valor })} />
                      <Periodicidade item={i} desabilitado={desabilitado} onChange={(periodicidade) => mudarItem(i.chave, { periodicidade })} />
                      {!desabilitado && <Remover onClick={() => mudarCenario((c) => { c.itens = c.itens.filter((x) => x.chave !== i.chave); })} />}
                    </div>
                    {/* celular: grade de 2 colunas; tela larga: uma linha */}
                    <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 text-xs text-slate-500">
                      <label className="flex items-center gap-1 min-w-0">paga
                        <select aria-label="Quem paga" value={i.pessoa} disabled={desabilitado} onChange={(e) => mudarItem(i.chave, { pessoa: e.target.value })} className="text-xs py-1 min-w-0 flex-1 sm:flex-none sm:w-24">
                          {pagadores.map((p) => <option key={p.chave} value={p.chave}>{p.nome}</option>)}
                        </select>
                      </label>
                      <label className="flex items-center gap-1 min-w-0">para
                        <select aria-label="Para quem" value={i.para ?? ""} disabled={desabilitado} onChange={(e) => mudarItem(i.chave, { para: e.target.value || null })} className="text-xs py-1 min-w-0 flex-1 sm:flex-none sm:w-24">
                          <option value="">a casa</option>
                          {dados.pessoas.map((p) => <option key={p.chave} value={p.chave}>{p.nome}</option>)}
                        </select>
                      </label>
                      <CategoriaSelect value={i.categoria ?? ""} placeholder="Categoria…" className="text-xs py-1 min-w-0 w-full sm:w-44"
                        onChange={(categoria) => mudarItem(i.chave, { categoria: categoria || null })} />
                      <input aria-label="Grupo" placeholder="grupo (opcional)" value={i.grupo ?? ""} disabled={desabilitado} maxLength={40}
                        onChange={(e) => mudarItem(i.chave, { grupo: e.target.value || null })} className="text-xs py-1 min-w-0 w-full sm:w-32" />
                      {mudou(i) && <span className="badge bg-amber-100 text-amber-800 col-span-2 justify-self-start">{i.origem ? "mudou neste cenário" : "só neste cenário"}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {!desabilitado && (
              <button className="text-sm text-blue-700 hover:text-blue-900 inline-flex items-center gap-1" disabled={pagadores.length === 0}
                onClick={() => novoItem("conta")}><Plus size={14} /> Adicionar conta</button>
            )}
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4">
          <Resumo resumo={resumo} />
          {comparacao && <Comparacao comparacao={comparacao} />}
        </aside>
      </div>
    </div>
  );
}

function Periodicidade({ item, desabilitado, onChange }: { item: ItemFamilia; desabilitado: boolean; onChange: (p: ItemFamilia["periodicidade"]) => void }) {
  return (
    <select aria-label="Periodicidade" value={item.periodicidade} disabled={desabilitado} onChange={(e) => onChange(e.target.value as ItemFamilia["periodicidade"])} className="text-sm">
      <option value="mensal">por mês</option>
      <option value="anual">por ano</option>
    </select>
  );
}

function Remover({ onClick }: { onClick: () => void }) {
  return <button type="button" aria-label="Remover" title="Remover" onClick={onClick} className="text-slate-400 hover:text-red-600"><Trash2 size={15} /></button>;
}

function BarraCenarios({ dados, atual, desabilitado, sujo, salvando, onEscolher, onNovo, onRenomear, onExcluir, onSalvar }: {
  dados: DadosFamilia; atual: Cenario; desabilitado: boolean; sujo: boolean; salvando: boolean;
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
      {!desabilitado && (editando ? (
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
      ))}
      {!desabilitado && (
        <div className="ml-auto flex items-center gap-3">
          {sujo && <span className="text-xs text-amber-700">Alterações não salvas</span>}
          <button className="btn btn-primary" disabled={!sujo || salvando} onClick={onSalvar}>{salvando ? "Salvando…" : "Salvar"}</button>
        </div>
      )}
    </div>
  );
}

function Pessoas({ dados, desabilitado, mudar }: { dados: DadosFamilia; desabilitado: boolean; mudar: (f: (d: DadosFamilia) => void) => void }) {
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
            {!desabilitado && (
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
      {!desabilitado && (
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
      )}
      {erro && <p className="text-sm text-amber-700" role="alert">{erro}</p>}
      {dados.pessoas.some((p) => p.tipo === "dependente" && pagaAlgo(p)) && (
        <p className="text-sm text-amber-700">Dependente não tem renda nem paga contas: ajuste os itens marcados.</p>
      )}
    </section>
  );
}

function Resumo({ resumo }: { resumo: ReturnType<typeof resumirCenario> }) {
  const { renda, contas, sobra, porPessoa, porDependente, grupos, fatias } = resumo;
  return (
    <>
      <section className="card space-y-2" data-resumo>
        <h2 className="font-semibold text-slate-700">Por mês</h2>
        <Linha rotulo="Renda da casa" valor={renda} />
        <Linha rotulo="Contas fixas" valor={contas} />
        <div className={`flex justify-between text-sm font-semibold pt-1 border-t border-slate-100 ${sobra < 0 ? "text-amber-700" : "text-slate-800"}`} data-sobra>
          <span>{sobra < 0 ? "Falta" : "Sobra"}</span><span>{fmt(Math.abs(sobra))}</span>
        </div>
        <p className="text-xs text-slate-400">Contas anuais entram divididas por 12.</p>
      </section>

      {porPessoa.length > 0 && (
        <section className="card space-y-2" data-por-pessoa>
          <h2 className="font-semibold text-slate-700">Quem paga o quê</h2>
          {porPessoa.map((p) => (
            <div key={p.chave} className="text-sm border-b border-slate-100 last:border-0 pb-2" data-pessoa-resumo={p.nome}>
              <div className="flex justify-between font-medium text-slate-800"><span>{p.nome}</span>
                <span className={p.sobra < 0 ? "text-amber-700" : ""}>{p.sobra < 0 ? "falta " : "sobra "}{fmt(Math.abs(p.sobra))}</span></div>
              <div className="text-xs text-slate-500">
                renda {fmt(p.renda)} · paga da casa {fmt(p.pagaCasa)}{p.pagaIndividual > 0 && ` · individual ${fmt(p.pagaIndividual)}`}
              </div>
            </div>
          ))}
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
        </section>
      )}

      {renda > 0 && (
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

function Comparacao({ comparacao }: { comparacao: ReturnType<typeof compararCenarios> }) {
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
    </section>
  );
}
