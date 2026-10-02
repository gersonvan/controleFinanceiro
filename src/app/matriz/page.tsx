"use client";
import { useEffect, useState } from "react";
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

function heatBg(valor: number, max: number): string {
  if (!valor || !max) return "";
  const r = valor / max;
  if (r < 0.25) return "#EAF3DE";
  if (r < 0.5)  return "#C0DD97";
  if (r < 0.75) return "#97C459";
  return "#639922";
}
function heatColor(valor: number, max: number): string {
  if (!valor || !max) return "var(--color-text-primary)";
  const r = valor / max;
  if (r < 0.25) return "#3B6D11";
  if (r < 0.5)  return "#27500A";
  return "#173404";
}

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Matriz de Categorias</h1>
        <div className="flex gap-2 items-center flex-wrap">
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="Saída">Saídas</option>
            <option value="Entrada">Entradas</option>
            <option value="">Todas</option>
          </select>
          <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
          <input type="date" value={dataFim}    onChange={(e) => setDataFim(e.target.value)} />
          {data && data.grupos.length > 0 && (
            <button className="btn btn-secondary text-sm"
              onClick={() => setGruposAbertos(todosAbertos ? new Set() : new Set(data.grupos.map((g) => g.grupo)))}>
              {todosAbertos ? "Fechar todos" : "Abrir todos"}
            </button>
          )}
        </div>
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-x-4 gap-y-2 flex-wrap text-xs text-slate-500">
        <span>Intensidade relativa ao maior valor da linha:</span>
        {[["#EAF3DE","#3B6D11","baixo"],["#C0DD97","#27500A","médio"],["#97C459","#173404","alto"],["#639922","#173404","máximo"]].map(([bg, color, label]) => (
          <span key={label} className="flex items-center gap-1">
            <span style={{ background: bg, color, fontSize: 11, padding: "1px 7px", borderRadius: 4, fontWeight: 500 }}>{label}</span>
          </span>
        ))}
        <span className="flex items-center gap-1 text-slate-300">
          <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 4, border: "1px dashed #cbd5e1", color: "#94a3b8" }}>ausente</span>
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="spinner" /></div>
      ) : !data || (data.linhas.length === 0 && data.internas.length === 0) ? (
        <div className="card text-center text-slate-400 py-12">Nenhum dado encontrado para o período.</div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table style={{ borderCollapse: "collapse", width: "max-content", minWidth: "100%" }}>
              <thead>
                <tr style={{ borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                  <th style={thCatStyle}>Categoria</th>
                  {data.meses.map((m) => (
                    <th key={m} style={thMesStyle}>{m}</th>
                  ))}
                  <th style={{ ...thMesStyle, borderLeft: "2px solid var(--color-border-secondary)" }}>Média</th>
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
                    <td colSpan={data.meses.length + 2} style={{ padding: 0, borderTop: "2px solid var(--color-border-secondary)" }}>
                      {/* sticky: continua visível com a tabela rolada para o lado */}
                      <button onClick={() => setMostrarInternas((v) => !v)}
                        className="sticky left-0 text-left px-4 py-2 text-xs text-slate-500 hover:text-slate-700"
                        title="Pagamento de fatura, transferências entre suas contas, aplicações, compra e venda de bens: ficam fora das contas, como no dashboard">
                        <span className={`inline-block mr-1.5 transition-transform ${mostrarInternas ? "rotate-90" : ""}`}>▶</span>
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

// ── Linha com totais por mês (grupo ou categoria), clicável para abrir ──────

function LinhaTotais({ rotulo, totais, media, meses, aberta, onToggle, nivel, grupo = false }: {
  rotulo: string;
  totais: Record<string, number>;
  media: number;
  meses: string[];
  aberta: boolean;
  onToggle: () => void;
  nivel: 0 | 1;
  grupo?: boolean;
}) {
  const max = Math.max(...meses.map((m) => totais[m] || 0));
  return (
    <tr
      onClick={onToggle}
      style={{
        cursor: "pointer",
        borderBottom: "0.5px solid var(--color-border-tertiary)",
        background: aberta ? "var(--color-background-secondary)" : undefined,
      }}
      className="hover:bg-slate-50/80 transition-colors"
      aria-expanded={aberta}
    >
      <td style={{
        ...tdCatStyle, paddingLeft: 14 + nivel * 20, fontWeight: grupo ? 600 : nivel ? 400 : 500,
        // a célula fixa precisa do mesmo fundo da linha: por baixo dela passam os valores ao rolar
        background: aberta ? "var(--color-background-secondary)" : "var(--color-background-primary)",
      }}>
        <span style={{
          display: "inline-block", fontSize: 10, marginRight: 6,
          transform: aberta ? "rotate(90deg)" : "none",
          transition: "transform 0.15s", color: "var(--color-text-secondary)",
        }}>▶</span>
        {rotulo}
      </td>
      {meses.map((m) => {
        const v = totais[m];
        return (
          <td key={m} style={{
            ...tdValStyle,
            fontWeight: grupo ? 600 : undefined,
            background: v ? heatBg(v, max) : undefined,
            color: v ? heatColor(v, max) : "var(--color-text-tertiary)",
            fontStyle: v ? "normal" : "italic",
          }}>
            {v ? fmt(v) : "—"}
          </td>
        );
      })}
      <td style={{ ...tdMediaStyle, fontWeight: grupo ? 600 : 500 }}>
        {fmt(media)}
      </td>
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
  return (
    <>
      <LinhaTotais rotulo={grupo.grupo} totais={grupo.totais} media={grupo.media} meses={meses}
        aberta={aberto} onToggle={onToggle} nivel={0} grupo />
      {aberto && grupo.categorias.map((linha) => (
        <LinhaCategoria
          key={linha.categoria}
          linha={linha}
          meses={meses}
          aberta={categoriaAberta === linha.categoria}
          onToggle={() => onToggleCategoria(linha.categoria)}
          nivel={1}
        />
      ))}
    </>
  );
}

// ── Linha de categoria + sub-linhas expansíveis ────────────────────────────

function LinhaCategoria({ linha, meses, aberta, onToggle, nivel = 0 }: {
  linha: MatrizLinha;
  meses: string[];
  aberta: boolean;
  onToggle: () => void;
  nivel?: 0 | 1;
}) {
  return (
    <>
      <LinhaTotais rotulo={linha.categoria} totais={linha.totais} media={linha.media} meses={meses}
        aberta={aberta} onToggle={onToggle} nivel={nivel} />

      {/* Sub-linhas: uma por descrição única */}
      {aberta && linha.descricoes.map((d, idx) => {
        const descMax = Math.max(...meses.map((m) => d.porMes[m] || 0));
        const isLast  = idx === linha.descricoes.length - 1;
        return (
          <tr key={d.descricao} style={{
            borderBottom: isLast
              ? "2px solid var(--color-border-secondary)"
              : "0.5px solid var(--color-border-tertiary)",
            background: "var(--color-background-secondary)",
          }}>
            <td style={{
              ...tdCatStyle,
              background: "var(--color-background-secondary)",
              paddingLeft: 32 + nivel * 20,
              fontSize: 12,
              fontWeight: 400,
              color: "var(--color-text-secondary)",
              maxWidth: 240,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }} title={d.descricao}>
              {d.descricao}
            </td>
            {meses.map((m) => {
              const v = d.porMes[m];
              return (
                <td key={m} style={{
                  ...tdValStyle,
                  fontSize: 12,
                  background: v ? heatBg(v, descMax) + "99" : undefined,
                  color: v ? heatColor(v, descMax) : "var(--color-text-tertiary)",
                  fontStyle: v ? "normal" : "italic",
                  opacity: v ? 1 : 0.5,
                }}>
                  {v ? fmt(v) : "—"}
                </td>
              );
            })}
            <td style={{ ...tdMediaStyle, fontSize: 12, color: "var(--color-text-secondary)" }}>
              {(() => {
                const vals = Object.values(d.porMes).filter((v) => v > 0);
                const med  = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
                return med ? fmt(med) : "—";
              })()}
            </td>
          </tr>
        );
      })}
    </>
  );
}

// ── Estilos inline reutilizáveis ───────────────────────────────────────────

const thCatStyle: React.CSSProperties = {
  position: "sticky", left: 0, zIndex: 2,
  background: "var(--color-background-secondary)",
  boxShadow: "4px 0 6px -4px rgba(15, 23, 42, 0.18)",
  minWidth: 200, textAlign: "left",
  fontSize: 11, fontWeight: 500,
  color: "var(--color-text-secondary)",
  textTransform: "uppercase", letterSpacing: "0.04em",
  padding: "9px 14px",
  borderRight: "0.5px solid var(--color-border-tertiary)",
};

const thMesStyle: React.CSSProperties = {
  minWidth: 100, textAlign: "right",
  fontSize: 11, fontWeight: 500,
  color: "var(--color-text-secondary)",
  padding: "9px 10px",
  borderLeft: "0.5px solid var(--color-border-tertiary)",
  whiteSpace: "nowrap",
};

const sombraColunaFixa = "4px 0 6px -4px rgba(15, 23, 42, 0.18)"; // separa a coluna fixa dos valores que rolam

const tdCatStyle: React.CSSProperties = {
  position: "sticky", left: 0, zIndex: 1,
  background: "var(--color-background-primary)",
  boxShadow: sombraColunaFixa,
  fontWeight: 500, fontSize: 13,
  color: "var(--color-text-primary)",
  padding: "9px 14px",
  borderRight: "0.5px solid var(--color-border-tertiary)",
  whiteSpace: "nowrap",
};

const tdValStyle: React.CSSProperties = {
  textAlign: "right", fontSize: 12,
  padding: "8px 10px",
  borderLeft: "0.5px solid var(--color-border-tertiary)",
  whiteSpace: "nowrap",
  transition: "background 0.2s",
};

const tdMediaStyle: React.CSSProperties = {
  textAlign: "right", fontSize: 13, fontWeight: 500,
  padding: "9px 12px",
  borderLeft: "2px solid var(--color-border-secondary)",
  whiteSpace: "nowrap",
  color: "var(--color-text-primary)",
};
