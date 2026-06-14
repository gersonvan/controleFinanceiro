// Parser OFX (Open Financial Exchange) — formato bancário padrão.
// Vantagem sobre CSV: estruturado, sem necessidade de mapeamento de colunas.
// Suporta tanto OFX SGML (sem tags de fechamento) quanto OFX/XML.
import { mapearCategoria } from "../categorias";
import { LancamentoImportado, PerfilConfig } from "./tipos";

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

export function parseOFX(
  texto: string,
  perfil: PerfilConfig,
  memoriaIA: Map<string, string>,
  mesReferenciaManual: Date | null
): LancamentoImportado[] {
  const lancamentos: LancamentoImportado[] = [];

  // Cada transação é um bloco <STMTTRN>...</STMTTRN>
  const blocos = texto.match(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi) || [];

  for (const bloco of blocos) {
    const valorStr = tag(bloco, "TRNAMT");
    const valor = parseFloat(valorStr.replace(",", "."));
    if (isNaN(valor)) continue;

    const data = parseDataOFX(tag(bloco, "DTPOSTED"));
    if (!data) continue;

    // NAME é o título; MEMO costuma trazer mais detalhe. Usa o mais informativo.
    const name = tag(bloco, "NAME");
    const memo = tag(bloco, "MEMO");
    const descricao = (memo.length > name.length ? memo : name) || name || memo;
    if (!descricao) continue;

    const v = perfil.inverterSinal ? -valor : valor;
    const tipo: "Entrada" | "Saída" = v >= 0 ? "Entrada" : "Saída";
    const categoria = mapearCategoria(descricao, "", tipo, memoriaIA);

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
