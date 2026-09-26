// Parsers de PDF para faturas de cartão de crédito — bancos brasileiros.
// Padrões baseados no projeto banksheet (tio-ze-rj/banksheet, MIT License).
// Requer PDFs digitais com texto embutido; PDFs escaneados (imagem) não funcionam.

import { mapearCategoria, type FonteMemoria } from "../categorias";
import { LancamentoImportado, PerfilConfig } from "./tipos";

// ─── Utilitários ─────────────────────────────────────────────────────────────

const PT_MONTHS: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

function parseBR(str: string): number {
  return parseFloat(str.trim().replace(/\./g, "").replace(",", "."));
}

function extrairAno(texto: string): number {
  const m = texto.match(/\b(20\d{2})\b/);
  return m ? parseInt(m[1]) : new Date().getFullYear();
}

function mesRef(data: Date, manual: Date | null): Date {
  return manual ?? new Date(data.getFullYear(), data.getMonth(), 1);
}

type PerfilPDF = PerfilConfig & { builtin: string | null };

// ─── Detecção do banco ────────────────────────────────────────────────────────

export type BancoPDF =
  | "nubank-cartao-pdf"
  | "c6-cartao-pdf"
  | "itau-cartao-pdf"
  | "bradesco-cartao-pdf"
  | "inter-cartao-pdf"
  | "sofisa-extrato-pdf";

export function detectarBancoPDF(texto: string): { builtinKey: BancoPDF | null; bancoNome: string } {
  const t = texto.toLowerCase();
  if (t.includes("banco sofisa") || t.includes("sofisadireto") || t.includes("sofisa direto")) {
    // comprovante de aplicação/resgate repete o que já está no extrato — não importar
    if (t.includes("comprovante de") || !t.includes("extrato do per"))
      return { builtinKey: null, bancoNome: "Sofisa — comprovante (importe o extrato da conta)" };
    return { builtinKey: "sofisa-extrato-pdf", bancoNome: "Sofisa — Extrato da Conta" };
  }
  if (t.includes("nu pagamentos") || (t.includes("nubank") && t.includes("fatura")))
    return { builtinKey: "nubank-cartao-pdf", bancoNome: "Nubank — Fatura do Cartão" };
  if (t.includes("c6 bank") || t.includes("banco c6") || t.includes("31.872.495"))
    return { builtinKey: "c6-cartao-pdf", bancoNome: "C6 — Fatura do Cartão" };
  if (t.includes("itauunibanco") || (t.includes("itaú") && t.includes("fatura")))
    return { builtinKey: "itau-cartao-pdf", bancoNome: "Itaú — Fatura do Cartão" };
  if (t.includes("bradesco") && (t.includes("cartão") || t.includes("lançamentos") || t.includes("fatura")))
    return { builtinKey: "bradesco-cartao-pdf", bancoNome: "Bradesco — Fatura do Cartão" };
  if (t.includes("banco inter") || (t.includes("inter") && t.includes("fatura")))
    return { builtinKey: "inter-cartao-pdf", bancoNome: "Inter — Fatura do Cartão" };
  return { builtinKey: null, bancoNome: "Banco não identificado" };
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

export function parsePDF(
  texto: string,
  perfil: PerfilPDF,
  memoriaIA: FonteMemoria,
  mesReferenciaManual: Date | null
): LancamentoImportado[] {
  switch (perfil.builtin) {
    case "nubank-cartao-pdf":    return parseNubank(texto, perfil, memoriaIA, mesReferenciaManual);
    case "c6-cartao-pdf":        return parseC6(texto, perfil, memoriaIA, mesReferenciaManual);
    case "itau-cartao-pdf":      return parseItau(texto, perfil, memoriaIA, mesReferenciaManual);
    case "bradesco-cartao-pdf":  return parseBradesco(texto, perfil, memoriaIA, mesReferenciaManual);
    case "inter-cartao-pdf":     return parseInter(texto, perfil, memoriaIA, mesReferenciaManual);
    case "sofisa-extrato-pdf":   return parseSofisa(texto, perfil, memoriaIA);
    default:                     return parseGenerico(texto, perfil, memoriaIA, mesReferenciaManual);
  }
}

// ─── Sofisa Direto — extrato da conta ───────────────────────────────────────────
// Formato: "14/07/2025 Recebimento de transferência via PIX - De FULANO R$ 10.000,00"
//          "15/07/2025 Aplicação - Meus Investimentos - CDB DIRETO DI -R$ 10.000,00"
// Linhas "Saldo em DD/MM/AAAA" são ignoradas. Conta corrente: mês de referência = mês da data.

export function parseSofisa(texto: string, perfil: PerfilPDF, memoriaIA: FonteMemoria): LancamentoImportado[] {
  const resultado: LancamentoImportado[] = [];
  const linha = /^(\d{2})\/(\d{2})\/(\d{4})\s+(.+?)\s+(-?)R\$\s*([\d.]+,\d{2})\s*$/;
  for (const bruta of texto.split(/\r?\n/)) {
    const m = bruta.trim().match(linha);
    if (!m) continue;
    const [, dd, mm, aaaa, descricao, sinal, valorTxt] = m;
    if (/^saldo em\b/i.test(descricao)) continue;
    const valor = (sinal ? -1 : 1) * parseBR(valorTxt);
    if (!valor) continue;
    const tipo = valor > 0 ? "Entrada" : "Saída";
    resultado.push({
      data: new Date(Date.UTC(+aaaa, +mm - 1, +dd)),
      descricao: descricao.trim(),
      valor,
      tipo,
      conta: perfil.conta,
      categoria: mapearCategoria(descricao, "", tipo, memoriaIA),
      fonte: "Importado Sofisa",
      mesReferencia: new Date(Date.UTC(+aaaa, +mm - 1, 1)), // extrato de conta: o próprio mês
    });
  }
  return resultado;
}

// ─── Nubank Cartão ────────────────────────────────────────────────────────────
// Formato: "15 JAN Descrição R$ 150,00" (débito) ou "15 JAN Descrição −R$ 50,00" (crédito/estorno)

function parseNubank(
  texto: string, perfil: PerfilPDF,
  memoriaIA: FonteMemoria, manual: Date | null
): LancamentoImportado[] {
  const linhas = texto.split("\n").map(l => l.trim()).filter(Boolean);
  const ano = extrairAno(texto);
  const result: LancamentoImportado[] = [];

  // DD MMM...descrição...[−]R$ 1.234,56
  const RE = /^(\d{1,2})\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\s+(.+?)\s+([−\-]?\s*R\$\s*[\d.,]+)\s*$/i;

  for (const linha of linhas) {
    const m = linha.match(RE);
    if (!m) continue;
    const mes = PT_MONTHS[m[2].toLowerCase()];
    if (!mes) continue;

    const descricao = m[3].trim();
    const valorStr = m[4].replace(/−/g, "-").replace(/R\$\s*/gi, "").trim();
    const raw = parseBR(valorStr);
    if (isNaN(raw)) continue;

    // No Nubank: sem sinal = débito, sinal negativo = crédito/pagamento
    const v = raw < 0 ? Math.abs(raw) : -raw;
    const tipo: "Entrada" | "Saída" = v >= 0 ? "Entrada" : "Saída";
    const data = new Date(ano, mes - 1, parseInt(m[1]));

    result.push({
      data, descricao, categoria: mapearCategoria(descricao, "", tipo, memoriaIA),
      valor: v, tipo, conta: perfil.conta,
      mesReferencia: mesRef(data, manual),
      fonte: "Importado Nubank (PDF)",
    });
  }
  return result;
}

// ─── C6 Cartão ───────────────────────────────────────────────────────────────
// Formato: "15 jan Descrição 150,00"

function parseC6(
  texto: string, perfil: PerfilPDF,
  memoriaIA: FonteMemoria, manual: Date | null
): LancamentoImportado[] {
  const linhas = texto.split("\n").map(l => l.trim()).filter(Boolean);
  const result: LancamentoImportado[] = [];

  let ano = new Date().getFullYear();
  const anoM = texto.match(/(?:fechamento|vencimento)[^\d]*\d{2}\/\d{2}\/(\d{2,4})/i);
  if (anoM) { ano = parseInt(anoM[1]); if (ano < 100) ano += 2000; }

  const RE = /^(\d{2})\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\s+(.+?)\s+([\d.,]+)\s*$/i;

  for (const linha of linhas) {
    const m = linha.match(RE);
    if (!m) continue;
    const mes = PT_MONTHS[m[2].toLowerCase()];
    if (!mes) continue;

    const descricao = m[3].trim();
    const raw = parseBR(m[4]);
    if (isNaN(raw)) continue;

    const isCredito = /estorno|pagamento/i.test(descricao);
    const v = isCredito ? raw : -raw;
    const tipo: "Entrada" | "Saída" = v >= 0 ? "Entrada" : "Saída";
    const data = new Date(ano, mes - 1, parseInt(m[1]));

    result.push({
      data, descricao, categoria: mapearCategoria(descricao, "", tipo, memoriaIA),
      valor: v, tipo, conta: perfil.conta,
      mesReferencia: mesRef(data, manual),
      fonte: "Importado C6 (PDF)",
    });
  }
  return result;
}

// ─── Itaú Cartão ─────────────────────────────────────────────────────────────
// Formato: "15/01 Descrição 150,00" (ou com parcelas: "15/01 Descrição 01/12150,00")

function parseItau(
  texto: string, perfil: PerfilPDF,
  memoriaIA: FonteMemoria, manual: Date | null
): LancamentoImportado[] {
  const linhas = texto.split("\n").map(l => l.trim()).filter(Boolean);
  const result: LancamentoImportado[] = [];
  const ano = extrairAno(texto);
  const vistos = new Set<string>();

  // DD/MM descrição [NN/NN]1.234,56
  const RE = /^(\d{2})\/(\d{2})\s+(.+?)\s+(?:\d{2}\/\d{2})?(-?\s*\d{1,3}(?:\.\d{3})*,\d{2})\s*$/;

  for (const linha of linhas) {
    const m = linha.match(RE);
    if (!m) continue;

    const dia = parseInt(m[1]), mes = parseInt(m[2]);
    const descricao = m[3].trim();
    const raw = parseBR(m[4].replace(/\s/g, ""));
    if (isNaN(raw)) continue;

    const key = `${dia}/${mes}|${descricao}|${raw}`;
    if (vistos.has(key)) continue;
    vistos.add(key);

    // No Itaú: positivo no PDF = débito (gasto)
    const v = raw > 0 ? -raw : Math.abs(raw);
    const tipo: "Entrada" | "Saída" = v >= 0 ? "Entrada" : "Saída";
    const data = new Date(ano, mes - 1, dia);

    result.push({
      data, descricao, categoria: mapearCategoria(descricao, "", tipo, memoriaIA),
      valor: v, tipo, conta: perfil.conta,
      mesReferencia: mesRef(data, manual),
      fonte: "Importado Itaú (PDF)",
    });
  }
  return result;
}

// ─── Bradesco Cartão ──────────────────────────────────────────────────────────
// Formato: "15/01 Descrição 150,00" (crédito tem "-" no final: "150,00-")

function parseBradesco(
  texto: string, perfil: PerfilPDF,
  memoriaIA: FonteMemoria, manual: Date | null
): LancamentoImportado[] {
  const linhas = texto.split("\n").map(l => l.trim()).filter(Boolean);
  const result: LancamentoImportado[] = [];
  const ano = extrairAno(texto);

  let dentro = false;
  const RE = /^(\d{2}\/\d{2})\s+(.+?)(\d{1,3}(?:\.\d{3})*,\d{2})(-)?\s*$/;

  for (const linha of linhas) {
    if (/lançamentos/i.test(linha)) { dentro = true; continue; }
    if (/total da fatura/i.test(linha)) break;
    if (!dentro) continue;

    const m = linha.match(RE);
    if (!m) continue;

    const [diaPart, mesPart] = m[1].split("/").map(Number);
    const descricao = m[2].trim();
    const raw = parseBR(m[3]);
    const isCredito = !!m[4];
    if (isNaN(raw)) continue;

    const v = isCredito ? raw : -raw;
    const tipo: "Entrada" | "Saída" = v >= 0 ? "Entrada" : "Saída";
    const data = new Date(ano, mesPart - 1, diaPart);

    result.push({
      data, descricao, categoria: mapearCategoria(descricao, "", tipo, memoriaIA),
      valor: v, tipo, conta: perfil.conta,
      mesReferencia: mesRef(data, manual),
      fonte: "Importado Bradesco (PDF)",
    });
  }
  return result;
}

// ─── Inter Cartão ────────────────────────────────────────────────────────────
// Formato: data e descrição na mesma linha "15 de jan. 2026 Descrição"
//          valor na linha seguinte: "- R$ 150,00" (débito) ou "+ R$ 50,00" (crédito)

function parseInter(
  texto: string, perfil: PerfilPDF,
  memoriaIA: FonteMemoria, manual: Date | null
): LancamentoImportado[] {
  const linhas = texto.split("\n").map(l => l.trim()).filter(Boolean);
  const result: LancamentoImportado[] = [];

  const DATE_RE = /^(\d{1,2})\s+de\s+(\w{3})\.\s+(\d{4})\s+(.+)/i;
  const AMOUNT_RE = /^(-\s*)?(\+\s*)?R\$\s*([\d.,]+)\s*$/i;

  let pendente: { dia: number; mes: number; ano: number; descricao: string } | null = null;

  for (const linha of linhas) {
    const dateM = linha.match(DATE_RE);
    if (dateM) {
      const mes = PT_MONTHS[dateM[2].toLowerCase()];
      if (mes) pendente = { dia: parseInt(dateM[1]), mes, ano: parseInt(dateM[3]), descricao: dateM[4].trim() };
      continue;
    }

    if (pendente) {
      const amtM = linha.match(AMOUNT_RE);
      if (amtM) {
        const isCredito = !!amtM[2];
        const raw = parseBR(amtM[3]);
        if (!isNaN(raw)) {
          const v = isCredito ? raw : -raw;
          const tipo: "Entrada" | "Saída" = v >= 0 ? "Entrada" : "Saída";
          const data = new Date(pendente.ano, pendente.mes - 1, pendente.dia);
          result.push({
            data, descricao: pendente.descricao,
            categoria: mapearCategoria(pendente.descricao, "", tipo, memoriaIA),
            valor: v, tipo, conta: perfil.conta,
            mesReferencia: mesRef(data, manual),
            fonte: "Importado Inter (PDF)",
          });
        }
        pendente = null;
      } else if (!/página|page|\d+\s*de\s*\d+/i.test(linha)) {
        pendente.descricao += " " + linha;
      }
    }
  }
  return result;
}

// ─── Genérico (fallback) ─────────────────────────────────────────────────────
// Tenta linhas com padrão DD/MM[/AAAA] + descrição + valor

function parseGenerico(
  texto: string, perfil: PerfilPDF,
  memoriaIA: FonteMemoria, manual: Date | null
): LancamentoImportado[] {
  const linhas = texto.split("\n").map(l => l.trim()).filter(Boolean);
  const result: LancamentoImportado[] = [];
  const anoDefault = extrairAno(texto);

  const RE = /^(\d{2})\/(\d{2})(?:\/(\d{2,4}))?\s+(.+?)\s+(-?\s*[\d.,]+)\s*$/;

  for (const linha of linhas) {
    const m = linha.match(RE);
    if (!m) continue;

    const dia = parseInt(m[1]), mes = parseInt(m[2]);
    const ano = m[3] ? (parseInt(m[3]) < 100 ? parseInt(m[3]) + 2000 : parseInt(m[3])) : anoDefault;
    const descricao = m[4].trim();
    const raw = parseBR(m[5].replace(/\s/g, ""));
    if (isNaN(raw) || !descricao) continue;

    const v = raw > 0 ? -raw : Math.abs(raw);
    const tipo: "Entrada" | "Saída" = v >= 0 ? "Entrada" : "Saída";
    const data = new Date(ano, mes - 1, dia);

    result.push({
      data, descricao, categoria: mapearCategoria(descricao, "", tipo, memoriaIA),
      valor: v, tipo, conta: perfil.conta,
      mesReferencia: mesRef(data, manual),
      fonte: `Importado ${perfil.nome} (PDF)`,
    });
  }
  return result;
}
