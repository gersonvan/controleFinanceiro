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
  | "itau-extrato-pdf"
  | "bradesco-cartao-pdf"
  | "inter-cartao-pdf"
  | "nomad-cartao-pdf"
  | "bradesco-extrato-pdf"
  | "sofisa-extrato-pdf";

export function detectarBancoPDF(texto: string): { builtinKey: BancoPDF | null; bancoNome: string } {
  const t = texto.toLowerCase();
  // Extrato Bradesco (app "Bradesco Celular") pela estrutura, antes de tudo: os lançamentos
  // citam outros bancos ("PAGTO ELETRON COBRANCA / BANCO C6 S.A.") e era lido como fatura C6.
  if (t.includes("bradesco celular") && /extrato de:\s*ag[eê]ncia/.test(t) && t.includes("histórico") && t.includes("docto"))
    return { builtinKey: "bradesco-extrato-pdf", bancoNome: "Bradesco — Extrato da Conta" };
  // Nomad antes dos outros: o boleto é do Itaú (341) e o texto tem "internacional"/"internet" (o Inter casava)
  if (t.includes("nomadglobal") || t.includes("nomad tecnologia") || t.includes("fatura nomad"))
    return { builtinKey: "nomad-cartao-pdf", bancoNome: "Nomad — Fatura do Cartão" };
  if (t.includes("banco sofisa") || t.includes("sofisadireto") || t.includes("sofisa direto")) {
    // comprovante de aplicação/resgate repete o que já está no extrato — não importar
    if (t.includes("comprovante de") || !t.includes("extrato do per"))
      return { builtinKey: null, bancoNome: "Sofisa — comprovante (importe o extrato da conta)" };
    return { builtinKey: "sofisa-extrato-pdf", bancoNome: "Sofisa — Extrato da Conta" };
  }
  // Itaú antes dos outros: o extrato da conta cita outros bancos nos boletos pagos
  // ("PAG BOLETO NU PAGAMENTOS SA", "BANCO INTER SA") e era lido como fatura Nubank.
  const itau = t.includes("itaú") || t.includes("itau");
  if (itau && t.includes("saldo do dia") && /extrato conta|lançamentos|lancamentos/.test(t))
    return { builtinKey: "itau-extrato-pdf", bancoNome: "Itaú — Extrato da Conta" };
  if (t.includes("itauunibanco") || t.includes("itaú cartões") || (itau && /total desta fatura|lançamentos: compras e saques/.test(t)))
    return { builtinKey: "itau-cartao-pdf", bancoNome: "Itaú — Fatura do Cartão" };
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
    case "itau-extrato-pdf":     return parseItauExtrato(texto, perfil, memoriaIA);
    case "bradesco-cartao-pdf":  return parseBradesco(texto, perfil, memoriaIA, mesReferenciaManual);
    case "inter-cartao-pdf":     return parseInter(texto, perfil, memoriaIA, mesReferenciaManual);
    case "nomad-cartao-pdf":     return parseNomad(texto, perfil, memoriaIA, mesReferenciaManual);
    case "bradesco-extrato-pdf": return parseBradescoExtrato(texto, perfil, memoriaIA);
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
// Blocos da fatura:
//   "Pagamentos efetuados"          → "17/08 PAGAMENTO DEB AUTOMATIC -4.816,49" — é a quitação da
//                                     fatura anterior (já está no extrato da conta): não entra.
//   "Lançamentos: compras e saques" → "23/04 PG *LOJA 05/06 105,76" (parcela 5 de 6),
//                                     "18/08 CANCELAMENTO DE COMPRA -604,80" (crédito);
//                                     a linha seguinte ("vestuário FORTALEZA") é ignorada.
//   "Compras parceladas - próximas faturas" → parcelas futuras: não entram.
// A soma do que entra bate com "Lançamentos atuais" da fatura. Versões antigas do
// pdf-parse colavam a parcela no valor ("01/12150,00"); o espaço é opcional.

export function parseItau(
  texto: string, perfil: PerfilPDF,
  memoriaIA: FonteMemoria, manual: Date | null
): LancamentoImportado[] {
  const result: LancamentoImportado[] = [];
  // ano/mês do vencimento: compras de meses depois dele são do ano anterior (fatura de janeiro)
  const venc = texto.match(/vencimento[^\d\n]{0,40}\d{2}\/(\d{2})\/(\d{4})/i);
  const anoVenc = venc ? parseInt(venc[2]) : extrairAno(texto);
  const mesVenc = venc ? parseInt(venc[1]) : 12;
  const RE = /^(\d{2})\/(\d{2})\s+(.+?)(?:\s+(\d{2})\/(\d{2}))?\s*(-?\s*\d{1,3}(?:\.\d{3})*,\d{2})\s*$/;

  let bloco: "compras" | "fora" = "compras"; // faturas sem cabeçalhos de bloco: tudo é compra
  for (const bruta of texto.split("\n")) {
    const linha = bruta.trim();
    const l = linha.toLowerCase();
    if (/^pagamentos efetuados/.test(l) || /^compras parceladas\s*-\s*pr[óo]ximas faturas/.test(l)) { bloco = "fora"; continue; }
    if (/^lan[çc]amentos:/.test(l)) { bloco = "compras"; continue; }
    if (bloco === "fora") continue;

    const m = linha.match(RE);
    if (!m) continue;
    const dia = parseInt(m[1]), mes = parseInt(m[2]);
    if (!dia || dia > 31 || !mes || mes > 12) continue;
    const raw = parseBR(m[6].replace(/\s/g, ""));
    if (isNaN(raw) || raw === 0) continue;
    const base = m[3].trim();
    // pagamento da fatura fora do bloco próprio (layouts antigos): não é compra nem receita
    if (/^pagamento\b/i.test(base) && raw < 0) continue;
    const parcela = m[4] && parseInt(m[4]) >= 1 && parseInt(m[4]) <= parseInt(m[5]) ? ` (${m[4]}/${m[5]})` : "";
    const descricao = base + parcela;

    // No Itaú: positivo = compra; negativo = estorno/crédito
    const v = -raw;
    const tipo: "Entrada" | "Saída" = v >= 0 ? "Entrada" : "Saída";
    const ano = mes > mesVenc ? anoVenc - 1 : anoVenc;
    const data = new Date(Date.UTC(ano, mes - 1, dia));

    result.push({
      data, descricao, categoria: mapearCategoria(base, "", tipo, memoriaIA),
      valor: v, tipo, conta: perfil.conta,
      mesReferencia: manual ?? new Date(Date.UTC(anoVenc, mesVenc - 1, 1)),
      fonte: "Importado Itaú (PDF)",
    });
  }
  return result;
}

// ─── Itaú — extrato da conta corrente ───────────────────────────────────────────
// Formato: "25/09/2026 PIX TRANSF FULANO 25/09 -175,91" (às vezes seguido do saldo).
// Linhas "SALDO DO DIA"/"SALDO ANTERIOR" são ignoradas. Conta corrente: mês de referência = mês da data.

export function parseItauExtrato(texto: string, perfil: PerfilPDF, memoriaIA: FonteMemoria): LancamentoImportado[] {
  const resultado: LancamentoImportado[] = [];
  const linha = /^(\d{2})\/(\d{2})\/(\d{4})\s+(.+?)\s+(-?[\d.]+,\d{2})(?:\s+-?[\d.]+,\d{2})?\s*$/;
  for (const bruta of texto.split(/\r?\n/)) {
    const m = bruta.trim().match(linha);
    if (!m) continue;
    const [, dd, mm, aaaa, desc, valorTxt] = m;
    if (/^saldo\b|^s\s*a\s*l\s*d\s*o\b/i.test(desc)) continue;
    const valor = parseBR(valorTxt);
    if (!valor) continue;
    // "PIX TRANSF FULANO25/09": o Itaú cola a data da operação no nome
    const descricao = desc.replace(/(\S)(\d{2}\/\d{2})$/, "$1 $2").replace(/\s+/g, " ").trim();
    const tipo = valor > 0 ? "Entrada" : "Saída";
    resultado.push({
      data: new Date(Date.UTC(+aaaa, +mm - 1, +dd)),
      descricao,
      valor,
      tipo,
      conta: perfil.conta,
      categoria: mapearCategoria(descricao, "", tipo, memoriaIA),
      fonte: "Importado Itaú (PDF)",
      mesReferencia: new Date(Date.UTC(+aaaa, +mm - 1, 1)),
    });
  }
  return resultado;
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

// ─── Bradesco Extrato da Conta (PDF do app "Bradesco Celular") ────────────────
// Cabeçalho repetido em cada página ("Bradesco Celular", "Data: …", "Nome: …",
// "Extrato de: Agência…", "Data Histórico Docto. Crédito (R$) Débito (R$) Saldo (R$)").
// A data só vem no primeiro lançamento do dia. Lançamento numa linha
// ("05/01/2026 RENTAB.INVEST FACILCRED* 3096128 0,01 507,71") ou em duas — o
// histórico e, embaixo, complemento + docto, valor e saldo ("PIX ENVIADO" /
// "DES: FULANO 03/01 1239048 30,00 365,95"). O PDF perde a coluna: crédito ou
// débito sai do saldo, que sobe ou desce pelo valor (o "-" do saldo negativo
// também se perde). "COD. LANC." é o saldo
// anterior; "Total" fecha a seção; "Últimos Lancamentos" repete o fim — o que
// já veio (mesma data, docto e valor) não entra de novo.

const CABECALHO_BRADESCO = /^(bradesco celular|data: \d{2}\/\d{2}\/\d{4}|nome:|extrato de:|data hist[óo]rico|-- \d+ of \d+ --|total\s)/i;
const VALORES_BRADESCO = /^(.*?)\s*(\d+)\s+(-?[\d.]+,\d{2})\s+(-?[\d.]+,\d{2})$/;

/** No formato que as regras já entendem: "Pix enviado para X", "Compra no débito - X"… */
export function descricaoBradesco(historico: string, complemento: string): string {
  const h = historico.replace(/\s+/g, " ").trim();
  const quem = complemento.replace(/^(des|rem):\s*/i, "").replace(/\s+\d{2}\/\d{2}$/, "").replace(/\s+/g, " ").trim();
  if (!quem) return h;
  if (/^pix (enviado|qr code (estatico|dinamico)|automatico)$/i.test(h)) return `Pix enviado para ${quem}`;
  if (/^pix recebido$/i.test(h)) return `Pix recebido de ${quem}`;
  if (/^compra .*debito/i.test(h)) return `Compra no débito - ${quem}`;
  if (/^pagto eletron cobranca$/i.test(h)) return `Pagamento de boleto - ${quem}`;
  return `${h} - ${quem}`;
}

interface LinhaBradesco { data: Date; docto: string; valor: number; historico: string; complemento: string }

/** Lançamentos e o saldo final (com o sinal recuperado) do extrato Bradesco em PDF. */
export function lerExtratoBradesco(texto: string): { linhas: LinhaBradesco[]; saldoFinal: { saldo: number; data: Date } | null } {
  const linhas: LinhaBradesco[] = [];
  const vistos = new Set<string>();
  let data: Date | null = null;
  let saldo: number | null = null;
  let historico: string | null = null;

  for (const bruta of texto.split(/\r?\n/)) {
    let linha = bruta.trim();
    if (!linha || CABECALHO_BRADESCO.test(linha)) continue;
    const comData = linha.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(.*)$/);
    if (comData) {
      data = new Date(Date.UTC(+comData[3], +comData[2] - 1, +comData[1]));
      linha = comData[4];
    }
    // saldo anterior: "COD. LANC. 0 0,00 309,18" ou, nos últimos lançamentos, "COD. LANC. 0 17.798,02"
    const anterior = linha.match(/^cod\. lanc\.\s+\d+\s+(?:-?[\d.]+,\d{2}\s+)?(-?[\d.]+,\d{2})$/i);
    if (anterior) { saldo = parseBR(anterior[1]); historico = null; continue; }
    const m = linha.match(VALORES_BRADESCO);
    if (!m) { historico = historico ? `${historico} ${linha}` : linha; continue; } // histórico; os valores vêm embaixo
    const [, antes, docto, valorTxt, saldoTxt] = m;
    const hist = historico ?? antes;
    const complemento = historico ? antes : "";
    historico = null;
    const saldoLinha = parseBR(saldoTxt);
    const bruto = parseBR(valorTxt);
    if (!data || isNaN(bruto) || bruto === 0) { saldo = saldoLinha; continue; }

    // o saldo diz se entrou ou saiu. O PDF perde o "-" do saldo negativo (conta no
    // limite): vale o saldo com ou sem sinal que fecha a conta. Sem saldo anterior,
    // o nome do lançamento decide.
    let valor: number | null = null;
    if (saldo !== null) {
      for (const novo of [saldoLinha, -saldoLinha]) {
        if (Math.abs(saldo + bruto - novo) < 0.005) { valor = bruto; saldo = novo; break; }
        if (Math.abs(saldo - bruto - novo) < 0.005) { valor = -bruto; saldo = novo; break; }
      }
    }
    if (valor === null) {
      valor = /recebid|rentab|deposito|estorno|resgate/i.test(hist) ? bruto : -bruto;
      saldo = saldoLinha;
    }

    const chave = `${data.getTime()}|${docto}|${valor}`;
    if (vistos.has(chave)) continue; // "Últimos Lancamentos" repete o fim do período
    vistos.add(chave);
    linhas.push({ data, docto, valor, historico: hist, complemento });
  }
  const ultima = linhas[linhas.length - 1];
  return { linhas, saldoFinal: ultima && saldo !== null ? { saldo: Math.round(saldo * 100) / 100, data: ultima.data } : null };
}

export function parseBradescoExtrato(texto: string, perfil: PerfilPDF, memoriaIA: FonteMemoria): LancamentoImportado[] {
  return lerExtratoBradesco(texto).linhas.map(({ data, valor, historico, complemento }) => {
    const descricao = descricaoBradesco(historico, complemento);
    const tipo = valor > 0 ? "Entrada" : "Saída";
    return {
      data, descricao, valor, tipo, conta: perfil.conta,
      categoria: mapearCategoria(descricao, "", tipo, memoriaIA),
      fonte: "Importado Bradesco (PDF)",
      mesReferencia: new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), 1)),
    } satisfies LancamentoImportado;
  });
}

// ─── Nomad Cartão (emitido pela Afinz) ───────────────────────────────────────
// Formato: "28/08/2026 GOL LINHAEREAS S.A. Rio BR R$ 90,00"; estorno/crédito com
// "-R$ 57,83"; parcela no fim da descrição "(01/04)". Cada cartão (titular,
// virtual, adicional) tem a sua seção, todas com o mesmo formato. "PAGAMENTO DE
// FATURA" é a quitação da fatura anterior — sai pela conta — e fica de fora. O
// resumo, as ofertas de parcelamento e o boleto não têm o formato "data … R$ valor".

export function parseNomad(
  texto: string, perfil: PerfilPDF,
  memoriaIA: FonteMemoria, manual: Date | null
): LancamentoImportado[] {
  const linhas = texto.split("\n").map(l => l.trim()).filter(Boolean);
  const result: LancamentoImportado[] = [];
  const RE = /^(\d{2})\/(\d{2})\/(\d{4})\s+(.+?)\s+(-)?R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})$/;

  for (const linha of linhas) {
    const m = linha.match(RE);
    if (!m) continue;
    const descricao = m[4].trim();
    if (/^pagamento de fatura/i.test(descricao)) continue;
    const raw = parseBR(m[6]);
    if (isNaN(raw) || raw === 0) continue;

    const v = m[5] ? raw : -raw;
    const tipo: "Entrada" | "Saída" = v >= 0 ? "Entrada" : "Saída";
    const data = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
    result.push({
      data, descricao, categoria: mapearCategoria(descricao, "", tipo, memoriaIA),
      valor: v, tipo, conta: perfil.conta,
      mesReferencia: mesRef(data, manual),
      fonte: "Importado Nomad (PDF)",
    });
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
