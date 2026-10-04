// Parser OFX (Open Financial Exchange) — formato bancário padrão.
// Vantagem sobre CSV: estruturado, sem necessidade de mapeamento de colunas.
// Suporta tanto OFX SGML (sem tags de fechamento) quanto OFX/XML.
import { mapearCategoria, type FonteMemoria } from "../categorias";
import { LancamentoImportado, PerfilConfig } from "./tipos";
import { ehOFXCartao } from "./detectar";

// Extrai o valor de uma tag, tolerando SGML (<TAG>valor) e XML (<TAG>valor</TAG>).
function tag(bloco: string, nome: string): string {
  const re = new RegExp(`<${nome}>([^<\\r\\n]*)`, "i");
  const m = bloco.match(re);
  return m ? m[1].trim() : "";
}

// OFX usa data YYYYMMDD com hora/timezone opcionais: 20240115120000[-03:EST]
function parseDataOFX(str: string): Date | null {
  if (!str || str.length < 8) return null;
  const ano = parseInt(str.slice(0, 4));
  const mes = parseInt(str.slice(4, 6));
  const dia = parseInt(str.slice(6, 8));
  if (!ano || !mes || !dia) return null;
  const d = new Date(ano, mes - 1, dia);
  return isNaN(d.getTime()) ? null : d;
}

// Extrai blocos de transação suportando tanto XML (com </STMTTRN>) quanto SGML puro (sem tags de fechamento).
// Bancos como Itaú, Bradesco e Santander exportam SGML onde cada <STMTTRN> abre um novo bloco.
function extrairBlocos(texto: string): string[] {
  // Tenta XML primeiro (mais confiável quando disponível)
  const xml = texto.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi);
  if (xml && xml.length > 0) return xml;

  // Fallback SGML: divide no abre-tag e trata cada pedaço como um bloco
  const partes = texto.split(/<STMTTRN>/i);
  return partes.slice(1).map((p) => `<STMTTRN>${p.split(/<STMTTRN>/i)[0]}`);
}

// Fatura do BB escreve a parcela como "LOJA PARC 02/12 CIDADE BR" ou só "LOJA 05/05 CIDADE BR";
// a Previsão reconhece "(02/12)". Só na fatura: no extrato de conta "NN/NN" costuma ser data.
export function marcarParcela(descricao: string): string {
  if (/\(\d{1,2}\/\d{1,2}\)|parcela \d/i.test(descricao)) return descricao;
  const valida = (a: string, b: string) => +a >= 1 && +b >= 2 && +a <= +b;
  const parc = descricao.match(/-?\s*\bPARC\.?\s*(\d{1,2})\/(\d{1,2})\b/i);
  // sem juntar espaços: a separação "LOJA   CIDADE   BR" é o que permite tirar a cidade da chave
  if (parc && valida(parc[1], parc[2])) return descricao.replace(parc[0], ` (${parc[1]}/${parc[2]})`).trim();
  const solta = descricao.match(/\s(\d{2})\/(\d{2})(?=\s)/);
  if (solta && valida(solta[1], solta[2])) return descricao.replace(solta[0], ` (${solta[1]}/${solta[2]})`).trim();
  return descricao;
}

export function parseOFX(
  texto: string,
  perfil: PerfilConfig,
  memoriaIA: FonteMemoria,
  mesReferenciaManual: Date | null
): LancamentoImportado[] {
  const lancamentos: LancamentoImportado[] = [];

  const blocos = extrairBlocos(texto);
  const fatura = ehOFXCartao(texto);

  for (const bloco of blocos) {
    const valorStr = tag(bloco, "TRNAMT");
    const valor = parseFloat(valorStr.replace(",", "."));
    if (isNaN(valor)) continue;

    const data = parseDataOFX(tag(bloco, "DTPOSTED"));
    if (!data) continue;

    // NAME é o título; MEMO costuma trazer mais detalhe. Usa o mais informativo.
    const name = tag(bloco, "NAME");
    const memo = tag(bloco, "MEMO");
    const original = (memo.length > name.length ? memo : name) || name || memo;
    if (!original) continue;
    const descricao = fatura ? marcarParcela(original) : original;

    const v = perfil.inverterSinal ? -valor : valor;
    const tipo: "Entrada" | "Saída" = v >= 0 ? "Entrada" : "Saída";
    let categoria = mapearCategoria(descricao, "", tipo, memoriaIA);
    // Fatura: crédito não é renda. "PGTO DEBITO CONTA", "PAGAMENTO EFETUADO" quitam a
    // fatura anterior; o resto é estorno de compra. Memória e histórico continuam valendo.
    if (fatura && v > 0 && (!categoria || categoria === "Outras Entradas" || categoria === "Transferência Recebida")) {
      categoria = /\b(pgto|pagto|pagamento)\b/i.test(descricao) ? "Pagamento de Cartão de Crédito" : "Estorno";
    }

    const mesReferencia = perfil.usaMesReferencia && mesReferenciaManual
      ? mesReferenciaManual
      : new Date(data.getFullYear(), data.getMonth(), 1);

    lancamentos.push({
      data,
      descricao,
      categoria,
      valor: v,
      tipo,
      conta: perfil.conta,
      mesReferencia,
      fonte: `Importado ${perfil.nome} (OFX)`,
    });
  }

  return lancamentos;
}
