"use client";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { MatrizData, MatrizGrupo, MatrizLinha } from "@/app/api/matriz/route";

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const toISO = (d: Date) => d.toISOString().slice(0, 10);

function ultimos12() {
  const h = new Date();
  const ini = new Date(h.getFullYear(), h.getMonth() - 11, 1);
  const fim = new Date(h.getFullYear(), h.getMonth() + 1, 0);
  return { i: toISO(ini), f: toISO(fim) };
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
// "12/2025" → "dez/25"; qualquer outro formato passa como veio
function rotuloMes(m: string): string {
  const [mm, aaaa] = m.split("/");
  const n = Number(mm);
  return n >= 1 && n <= 12 && aaaa?.length === 4 ? `${MESES[n - 1]}/${aaaa.slice(2)}` : m;
}

// ── Destaque: só o que foge do normal da própria linha ─────────────────────
// Fundo neutro por padrão. Um mês ganha cor quando passa da média da linha
// (a mesma média da coluna Média: meses com valor) por LIMIAR_1 ou LIMIAR_2.
// Linhas com poucos meses não têm "normal" para comparar e ficam sem cor.
const LIMIAR_1 = 1.25;
const LIMIAR_2 = 1.5;
const MIN_MESES_COM_VALOR = 3;

type Tom = "gasto" | "entrada";
const CLASSES_TOM: Record<Tom, [string, string]> = {
  gasto:   ["bg-amber-100 text-amber-900",     "bg-amber-200 text-amber-900"],
  entrada: ["bg-emerald-100 text-emerald-900", "bg-emerald-200 text-emerald-900"],
};

function classeDestaque(v: number | undefined, media: number, mesesComValor: number, tom: Tom | null): string {
  if (!tom || !v || !media || mesesComValor < MIN_MESES_COM_VALOR) return "";
  if (v >= media * LIMIAR_2) return CLASSES_TOM[tom][1];
  if (v >= media * LIMIAR_1) return CLASSES_TOM[tom][0];
  return "";
}

const pct = (l: number) => `+${Math.round((l - 1) * 100)}%`;

export default function MatrizPage() {
  const { i, f } = ultimos12();
  const [data, setData]             = useState<MatrizData | null>(null);
  const [loading, setLoading]       = useState(true);
  const [mostrarInternas, setMostrarInternas] = useState(false);
  const [tipo, setTipo]             = useState("Saída");
  const [dataInicio, setDataInicio] = useState(i);
  const [dataFim, setDataFim]       = useState(f);
  const [aberta, setAberta]         = useState<string | null>(null);
  // a lista começa só com os grupos; cada grupo abre as suas categorias
  const [gruposAbertos, setGruposAbertos] = useState<Set<string>>(new Set());

  useEffect(() => {
    let ativo = true;
    const p = new URLSearchParams();
    if (tipo)       p.set("tipo",       tipo);
    if (dataInicio) p.set("dataInicio", dataInicio);
    if (dataFim)    p.set("dataFim",    dataFim);
    async function carregar() {
      const r = await fetch(`/api/matriz?${p}`);
      const d = await r.json();
      if (ativo) {
        setData(d);
        setLoading(false);
      }
    }
    void carregar();
    return () => { ativo = false; };
  }, [tipo, dataInicio, dataFim]);

  const toggle = (cat: string) => setAberta((prev) => (prev === cat ? null : cat));
  const toggleGrupo = (g: string) => setGruposAbertos((prev) => {
    const next = new Set(prev);
    if (next.has(g)) next.delete(g); else next.add(g);
    return next;
  });
  const todosAbertos = !!data && data.grupos.length > 0 && data.grupos.every((g) => gruposAbertos.has(g.grupo));
  const tons: Tom[] = tipo === "Saída" ? ["gasto"] : tipo === "Entrada" ? ["entrada"] : ["gasto", "entrada"];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Matriz de Categorias</h1>
        <div className="flex gap-2 items-center flex-wrap">
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo">
            <option value="Saída">Saídas</option>
            <option value="Entrada">Entradas</option>
            <option value="">Todas</option>
          </select>
          <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} aria-label="Início" />
          <input type="date" value={dataFim}    onChange={(e) => setDataFim(e.target.value)} aria-label="Fim" />
          {data && data.grupos.length > 0 && (
            <button className="btn btn-secondary text-sm"
              onClick={() => setGruposAbertos(todosAbertos ? new Set() : new Set(data.grupos.map((g) => g.grupo)))}>
              {todosAbertos ? "Fechar todos" : "Abrir todos"}
            </button>
          )}
        </div>
      </div>

      {/* Legenda: uma linha */}
      <p className="flex items-center gap-x-2 gap-y-1 flex-wrap text-xs text-slate-500">
        <span>Em destaque, os meses acima da média da própria linha:</span>
        {tons.map((t) => (
          <span key={t} className="inline-flex items-center gap-1">
            {tons.length > 1 && <span>{t === "gasto" ? "gastos" : "entradas"}</span>}
            <span className={`rounded px-1.5 py-px font-medium ${CLASSES_TOM[t][0]}`}>{pct(LIMIAR_1)}</span>
            <span className={`rounded px-1.5 py-px font-medium ${CLASSES_TOM[t][1]}`}>{pct(LIMIAR_2)}</span>
          </span>
        ))}
        <span className="text-slate-400">· linhas com {MIN_MESES_COM_VALOR} meses ou mais com valor</span>
      </p>

      {loading ? (
        <div className="flex justify-center py-20"><div className="spinner" /></div>
      ) : !data || (data.linhas.length === 0 && data.internas.length === 0) ? (
        <div className="card text-center text-slate-500 py-12">Nenhum dado encontrado para o período.</div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            {/* display/overflow inline: no celular o globals.css transforma <table> em bloco com rolagem
                própria, e a coluna fixa passaria a grudar na tabela em vez de na div que rola */}
            <table style={{ display: "table", overflow: "visible", borderCollapse: "separate", borderSpacing: 0, width: "max-content", minWidth: "100%" }}>
              <thead>
                <tr>
                  <th className={`${COL_CAT} bg-slate-50 z-[3]`} style={{ ...thBase, textAlign: "left" }}>Categoria</th>
                  <th className={`${COL_MEDIA} bg-slate-50 md:z-[3]`} style={thBase}>Média</th>
                  <th className={`${COL_TOTAL} bg-slate-50 md:z-[3]`} style={thBase}>Total</th>
                  {data.meses.map((m) => (
                    <th key={m} title={m} style={thBase}>{rotuloMes(m)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.grupos.map((g) => (
                  <LinhaGrupo
                    key={g.grupo}
                    grupo={g}
                    meses={data.meses}
                    aberto={gruposAbertos.has(g.grupo)}
                    onToggle={() => toggleGrupo(g.grupo)}
                    categoriaAberta={aberta}
                    onToggleCategoria={toggle}
                  />
                ))}
                {data.internas.length > 0 && (
                  <tr>
                    <td colSpan={data.meses.length + 3} style={{ padding: 0, borderTop: "1px solid #e2e8f0" }}>
                      {/* sticky: continua visível com a tabela rolada para o lado */}
                      <button onClick={() => setMostrarInternas((v) => !v)} aria-expanded={mostrarInternas}
                        className="sticky left-0 flex items-center gap-1.5 text-left px-4 py-2.5 text-xs text-slate-500 hover:text-slate-700"
                        title="Pagamento de fatura, transferências entre suas contas, aplicações, compra e venda de bens: ficam fora das contas, como no dashboard">
                        <Seta aberta={mostrarInternas} />
                        Movimentações internas e aplicações — não são renda nem gasto ({data.internas.length})
                      </button>
                    </td>
                  </tr>
                )}
                {mostrarInternas && data.internas.map((linha) => (
                  <LinhaCategoria
                    key={`interna|${linha.categoria}`}
                    linha={linha}
                    meses={data.meses}
                    aberta={aberta === `interna|${linha.categoria}`}
                    onToggle={() => toggle(`interna|${linha.categoria}`)}
                    tom={null}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Seta({ aberta }: { aberta: boolean }) {
  return (
    <ChevronRight size={14} aria-hidden
      className={`shrink-0 text-slate-400 transition-transform ${aberta ? "rotate-90" : ""}`} />
  );
}

const soma = (totais: Record<string, number>, meses: string[]) =>
  meses.reduce((a, m) => a + (totais[m] || 0), 0);
const mesesComValor = (totais: Record<string, number>, meses: string[]) =>
  meses.filter((m) => (totais[m] || 0) > 0).length;

// ── Linha com totais por mês (grupo ou categoria), clicável para abrir ──────

function LinhaTotais({ rotulo, totais, media, meses, aberta, onToggle, nivel, tom, grupo = false }: {
  rotulo: string;
  totais: Record<string, number>;
  media: number;
  meses: string[];
  aberta: boolean;
  onToggle: () => void;
  nivel: 0 | 1;
  tom: Tom | null;
  grupo?: boolean;
}) {
  const n = mesesComValor(totais, meses);
  const total = soma(totais, meses);
  // a célula fixa precisa de fundo próprio: por baixo dela passam os valores ao rolar
  const fundoFixo = aberta ? "bg-slate-50" : "bg-white group-hover:bg-slate-50";
  const peso = grupo ? 600 : 400;
  return (
    <tr onClick={onToggle} className={`group cursor-pointer ${aberta ? "bg-slate-50" : ""}`} aria-expanded={aberta}>
      <td className={`${COL_CAT} ${fundoFixo} text-slate-800`}
        style={{ ...tdBase, textAlign: "left", fontWeight: peso, paddingLeft: 12 + nivel * 22 }}>
        <span className="flex items-center gap-1.5 min-w-0">
          <Seta aberta={aberta} />
          <span className="truncate" title={rotulo}>{rotulo}</span>
        </span>
      </td>
      <td className={`${COL_MEDIA} ${fundoFixo} text-slate-800`} style={{ ...tdBase, fontWeight: peso }}>
        {media ? fmt(media) : ""}
      </td>
      <td className={`${COL_TOTAL} ${fundoFixo} text-slate-500`} style={{ ...tdBase, fontWeight: peso }}>
        {total ? fmt(total) : ""}
      </td>
      {meses.map((m) => {
        const v = totais[m];
        return (
          <td key={m} className={`${classeDestaque(v, media, n, tom) || "text-slate-700"}`}
            style={{ ...tdBase, fontWeight: grupo ? 500 : 400 }}>
            {v ? fmt(v) : ""}
          </td>
        );
      })}
    </tr>
  );
}

function LinhaGrupo({ grupo, meses, aberto, onToggle, categoriaAberta, onToggleCategoria }: {
  grupo: MatrizGrupo;
  meses: string[];
  aberto: boolean;
  onToggle: () => void;
  categoriaAberta: string | null;
  onToggleCategoria: (categoria: string) => void;
}) {
  const tom: Tom = grupo.grupo === "Entradas" ? "entrada" : "gasto";
  return (
    <>
      <LinhaTotais rotulo={grupo.grupo} totais={grupo.totais} media={grupo.media} meses={meses}
        aberta={aberto} onToggle={onToggle} nivel={0} tom={tom} grupo />
      {aberto && grupo.categorias.map((linha) => (
        <LinhaCategoria
          key={linha.categoria}
          linha={linha}
          meses={meses}
          aberta={categoriaAberta === linha.categoria}
          onToggle={() => onToggleCategoria(linha.categoria)}
          nivel={1}
          tom={tom}
        />
      ))}
    </>
  );
}

// ── Linha de categoria + sub-linhas (uma por descrição) ────────────────────

function LinhaCategoria({ linha, meses, aberta, onToggle, tom, nivel = 0 }: {
  linha: MatrizLinha;
  meses: string[];
  aberta: boolean;
  onToggle: () => void;
  tom: Tom | null;
  nivel?: 0 | 1;
}) {
  return (
    <>
      <LinhaTotais rotulo={linha.categoria} totais={linha.totais} media={linha.media} meses={meses}
        aberta={aberta} onToggle={onToggle} nivel={nivel} tom={tom} />

      {aberta && linha.descricoes.map((d) => {
        const n = mesesComValor(d.porMes, meses);
        const total = soma(d.porMes, meses);
        const media = n ? total / n : 0; // a mesma regra da API: média dos meses com valor
        return (
          <tr key={d.descricao} className="bg-slate-50">
            <td className={`${COL_CAT} bg-slate-50 text-slate-500`}
              style={{ ...tdBase, ...tdDesc, textAlign: "left", paddingLeft: 34 + nivel * 22 }}>
              <span className="block truncate" title={d.descricao}>{d.descricao}</span>
            </td>
            <td className={`${COL_MEDIA} bg-slate-50 text-slate-600`} style={{ ...tdBase, ...tdDesc }}>
              {media ? fmt(media) : ""}
            </td>
            <td className={`${COL_TOTAL} bg-slate-50 text-slate-500`} style={{ ...tdBase, ...tdDesc }}>
              {total ? fmt(total) : ""}
            </td>
            {meses.map((m) => {
              const v = d.porMes[m];
              return (
                <td key={m} className={classeDestaque(v, media, n, tom) || "text-slate-600"}
                  style={{ ...tdBase, ...tdDesc }}>
                  {v ? fmt(v) : ""}
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

// ── Colunas fixas e estilos ────────────────────────────────────────────────
// Categoria fica sempre presa à esquerda; Média e Total também, a partir do
// desktop (no celular, três colunas fixas tomariam a tela inteira).
const SOMBRA_FIXA = "shadow-[4px_0_6px_-4px_rgba(15,23,42,0.18)]";
const COL_CAT   = `sticky left-0 z-[1] w-[160px] min-w-[160px] max-w-[160px] md:w-[240px] md:min-w-[240px] md:max-w-[240px] ${SOMBRA_FIXA} md:shadow-none`;
const COL_MEDIA = "md:sticky md:left-[240px] md:z-[1] min-w-[120px]";
// classes escritas por extenso: o Tailwind só gera o que encontra literal no código
const COL_TOTAL = "md:sticky md:left-[360px] md:z-[1] min-w-[130px] md:shadow-[4px_0_6px_-4px_rgba(15,23,42,0.18)] border-r border-slate-200";

// Estilos inline: as regras globais de table/th/td (globals.css) ficam fora das
// camadas do Tailwind e venceriam as classes de padding e tamanho.
const thBase: React.CSSProperties = {
  textAlign: "right",
  fontSize: 11, fontWeight: 600,
  letterSpacing: "0.05em", textTransform: "uppercase",
  color: "#64748b",
  padding: "10px 14px",
  borderBottom: "1px solid #e2e8f0",
  whiteSpace: "nowrap",
};

const tdBase: React.CSSProperties = {
  textAlign: "right",
  fontSize: 13,
  padding: "9px 14px",
  borderBottom: "1px solid #f1f5f9",
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
};

const tdDesc: React.CSSProperties = { fontSize: 12, paddingTop: 7, paddingBottom: 7 };
