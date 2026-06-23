// Tipos compartilhados do motor de importação flexível.
// O motor transforma um arquivo (CSV ou OFX) + um Perfil em LancamentoImportado[].

export interface LancamentoImportado {
  data: Date;
  descricao: string;
  categoria: string;
  valor: number; // positivo = entrada, negativo = saída
  tipo: "Entrada" | "Saída";
  conta: string;
  mesReferencia: Date;
  fonte: string;
}

// Espelha o model PerfilImportacao (campos usados pelo motor).
export interface PerfilConfig {
  nome: string;
  conta: string;
  formato: "csv" | "ofx" | "pdf";

  // CSV
  delimitador: string;
  linhasPular: number;
  formatoData: string;
  modoValor: "unica" | "separadas";
  colData: number | null;
  colDescricao: number | null;
  colValor: number | null;
  colEntrada: number | null;
  colSaida: number | null;
  inverterSinal: boolean;

  usaMesReferencia: boolean;
}

// Converte texto bruto de CSV em matriz de células, respeitando aspas.
export function parseCSV(text: string, delimitador: string): string[][] {
  const delim = delimitador === "\\t" ? "\t" : delimitador;
  const linhas: string[][] = [];

  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === "") continue;
    const celulas: string[] = [];
    let atual = "";
    let dentroAspas = false;

    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (c === '"') {
        if (dentroAspas && raw[i + 1] === '"') { atual += '"'; i++; }
        else dentroAspas = !dentroAspas;
      } else if (c === delim && !dentroAspas) {
        celulas.push(atual.trim());
        atual = "";
      } else {
        atual += c;
      }
    }
    celulas.push(atual.trim());
    linhas.push(celulas);
  }
  return linhas;
}

// Interpreta uma data em vários formatos comuns.
export function parseDataFlexivel(str: string, formato: string): Date | null {
  if (!str) return null;
  const s = str.trim().split(/[ T]/)[0]; // descarta hora se houver

  let dia: number, mes: number, ano: number;

  if (formato === "AAAA-MM-DD") {
    const p = s.split(/[-/]/).map(Number);
    [ano, mes, dia] = p;
  } else if (formato === "MM/DD/AAAA") {
    const p = s.split(/[/-]/).map(Number);
    [mes, dia, ano] = p;
  } else if (formato === "DD-MM-AAAA") {
    const p = s.split(/[-/]/).map(Number);
    [dia, mes, ano] = p;
  } else {
    // DD/MM/AAAA (padrão BR)
    const p = s.split(/[/-]/).map(Number);
    [dia, mes, ano] = p;
  }

  if (!dia || !mes || !ano || isNaN(dia) || isNaN(mes) || isNaN(ano)) return null;
  if (ano < 100) ano += 2000; // anos com 2 dígitos
  const d = new Date(ano, mes - 1, dia);
  return isNaN(d.getTime()) ? null : d;
}

// Converte string monetária ("1.234,56" ou "1234.56" ou "-50,00") em número.
export function parseValor(str: string): number {
  if (!str) return NaN;
  let s = str.trim().replace(/[R$\s]/g, "");
  // Se tem vírgula como separador decimal (padrão BR): remove pontos de milhar
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  return parseFloat(s);
}
