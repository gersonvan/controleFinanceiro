"use client";
// Wizard da Fotografia do mês: entradas → fixos → variáveis → sazonais →
// parcelas → resumo. Usado no onboarding (com "Fazer depois") e na página
// Planejamento (edição a qualquer momento). Sempre salva o conjunto inteiro.
import { useEffect, useMemo, useState } from "react";
import CategoriaSelect from "@/components/CategoriaSelect";
import {
  totaisMensais, valorMensal,
  type Grupo, type ItemPlanejado, type Periodicidade,
} from "@/lib/planejamento";
import { CATEGORIA_LIVRE, PERIODICIDADE_PADRAO, SUGESTOES } from "@/lib/planejamento-sugestoes";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Campos numéricos ficam como texto enquanto o usuário digita ("12,5").
interface ItemLocal {
  key: number;
  grupo: Grupo;
  descricao: string;
  categoria: string;
  valor: string;
  periodicidade: Periodicidade;
  parcelaAtual: string;
  parcelaTotal: string;
  livre: boolean; // criado via "Outro…": mostra seletor de categoria
}

const ETAPAS: { grupo: Grupo | "resumo"; rotulo: string; titulo: string; ajuda: string }[] = [
  { grupo: "entrada",  rotulo: "Entradas",  titulo: "O que entra por mês?",
    ajuda: "Salário, renda extra, vale… Use o valor líquido, o que de fato cai na conta." },
  { grupo: "fixo",     rotulo: "Fixos",     titulo: "Gastos fixos",
    ajuda: "Contas que vêm todo mês com valor parecido. Se não souber de cabeça, uma estimativa já serve." },
  { grupo: "variavel", rotulo: "Variáveis", titulo: "Gastos variáveis",
    ajuda: "O que muda de mês para mês. Se for mais fácil pensar por semana, troque a unidade." },
  { grupo: "sazonal",  rotulo: "Sazonais",  titulo: "Gastos sazonais",
    ajuda: "Vêm uma ou poucas vezes por ano: IPVA, seguro, viagem, dentista. Informe o valor do ano — dividimos por 12." },
  { grupo: "parcela",  rotulo: "Parcelas",  titulo: "Parcelas em andamento",
    ajuda: "Compras parceladas e dívidas. Diga o valor da parcela e em qual você está: assim sabemos quando termina." },
  { grupo: "resumo",   rotulo: "Resumo",    titulo: "Sua fotografia do mês",
    ajuda: "Entradas menos saídas menos a margem que você quer guardar. É o ponto de partida — pode voltar e ajustar quando quiser." },
];

let proximaKey = 1;

function numero(s: string): number {
  const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function paraItem(l: ItemLocal): ItemPlanejado | null {
  const valor = numero(l.valor);
  if (!l.descricao.trim() || valor <= 0) return null;
  if (l.grupo === "parcela") {
    const atual = parseInt(l.parcelaAtual), total = parseInt(l.parcelaTotal);
    if (!atual || !total || atual > total) return null;
    return { grupo: l.grupo, descricao: l.descricao.trim(), categoria: l.categoria, valor, periodicidade: "mensal", parcelaAtual: atual, parcelaTotal: total };
  }
  return { grupo: l.grupo, descricao: l.descricao.trim(), categoria: l.categoria, valor, periodicidade: l.periodicidade };
}

function deServidor(i: ItemPlanejado): ItemLocal {
  const sugerido = SUGESTOES[i.grupo].some((s) => s.nome === i.descricao);
  return {
    key: proximaKey++,
    grupo: i.grupo,
    descricao: i.descricao,
    categoria: i.categoria,
    valor: String(i.valor).replace(".", ","),
    periodicidade: i.periodicidade,
    parcelaAtual: i.parcelaAtual ? String(i.parcelaAtual) : "",
    parcelaTotal: i.parcelaTotal ? String(i.parcelaTotal) : "",
    livre: !sugerido,
  };
}

interface Props {
  modo: "onboarding" | "pagina";
  onConcluir?: () => void;
  onDepois?: () => void;
}

export default function FotografiaWizard({ modo, onConcluir, onDepois }: Props) {
  const [itens, setItens] = useState<ItemLocal[]>([]);
  const [margem, setMargem] = useState("20");
  const [etapa, setEtapa] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      const r = await fetch("/api/planejamento");
      if (!r.ok) { if (ativo) setCarregando(false); return; }
      const json = await r.json();
      if (!ativo) return;
      setItens((json.itens as ItemPlanejado[]).map(deServidor));
      setMargem(String(json.margemPercentual ?? 20));
      setCarregando(false);
    }
    void carregar();
    return () => { ativo = false; };
  }, []);

  const atual = ETAPAS[etapa];
  const itensValidos = useMemo(() => itens.map(paraItem).filter((i): i is ItemPlanejado => i !== null), [itens]);
  const totais = useMemo(() => totaisMensais(itensValidos, numero(margem)), [itensValidos, margem]);

  const doGrupo = (g: Grupo) => itens.filter((i) => i.grupo === g);
  const totalGrupo = (g: Grupo) =>
    doGrupo(g).map(paraItem).filter((i): i is ItemPlanejado => i !== null).reduce((acc, i) => acc + valorMensal(i), 0);

  const atualizar = (key: number, mudanca: Partial<ItemLocal>) =>
    setItens((prev) => prev.map((i) => (i.key === key ? { ...i, ...mudanca } : i)));
  const remover = (key: number) => setItens((prev) => prev.filter((i) => i.key !== key));

  const adicionarSugestao = (grupo: Grupo, nome: string, categoria: string) => {
    const existente = doGrupo(grupo).find((i) => i.descricao === nome);
    if (existente) { remover(existente.key); return; }
    setItens((prev) => [...prev, {
      key: proximaKey++, grupo, descricao: nome, categoria, valor: "",
      periodicidade: PERIODICIDADE_PADRAO[grupo], parcelaAtual: "", parcelaTotal: "", livre: false,
    }]);
  };

  const adicionarLivre = (grupo: Grupo) =>
    setItens((prev) => [...prev, {
      key: proximaKey++, grupo, descricao: "", categoria: CATEGORIA_LIVRE[grupo], valor: "",
      periodicidade: PERIODICIDADE_PADRAO[grupo], parcelaAtual: "", parcelaTotal: "", livre: true,
    }]);

  const salvar = async (concluir: boolean) => {
    setSalvando(true);
    setErro("");
    const r = await fetch("/api/planejamento", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itens: itensValidos, margemPercentual: numero(margem), concluir }),
    });
    setSalvando(false);
    if (!r.ok) {
      const json = await r.json().catch(() => ({}));
      setErro(json.error ?? "Não foi possível salvar. Tente de novo.");
      return;
    }
    onConcluir?.();
  };

  if (carregando) {
    return <div className="card flex items-center gap-3 text-slate-500"><span className="spinner" /> Carregando…</div>;
  }

  return (
    <div className="card p-0 overflow-hidden">
      {/* Sub-etapas */}
      <div className="flex border-b border-slate-200 bg-slate-50 text-xs overflow-x-auto">
        {ETAPAS.map((e, i) => (
          <button
            key={e.grupo}
            onClick={() => setEtapa(i)}
            className={`flex-1 shrink-0 py-2.5 px-2 font-medium transition-colors whitespace-nowrap ${
              i === etapa ? "text-blue-700 border-b-2 border-blue-600 bg-white"
              : i < etapa ? "text-emerald-600" : "text-slate-400"
            }`}
          >
            {i < etapa ? "✓ " : ""}{e.rotulo}
          </button>
        ))}
      </div>

      <div className="p-6 sm:p-8">
        <h2 className="text-xl font-bold text-slate-800">{atual.titulo}</h2>
        <p className="text-sm text-slate-500 mt-1 mb-5">{atual.ajuda}</p>

        {atual.grupo !== "resumo" ? (
          <EtapaGrupo
            grupo={atual.grupo}
            itens={doGrupo(atual.grupo)}
            total={totalGrupo(atual.grupo)}
            onSugestao={(nome, cat) => adicionarSugestao(atual.grupo as Grupo, nome, cat)}
            onLivre={() => adicionarLivre(atual.grupo as Grupo)}
            onAtualizar={atualizar}
            onRemover={remover}
          />
        ) : (
          <Resumo totais={totais} margem={margem} onMargem={setMargem} />
        )}

        {erro && <p className="text-sm text-red-600 mt-4">{erro}</p>}

        {/* Navegação */}
        <div className="flex items-center justify-between mt-8 gap-3 flex-wrap">
          <div className="flex gap-2">
            {etapa > 0 && (
              <button onClick={() => setEtapa(etapa - 1)} className="btn btn-secondary">← Voltar</button>
            )}
            {modo === "onboarding" && onDepois && (
              <button onClick={onDepois} className="text-sm text-slate-500 hover:text-slate-700 px-3 py-2">
                Fazer depois
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {modo === "pagina" && atual.grupo !== "resumo" && (
              <button onClick={() => salvar(false)} disabled={salvando} className="btn btn-secondary">
                {salvando ? "Salvando…" : "Salvar"}
              </button>
            )}
            {atual.grupo !== "resumo" ? (
              <button onClick={() => setEtapa(etapa + 1)} className="btn btn-primary">Próximo →</button>
            ) : (
              <button onClick={() => salvar(true)} disabled={salvando} className="btn btn-primary">
                {salvando ? "Salvando…" : modo === "onboarding" ? "Concluir fotografia →" : "Salvar fotografia"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Etapa de um grupo: chips + linhas ────────────────────────────────────────

function EtapaGrupo({ grupo, itens, total, onSugestao, onLivre, onAtualizar, onRemover }: {
  grupo: Grupo;
  itens: ItemLocal[];
  total: number;
  onSugestao: (nome: string, categoria: string) => void;
  onLivre: () => void;
  onAtualizar: (key: number, mudanca: Partial<ItemLocal>) => void;
  onRemover: (key: number) => void;
}) {
  const sugestoes = SUGESTOES[grupo];
  const nomesAdicionados = new Set(itens.map((i) => i.descricao));

  return (
    <div className="space-y-5">
      {sugestoes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {sugestoes.map((s) => {
            const ativo = nomesAdicionados.has(s.nome);
            return (
              <button
                key={s.nome}
                onClick={() => onSugestao(s.nome, s.categoria)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  ativo ? "bg-blue-50 border-blue-300 text-blue-700 font-medium"
                        : "bg-white border-slate-300 text-slate-600 hover:border-slate-400"
                }`}
              >
                <span className="inline-block w-3 text-center">{ativo ? "✓" : "+"}</span> {s.nome}
              </button>
            );
          })}
          <button onClick={onLivre} className="px-3 py-1.5 rounded-full text-sm border border-dashed border-slate-400 text-slate-600 hover:bg-slate-50">
            + Outro…
          </button>
        </div>
      )}

      {itens.length === 0 ? (
        <div className="text-center text-sm text-slate-400 py-6 border border-dashed border-slate-200 rounded-xl">
          {grupo === "parcela"
            ? <>Nenhuma parcela. <button onClick={onLivre} className="text-blue-600 hover:underline">Adicionar uma</button> ou pule esta etapa.</>
            : "Toque nas sugestões acima ou adicione um item."}
        </div>
      ) : (
        <div className="space-y-2">
          {itens.map((item) => (
            <Linha key={item.key} item={item} onAtualizar={(m) => onAtualizar(item.key, m)} onRemover={() => onRemover(item.key)} />
          ))}
        </div>
      )}

      {grupo === "parcela" && itens.length > 0 && (
        <button onClick={onLivre} className="text-sm text-blue-600 hover:underline">+ Adicionar outra parcela</button>
      )}

      <div className="flex justify-between text-sm pt-3 border-t border-slate-100">
        <span className="text-slate-500">Total {grupo === "sazonal" ? "por mês (anual ÷ 12)" : "por mês"}</span>
        <span className="font-semibold text-slate-800">{fmt(total)}</span>
      </div>
    </div>
  );
}

function Linha({ item, onAtualizar, onRemover }: {
  item: ItemLocal;
  onAtualizar: (mudanca: Partial<ItemLocal>) => void;
  onRemover: () => void;
}) {
  const unidade = item.grupo === "sazonal" ? "/ano" : item.periodicidade === "semanal" ? "/semana" : "/mês";

  return (
    <div className="rounded-lg border border-slate-200 p-3 space-y-2 bg-white">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={item.descricao}
          onChange={(e) => onAtualizar({ descricao: e.target.value })}
          placeholder={item.grupo === "parcela" ? "Ex.: Geladeira" : "Nome"}
          className={`flex-1 ${item.grupo === "parcela" ? "min-w-28" : "min-w-36"}`}
          autoFocus={item.livre && !item.descricao}
        />
        <div className="flex items-center gap-1">
          <span className="text-sm text-slate-500">R$</span>
          <input
            type="text"
            inputMode="decimal"
            value={item.valor}
            onChange={(e) => onAtualizar({ valor: e.target.value })}
            placeholder="0,00"
            className="w-28 text-right"
            autoFocus={!item.livre && !item.valor}
          />
          {item.grupo === "variavel" ? (
            <select
              value={item.periodicidade}
              onChange={(e) => onAtualizar({ periodicidade: e.target.value as Periodicidade })}
              className="text-sm"
            >
              <option value="mensal">/mês</option>
              <option value="semanal">/semana</option>
            </select>
          ) : (
            <span className="text-sm text-slate-500 w-14">{unidade}</span>
          )}
        </div>
        {item.grupo === "parcela" && (
          <div className="flex items-center gap-1 text-sm text-slate-600 whitespace-nowrap">
            parcela
            <input type="number" min={1} value={item.parcelaAtual} onChange={(e) => onAtualizar({ parcelaAtual: e.target.value })} className="w-12 text-center" placeholder="1" />
            de
            <input type="number" min={1} value={item.parcelaTotal} onChange={(e) => onAtualizar({ parcelaTotal: e.target.value })} className="w-12 text-center" placeholder="12" />
          </div>
        )}
        <button onClick={onRemover} className="text-slate-400 hover:text-red-500 px-1 ml-auto" title="Remover">×</button>
      </div>
      {item.livre && (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          Categoria:
          <CategoriaSelect value={item.categoria} onChange={(categoria) => onAtualizar({ categoria })} className="text-xs py-1" />
        </div>
      )}
      {item.grupo === "sazonal" && numero(item.valor) > 0 && (
        <div className="text-xs text-slate-400">≈ {fmt(numero(item.valor) / 12)} por mês</div>
      )}
      {item.grupo === "variavel" && item.periodicidade === "semanal" && numero(item.valor) > 0 && (
        <div className="text-xs text-slate-400">≈ {fmt(numero(item.valor) * 52 / 12)} por mês</div>
      )}
    </div>
  );
}

// ─── Resumo ──────────────────────────────────────────────────────────────────

function Resumo({ totais, margem, onMargem }: {
  totais: ReturnType<typeof totaisMensais>;
  margem: string;
  onMargem: (v: string) => void;
}) {
  const linhas: [string, number, string?][] = [
    ["Entradas", totais.entradas, "valor-positivo"],
    ["Gastos fixos", totais.fixos],
    ["Gastos variáveis", totais.variaveis],
    ["Sazonais (÷ 12)", totais.sazonais],
    ["Parcelas", totais.parcelas],
  ];
  const semMargem = totais.entradas - totais.saidas;

  let leitura: string;
  if (totais.entradas === 0) {
    leitura = "Informe suas entradas para ver quanto sobra.";
  } else if (totais.sobra >= 0) {
    leitura = `Sobram ${fmt(totais.sobra)} por mês depois de guardar a margem. Esse é o dinheiro livre para objetivos.`;
  } else if (semMargem >= 0) {
    leitura = `As contas fecham, mas não sobra a margem de ${numero(margem)}% (${fmt(totais.margem)}). Vale olhar variáveis e parcelas.`;
  } else {
    leitura = `As saídas passam das entradas em ${fmt(-semMargem)}. Esse é o ponto de atenção: onde cortar ou como aumentar as entradas.`;
  }

  return (
    <div className="space-y-4">
      <table className="text-sm">
        <tbody>
          {linhas.map(([rotulo, valor, classe]) => (
            <tr key={rotulo} className="border-b border-slate-100">
              <td className="py-2 text-slate-600">{rotulo}</td>
              <td className={`py-2 text-right font-medium ${classe ?? "text-slate-800"}`}>{fmt(valor)}</td>
            </tr>
          ))}
          <tr className="border-b border-slate-200">
            <td className="py-2 text-slate-700 font-medium">Total de saídas</td>
            <td className="py-2 text-right valor-negativo">{fmt(totais.saidas)}</td>
          </tr>
          <tr className="border-b border-slate-100">
            <td className="py-2 text-slate-600">
              <span className="flex items-center gap-2">
                Margem para guardar
                <input
                  type="number" min={0} max={100} value={margem}
                  onChange={(e) => onMargem(e.target.value)}
                  className="w-16 text-center py-1"
                />
                % das entradas
              </span>
            </td>
            <td className="py-2 text-right font-medium text-slate-800">{fmt(totais.margem)}</td>
          </tr>
          <tr>
            <td className="py-3 text-slate-800 font-semibold">{totais.sobra >= 0 ? "Sobra" : "Falta"}</td>
            <td className={`py-3 text-right text-lg ${totais.sobra >= 0 ? "valor-positivo" : "valor-negativo"}`}>
              {fmt(Math.abs(totais.sobra))}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3">{leitura}</p>
    </div>
  );
}
