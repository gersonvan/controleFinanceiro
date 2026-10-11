// Orquestrador da importação. Recebe um perfil + conteúdo do arquivo e decide
// qual parser usar:
//   - builtin != null -> parser legado (parsers.ts), mantém compatibilidade
//   - formato "ofx"   -> parser OFX
//   - formato "csv"   -> parser CSV genérico (mapeamento de colunas)
import {
  parseExtratoC6,
  parseFaturaNubank,
  parseExtratoNubank,
  parseExtratoBB,
} from "../parsers";
import type { FonteMemoria } from "../categorias";
import { LancamentoImportado, PerfilConfig, parseCSV } from "./tipos";
import { parseCSVGenerico } from "./csv";
import { parseOFX } from "./ofx";
import { parsePDF } from "./pdf";

export interface PerfilCompleto extends PerfilConfig {
  builtin: string | null;
}

// Linhas que os bancos colocam no meio do extrato mas não são lançamentos.
// Só frases de saldo/total (com qualificador), para não descartar compras em
// lojas como "TOTAL EXPRESS" ou "SALDO CERTO". Inclui o saldo carregado da
// fatura anterior ("Valor pendente do mês anterior"), que não é gasto novo.
const LINHAS_DE_SALDO = /^(saldo|saldo (do dia|anterior|final|em conta|dispon[ií]vel|bloqueado)\b.*|sdo cta\b.*|s a l d o\b.*|total (da fatura|de lan[cç]amentos|geral|a pagar)\b.*|valor pendente do m[eê]s anterior\b.*|saldo em atraso\b.*)$/i;

const DATA_MINIMA = new Date(2000, 0, 1);

/**
 * Descarta o que não é lançamento de verdade, qualquer que seja o parser:
 * valor zero ou inválido, linhas de saldo/total, datas impossíveis (anteriores
 * a 2000 ou mais de um ano à frente — sintoma de formato de data errado).
 */
export function lancamentoValido(l: LancamentoImportado, hoje = new Date()): boolean {
  if (!Number.isFinite(l.valor) || Math.abs(l.valor) < 0.005) return false;
  if (!(l.data instanceof Date) || isNaN(l.data.getTime())) return false;
  const limite = new Date(hoje.getFullYear() + 1, hoje.getMonth(), hoje.getDate());
  if (l.data < DATA_MINIMA || l.data > limite) return false;
  if (!l.descricao.trim() || LINHAS_DE_SALDO.test(l.descricao.trim())) return false;
  return true;
}

export function importar(
  texto: string,
  fileName: string,
  perfil: PerfilCompleto,
  memoriaIA: FonteMemoria,
  mesReferenciaManual: Date | null
): LancamentoImportado[] {
  return importarBruto(texto, fileName, perfil, memoriaIA, mesReferenciaManual).filter((l) => lancamentoValido(l));
}

function importarBruto(
  texto: string,
  fileName: string,
  perfil: PerfilCompleto,
  memoriaIA: FonteMemoria,
  mesReferenciaManual: Date | null
): LancamentoImportado[] {
  // Banco do Brasil em CSV: parser próprio (junta tipo e detalhe da linha)
  if (perfil.builtin === "bb-corrente-csv") {
    return parseExtratoBB(parseCSV(texto, ",").slice(1), perfil.conta, memoriaIA);
  }

  // 1. Perfis nativos de CSV com parser próprio (extrato C6, CSVs do Nubank).
  // A fatura C6 em CSV usa o parser genérico (perfil c6-cartao-csv).
  if (perfil.builtin) {
    const rows = parseCSV(texto, ",");
    const linhasHeader: Record<string, number> = {
      // c6-debito: 0 — o cabeçalho do extrato varia de tamanho; o parser já
      // ignora linhas sem data e valores válidos.
      "c6-debito": 0, "nubank-credito": 1, "nubank-debito": 1,
    };
    const dataRows = rows.slice(linhasHeader[perfil.builtin] ?? 1);

    switch (perfil.builtin) {
      case "c6-debito":      return parseExtratoC6(dataRows, perfil.conta, memoriaIA);
      case "nubank-credito": return parseFaturaNubank(dataRows, perfil.conta, fileName, memoriaIA, mesReferenciaManual);
      case "nubank-debito":  return parseExtratoNubank(dataRows, perfil.conta, memoriaIA);
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
