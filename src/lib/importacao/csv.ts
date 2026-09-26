// Parser CSV genérico: lê qualquer CSV com base no mapeamento de colunas do Perfil.
import { mapearCategoria, type FonteMemoria } from "../categorias";
import {
  LancamentoImportado,
  PerfilConfig,
  parseCSV,
  parseDataFlexivel,
  parseValor,
} from "./tipos";

export function parseCSVGenerico(
  texto: string,
  perfil: PerfilConfig,
  memoriaIA: FonteMemoria,
  mesReferenciaManual: Date | null
): LancamentoImportado[] {
  const linhas = parseCSV(texto, perfil.delimitador);
  const dataRows = linhas.slice(perfil.linhasPular);
  const lancamentos: LancamentoImportado[] = [];

  for (const row of dataRows) {
    // Data
    if (perfil.colData == null) continue;
    const data = parseDataFlexivel(row[perfil.colData] ?? "", perfil.formatoData);
    if (!data) continue;

    // Descrição
    const descricaoBase = (perfil.colDescricao != null ? row[perfil.colDescricao] : "")?.trim() || "";
    const parcela = (perfil.colParcela != null ? row[perfil.colParcela] : "")?.trim() || "";
    const descricao = parcela && parcela.toLowerCase() !== "única"
      ? `${descricaoBase} (${parcela})`
      : descricaoBase;
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
    const categoria = mapearCategoria(descricao, "", tipo, memoriaIA);

    const mesReferencia = perfil.usaMesReferencia && mesReferenciaManual
      ? mesReferenciaManual
      : new Date(data.getFullYear(), data.getMonth(), 1);

    lancamentos.push({
      data,
      descricao,
      categoria,
      valor,
      tipo,
      conta: perfil.conta,
      mesReferencia,
      fonte: `Importado ${perfil.nome}`,
    });
  }

  return lancamentos;
}
