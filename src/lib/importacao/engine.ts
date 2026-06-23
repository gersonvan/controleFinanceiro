// Orquestrador da importação. Recebe um perfil + conteúdo do arquivo e decide
// qual parser usar:
//   - builtin != null -> parser legado (parsers.ts), mantém compatibilidade
//   - formato "ofx"   -> parser OFX
//   - formato "csv"   -> parser CSV genérico (mapeamento de colunas)
import {
  parseFaturaC6,
  parseExtratoC6,
  parseFaturaNubank,
  parseExtratoNubank,
} from "../parsers";
import { LancamentoImportado, PerfilConfig, parseCSV } from "./tipos";
import { parseCSVGenerico } from "./csv";
import { parseOFX } from "./ofx";
import { parsePDF } from "./pdf";

export interface PerfilCompleto extends PerfilConfig {
  builtin: string | null;
}

export function importar(
  texto: string,
  fileName: string,
  perfil: PerfilCompleto,
  memoriaIA: Map<string, string>,
  mesReferenciaManual: Date | null
): LancamentoImportado[] {
  // 1. Perfis legados do Gerson (compatibilidade total)
  if (perfil.builtin) {
    const delim = perfil.builtin === "c6-credito" ? ";" : ",";
    const rows = parseCSV(texto, delim);
    const linhasHeader: Record<string, number> = {
      "c6-credito": 1, "c6-debito": 9, "nubank-credito": 1, "nubank-debito": 1,
    };
    const dataRows = rows.slice(linhasHeader[perfil.builtin] ?? 1);

    switch (perfil.builtin) {
      case "c6-credito":     return parseFaturaC6(dataRows, fileName, memoriaIA);
      case "c6-debito":      return parseExtratoC6(dataRows, memoriaIA);
      case "nubank-credito": return parseFaturaNubank(dataRows, fileName, memoriaIA);
      case "nubank-debito":  return parseExtratoNubank(dataRows, memoriaIA);
    }
  }

  // 2. Perfis genéricos (qualquer banco)
  if (perfil.formato === "ofx") {
    return parseOFX(texto, perfil, memoriaIA, mesReferenciaManual);
  }
  if (perfil.formato === "pdf") {
    return parsePDF(texto, perfil, memoriaIA, mesReferenciaManual);
  }
  return parseCSVGenerico(texto, perfil, memoriaIA, mesReferenciaManual);
}
