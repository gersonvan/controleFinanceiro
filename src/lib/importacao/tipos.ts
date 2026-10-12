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

/**
 * Fatura de cartão: crédito não é renda. "PGTO DEBITO CONTA", "PAGAMENTO EFETUADO"
 * quitam a fatura anterior; o resto é estorno de compra. Só troca categoria vazia
 * ou de renda — Memória e histórico continuam valendo.
 */
export function categoriaNaFatura(descricao: string, valor: number, categoria: string): string {
  if (valor <= 0 || (categoria && categoria !== "Outras Entradas" && categoria !== "Transferência Recebida")) return categoria;
  return /\b(pgto|pagto|pagamento)\b/i.test(descricao) ? "Pagamento de Cartão de Crédito" : "Estorno";
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
  colParcela: number | null;
  colValor: number | null;
  colEntrada: number | null;
  colSaida: number | null;
  inverterSinal: boolean;
  // Descrição completa: coluna que complementa a descrição ("Detalhes" do BB:
  // "Transferência recebida" + "FULANO") e linhas sem data logo abaixo de um
  // lançamento que trazem o resto da descrição.
  colComplemento?: number | null;
  juntarLinhasSemData?: boolean;

  usaMesReferencia: boolean;
}

// Converte texto bruto de CSV em matriz de células, respeitando aspas.
export function parseCSV(text: string, delimitador: string): string[][] {
  const delim = delimitador === "\\t" ? "\t" : delimitador;
  const linhas: string[][] = [];
  let celulas: string[] = [];
  let atual = "";
  let dentroAspas = false;

  const concluirLinha = () => {
    if (celulas.length === 0 && atual.trim() === "") return;
    celulas.push(atual.trim());
    linhas.push(celulas);
    celulas = [];
    atual = "";
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (dentroAspas && text[i + 1] === '"') { atual += '"'; i++; }
      else dentroAspas = !dentroAspas;
    } else if (c === delim && !dentroAspas) {
      celulas.push(atual.trim());
      atual = "";
    } else if ((c === "\n" || c === "\r") && !dentroAspas) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      concluirLinha();
    } else {
      atual += c;
    }
  }

  concluirLinha();
  return linhas;
}

// Interpreta uma data em vários formatos comuns.
export function parseDataFlexivel(str: string, formato: string): Date | null {
  if (!str) return null;
  const s = str.trim().split(/[ T]/)[0]; // descarta hora se houver

  let dia: number, mes: number, ano: number;

  // "2026-01-16" é inequívoco: vale mesmo que o perfil diga DD/MM/AAAA
  // (um perfil com formato errado gerava datas de 2008 a 2016).
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    [ano, mes, dia] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (formato === "AAAA-MM-DD") {
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
  // Sem "rolagem": 31/02 ou dia 2026 não viram outra data, são inválidos.
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const d = new Date(ano, mes - 1, dia);
  if (isNaN(d.getTime()) || d.getMonth() !== mes - 1) return null;
  return d;
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
