"use client";
// Tabela das primeiras linhas do CSV com o papel de cada coluna (data,
// descrição, complemento, valor…). Usada ao criar e ao editar um perfil.
import type { Papel } from "@/lib/importacao/detectar";

export const PAPEL_OPTS: { v: Papel; label: string }[] = [
  { v: "",            label: "— ignorar —" },
  { v: "data",        label: "📅 Data" },
  { v: "descricao",   label: "📝 Descrição" },
  { v: "complemento", label: "➕ Complemento" },
  { v: "parcela",     label: "🔢 Parcela" },
  { v: "valor",       label: "💰 Valor (única)" },
  { v: "entrada",     label: "⬆ Entrada" },
  { v: "saida",       label: "⬇ Saída" },
];
/** Papéis que só uma coluna pode ter. */
const UNICOS: Papel[] = ["data", "descricao", "complemento", "parcela", "valor", "entrada", "saida"];

/** Troca o papel de uma coluna; o papel sai da coluna que o tinha antes. */
export function comPapel(papeis: Papel[], col: number, papel: Papel): Papel[] {
  const novo = papeis.map((p) => (papel && UNICOS.includes(papel) && p === papel ? "" : p)) as Papel[];
  novo[col] = papel;
  return novo;
}

export default function MapeamentoColunas({ linhas, linhasPular, papeis, onPapeis }: {
  linhas: string[][];
  linhasPular: number;
  papeis: Papel[];
  onPapeis: (papeis: Papel[]) => void;
}) {
  if (linhas.length === 0) return null;
  return (
    <div className="overflow-x-auto border border-slate-200 rounded-lg">
      <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            {papeis.map((p, col) => (
              <th key={col} style={{ padding: 6, borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
                <select value={p} aria-label={`Papel da coluna ${col + 1}`}
                  onChange={(e) => onPapeis(comPapel(papeis, col, e.target.value as Papel))}
                  style={{ fontSize: 11, padding: "2px 4px" }}>
                  {PAPEL_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                </select>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha, li) => (
            <tr key={li} style={{ opacity: li < linhasPular ? 0.35 : 1, background: li < linhasPular ? "#fef2f2" : undefined }}>
              {papeis.map((_, col) => (
                <td key={col} style={{ padding: "4px 6px", borderBottom: "0.5px solid #f1f5f9", whiteSpace: "nowrap", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}
                  title={linha[col]}>
                  {linha[col] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-xs text-slate-400 p-2 bg-slate-50">
        Linhas em vermelho são o cabeçalho (ignoradas). <strong>Complemento</strong>: uma segunda coluna que completa a descrição (ex.: &quot;Detalhes&quot;, com o nome de quem recebeu).
      </div>
    </div>
  );
}
