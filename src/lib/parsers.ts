import { mapearCategoria } from "./categorias";
import { parseValor } from "./importacao/tipos";

export interface LancamentoImportado {
  data: Date;
  descricao: string;
  categoria: string;
  valor: number;
  tipo: "Entrada" | "Saída";
  conta: string;
  mesReferencia: Date;
  fonte: string;
}

function parseDateBR(str: string): Date | null {
  const parts = str.split("/");
  if (parts.length === 3) {
    const [d, m, y] = parts.map(Number);
    if (!isNaN(d) && !isNaN(m) && !isNaN(y))
      return new Date(y, m - 1, d);
  }
  return null;
}

export function parseFaturaC6(
  rows: string[][],
  fileName: string,
  memoriaIA: Map<string, string>
): LancamentoImportado[] {
  const lancamentos: LancamentoImportado[] = [];
  const ano = fileName.substring(7, 11);
  const mes = fileName.substring(12, 14);
  const mesReferencia = new Date(parseInt(ano), parseInt(mes) - 1, 1);

  for (const row of rows) {
    if (row.length < 9 || row[4]?.includes("Inclusao de Pagamento")) continue;

    const valorCsv = parseFloat(row[8]?.replace(",", "."));
    if (isNaN(valorCsv)) continue;

    let valor: number;
    let tipo: "Entrada" | "Saída";
    let categoria = row[3] || "";

    if (valorCsv > 0) {
      valor = -valorCsv;
      tipo = "Saída";
    } else {
      valor = Math.abs(valorCsv);
      tipo = "Entrada";
      if (categoria === "-") categoria = "Estorno";
    }

    let descricao = row[4] || "";
    const parcela = row[5];
    if (parcela && parcela !== "Única") descricao = `${descricao} (${parcela})`;

    const dataStr = row[0];
    const data = parseDateBR(dataStr);
    if (!data) continue;

    categoria = mapearCategoria(descricao, categoria, tipo, memoriaIA);

    lancamentos.push({
      data,
      descricao,
      categoria,
      valor,
      tipo,
      conta: "C6 Crédito",
      mesReferencia,
      fonte: `Importado C6Crédito`,
    });
  }
  return lancamentos;
}

// Mensagens que o C6 põe na coluna "Descrição" quando não há texto do usuário.
const DETALHE_GENERICO_C6 = /^(transf enviada pix( ob)?|transf pix cartoes|boleto|pix recorrente|cheque especial)$/i;

/**
 * Descrição de uma linha do extrato C6 (colunas Título e Descrição):
 * - compra no débito: o título é só "DEBITO DE CARTAO", a loja vem no detalhe;
 * - Pix com mensagem ("Contador Jun_26", "psiquiatra"): título + mensagem;
 * - demais: só o título (detalhe vazio, igual ao título ou genérico).
 */
export function descricaoExtratoC6(titulo: string, detalhe: string): string {
  if (titulo.toLowerCase().includes("debito de cartao")) return detalhe || titulo;
  const informativo = detalhe
    && detalhe.toLowerCase() !== titulo.toLowerCase()
    && !DETALHE_GENERICO_C6.test(detalhe);
  return informativo ? `${titulo} · ${detalhe}` : titulo;
}

export function parseExtratoC6(
  rows: string[][],
  memoriaIA: Map<string, string>
): LancamentoImportado[] {
  const lancamentos: LancamentoImportado[] = [];

  for (const row of rows) {
    if (row.length < 7) continue;

    const entradaStr = row[4]?.replace(/,/g, "");
    const saidaStr = row[5]?.replace(/,/g, "");
    const entrada = parseFloat(entradaStr);
    const saida = parseFloat(saidaStr);

    let valor = 0;
    if (!isNaN(entrada) && entrada > 0) {
      valor = entrada;
    } else if (!isNaN(saida) && saida > 0) {
      valor = -saida;
    } else {
      continue;
    }

    const dataStr = row[0];
    const data = parseDateBR(dataStr);
    if (!data) continue;

    const titulo = (row[2] || "").trim();
    const detalhe = (row[3] || "").trim();
    const descricao = descricaoExtratoC6(titulo, detalhe);

    const tipo: "Entrada" | "Saída" = valor > 0 ? "Entrada" : "Saída";
    const categoria = mapearCategoria(descricao, "", tipo, memoriaIA);

    const [, mesStr, anoStr] = dataStr.split("/");
    const mesReferencia = new Date(parseInt(anoStr), parseInt(mesStr) - 1, 1);

    lancamentos.push({
      data,
      descricao,
      categoria,
      valor,
      tipo,
      conta: "C6 Débito",
      mesReferencia,
      fonte: `Importado C6Débito`,
    });
  }
  return lancamentos;
}

export function parseFaturaNubank(
  rows: string[][],
  fileName: string,
  memoriaIA: Map<string, string>,
  mesReferenciaManual: Date | null = null
): LancamentoImportado[] {
  const lancamentos: LancamentoImportado[] = [];
  // Mês informado na importação manda; o nome "Nubank_AAAA-MM-DD.csv" é o plano B.
  const doNome = fileName.match(/(20\d{2})[-_](\d{2})/);
  const mesReferencia = mesReferenciaManual
    ?? (doNome ? new Date(parseInt(doNome[1]), parseInt(doNome[2]) - 1, 1) : null);
  if (!mesReferencia) throw new Error("Informe o mês de referência da fatura");

  for (const row of rows) {
    if (row.length < 3) continue;

    const descricao = row[1] || "";
    if (descricao === "Pagamento recebido") continue;

    // Aceita o formato antigo ("22.45") e o atual ("22,45", "- 208,26").
    const valorCsv = parseValor(row[2] ?? "");
    if (isNaN(valorCsv)) continue;

    let valor: number;
    let tipo: "Entrada" | "Saída";
    let categoria = "";

    if (valorCsv > 0) {
      valor = -valorCsv;
      tipo = "Saída";
    } else {
      valor = Math.abs(valorCsv);
      tipo = "Entrada";
      categoria = "Estorno";
    }

    const dateParts = row[0]?.split("-");
    if (!dateParts || dateParts.length < 3) continue;
    const [anoCsv, mesCsv, diaCsv] = dateParts.map(Number);
    const data = new Date(anoCsv, mesCsv - 1, diaCsv);

    categoria = mapearCategoria(descricao, categoria, tipo, memoriaIA);

    lancamentos.push({
      data,
      descricao,
      categoria,
      valor,
      tipo,
      conta: "Nubank Crédito",
      mesReferencia,
      fonte: `Importado NubankCrédito`,
    });
  }
  return lancamentos;
}

export function parseExtratoNubank(
  rows: string[][],
  memoriaIA: Map<string, string>
): LancamentoImportado[] {
  const lancamentos: LancamentoImportado[] = [];

  for (const row of rows) {
    if (row.length < 4) continue;

    const valor = parseFloat(row[1]);
    if (isNaN(valor)) continue;

    const dataStr = row[0];
    const descricao = row[3] || "";
    const tipo: "Entrada" | "Saída" = valor > 0 ? "Entrada" : "Saída";
    const categoria = mapearCategoria(descricao, "", tipo, memoriaIA);

    const data = parseDateBR(dataStr);
    if (!data) continue;

    const [, mesStr, anoStr] = dataStr.split("/");
    const mesReferencia = new Date(parseInt(anoStr), parseInt(mesStr) - 1, 1);

    lancamentos.push({
      data,
      descricao,
      categoria,
      valor,
      tipo,
      conta: "Nubank Débito",
      mesReferencia,
      fonte: `Importado NubankDébito`,
    });
  }
  return lancamentos;
}

/**
 * Extrato da conta Banco do Brasil em CSV:
 * "Data","Lançamento","Detalhes","N° documento","Valor","Tipo Lançamento".
 * O tipo ("Pix - Enviado") e o detalhe ("19/09 12:51 FULANO") vão juntos na
 * descrição. Linhas de saldo (valor 0,00) são descartadas pelo motor.
 */
export function parseExtratoBB(
  rows: string[][],
  conta: string,
  memoriaIA: Map<string, string>
): LancamentoImportado[] {
  const lancamentos: LancamentoImportado[] = [];

  for (const row of rows) {
    if (row.length < 5) continue;
    const data = parseDateBR(row[0] ?? "");
    if (!data) continue;
    const valor = parseValor(row[4] ?? "");
    if (isNaN(valor)) continue;

    const lancamento = (row[1] ?? "").trim();
    const detalhe = (row[2] ?? "").trim();
    const descricao = detalhe && !lancamento.toLowerCase().includes(detalhe.toLowerCase())
      ? `${lancamento} · ${detalhe}`
      : lancamento;

    const tipo: "Entrada" | "Saída" = valor >= 0 ? "Entrada" : "Saída";
    lancamentos.push({
      data,
      descricao,
      categoria: mapearCategoria(descricao, "", tipo, memoriaIA),
      valor,
      tipo,
      conta,
      mesReferencia: new Date(data.getFullYear(), data.getMonth(), 1),
      fonte: "Importado Banco do Brasil (CSV)",
    });
  }
  return lancamentos;
}
