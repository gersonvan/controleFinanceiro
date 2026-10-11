// Parser CSV genérico: lê qualquer CSV com base no mapeamento de colunas do Perfil.
import { mapearCategoria, type FonteMemoria } from "../categorias";
import {
  LancamentoImportado,
  PerfilConfig,
  parseCSV,
  parseDataFlexivel,
  parseValor,
} from "./tipos";

/** Junta descrição e complemento sem repetir o que já está lá. */
function juntar(a: string, b: string): string {
  if (!a || !b) return a || b;
  return a.toLowerCase().includes(b.toLowerCase()) ? a : `${a} - ${b}`;
}

const SO_NUMERO = /^[-+]?[\d.,\s]+$/;

export function parseCSVGenerico(
  texto: string,
  perfil: PerfilConfig,
  memoriaIA: FonteMemoria,
  mesReferenciaManual: Date | null
): LancamentoImportado[] {
  const linhas = parseCSV(texto, perfil.delimitador);
  const dataRows = linhas.slice(perfil.linhasPular);
  const lancamentos: Omit<LancamentoImportado, "categoria">[] = [];
  const celula = (row: string[], col: number | null | undefined) => (col != null ? row[col] ?? "" : "").trim();
  const colunasDeValor = [perfil.colValor, perfil.colEntrada, perfil.colSaida];
  const temValor = (row: string[]) => colunasDeValor.some((c) => { const v = parseValor(celula(row, c)); return !isNaN(v) && v !== 0; });
  // lançamento que uma linha sem data pode completar (zera em linha vazia, de total ou de outra seção)
  let ultimo: { descricao: string; parcela: string } | null = null;
  let ultimoIdx = -1;

  for (const row of dataRows) {
    // Data
    if (perfil.colData == null) continue;
    const data = parseDataFlexivel(row[perfil.colData] ?? "", perfil.formatoData);
    if (!data) {
      const texto = [celula(row, perfil.colDescricao), celula(row, perfil.colComplemento)].filter(Boolean).join(" ")
        || row.map((c) => c.trim()).filter((c) => c && !SO_NUMERO.test(c)).join(" ");
      if (perfil.juntarLinhasSemData && ultimo && texto && !temValor(row)) {
        ultimo.descricao = juntar(ultimo.descricao, texto);
        lancamentos[ultimoIdx].descricao = comParcela(ultimo.descricao, ultimo.parcela);
      } else ultimo = null;
      continue;
    }
    ultimo = null;

    // Descrição: a coluna principal e, se houver, o complemento
    const descricaoBase = juntar(celula(row, perfil.colDescricao), celula(row, perfil.colComplemento));
    const parcela = celula(row, perfil.colParcela);
    const descricao = comParcela(descricaoBase, parcela);
    if (!descricao) continue;

    // Valor (modo única coluna ou colunas separadas de entrada/saída)
    let valor: number;
    if (perfil.modoValor === "separadas") {
      const ent = parseValor(perfil.colEntrada != null ? row[perfil.colEntrada] ?? "" : "");
      const sai = parseValor(perfil.colSaida != null ? row[perfil.colSaida] ?? "" : "");
      if (!isNaN(ent) && ent > 0) valor = ent;
      else if (!isNaN(sai) && sai > 0) valor = -sai;
      else continue;
    } else {
      if (perfil.colValor == null) continue;
      const v = parseValor(row[perfil.colValor] ?? "");
      if (isNaN(v)) continue;
      valor = perfil.inverterSinal ? -v : v;
    }

    const tipo: "Entrada" | "Saída" = valor >= 0 ? "Entrada" : "Saída";
    const mesReferencia = perfil.usaMesReferencia && mesReferenciaManual
      ? mesReferenciaManual
      : new Date(data.getFullYear(), data.getMonth(), 1);

    lancamentos.push({
      data,
      descricao,
      valor,
      tipo,
      conta: perfil.conta,
      mesReferencia,
      fonte: `Importado ${perfil.nome}`,
    });
    ultimo = { descricao: descricaoBase, parcela };
    ultimoIdx = lancamentos.length - 1;
  }

  // a categoria só depois da descrição completa (o complemento pode vir na linha de baixo)
  return lancamentos.map((l) => ({ ...l, categoria: mapearCategoria(l.descricao, "", l.tipo, memoriaIA) }));
}

function comParcela(descricao: string, parcela: string): string {
  return parcela && parcela.toLowerCase() !== "única" ? `${descricao} (${parcela})` : descricao;
}
