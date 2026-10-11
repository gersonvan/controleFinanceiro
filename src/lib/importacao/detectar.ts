// Detecção automática de formato e banco a partir do conteúdo do arquivo.
// Usado na tela de Importação para dispensar escolha manual do perfil.

export type Papel = "" | "data" | "descricao" | "complemento" | "parcela" | "valor" | "entrada" | "saida";

const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function detectarPerfilCSV(texto: string): { builtinKey: string | null; nome: string } {
  const linhas = texto.split(/\r?\n/).filter((linha) => linha.trim());
  const normalizado = normalizar(linhas[0] ?? "");

  // Extrato da conta corrente C6: algumas linhas de cabeçalho da conta e depois
  // "Data Lançamento, Data Contábil, Título, Descrição, Entrada(R$), Saída(R$), Saldo".
  // Vai para o parser legado, que usa o detalhe nas compras no débito
  // (o título delas é só "DEBITO DE CARTAO").
  const extratoC6 = linhas.slice(0, 15).map(normalizar).some(
    (l) => l.includes("titulo") && l.includes("entrada") && l.includes("saida")
  );
  if (extratoC6) {
    return { builtinKey: "c6-debito", nome: "C6 — Extrato da Conta (CSV)" };
  }

  const campos = normalizado.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  // Banco do Brasil: "Data","Lançamento","Detalhes","N° documento","Valor","Tipo Lançamento"
  if (campos[0] === "data" && campos.includes("detalhes") && campos.includes("valor")
      && campos.some((c) => c.startsWith("tipo lan"))) {
    return { builtinKey: "bb-corrente-csv", nome: "Banco do Brasil — Corrente (CSV)" };
  }

  // Nubank: fatura do cartão "date,title,amount"; conta "Data,Valor,Identificador,Descrição".
  if (campos.join(",") === "date,title,amount") {
    return { builtinKey: "nubank-credito", nome: "Nubank — Fatura Cartão (CSV)" };
  }
  if (campos[0] === "data" && campos[1] === "valor" && campos[2] === "identificador" && campos[3] === "descricao") {
    return { builtinKey: "nubank-debito", nome: "Nubank — Extrato da Conta (CSV)" };
  }

  if (
    normalizado.includes("final do cartao") &&
    normalizado.includes("parcela") &&
    normalizado.includes("valor (em r$)")
  ) {
    return { builtinKey: "c6-cartao-csv", nome: "C6 — Fatura Cartão (CSV)" };
  }

  return { builtinKey: null, nome: "CSV não identificado" };
}

// Banco do OFX pelo código BACEN (FID) ou pelo nome (ORG). Cada banco tem um
// perfil de conta ("<banco>-corrente-ofx") e um de fatura ("<banco>-cartao-ofx").
const OFX_FID_MAP: Record<number, string> = {
  341: "itau", 237: "bradesco", 33: "santander", 1: "bb", 104: "caixa",
  77: "inter", 756: "sicoob", 748: "sicredi", 260: "nubank",
};

// Fragmento do ORG → banco (ordem importa: mais específico primeiro)
const OFX_ORG_MAP: [string, string][] = [
  ["nu pagamentos", "nubank"],
  ["nubank",        "nubank"],
  ["banco inter",   "inter"],
  ["inter bank",    "inter"],
  ["banco do brasil","bb"],
  ["itau",          "itau"],
  ["bradesco",      "bradesco"],
  ["santander",     "santander"],
  ["caixa econom",  "caixa"],
  ["sicoob",        "sicoob"],
  ["sicredi",       "sicredi"],
];

function tagValue(texto: string, tagName: string): string {
  const m = texto.match(new RegExp(`<${tagName}>([^<\r\n]*)`, "i"));
  return m ? m[1].trim() : "";
}

export function detectarFormato(texto: string, nomeArquivo: string): "ofx" | "csv" | "pdf" {
  const ext = nomeArquivo.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "pdf";
  // PDF magic bytes %PDF aparecem no início como texto latin1
  if (texto.startsWith("%PDF")) return "pdf";
  if (ext === "ofx") return "ofx";
  const topo = texto.slice(0, 600).toUpperCase();
  if (topo.includes("<OFX>") || topo.includes("<STMTTRN>") || topo.includes("OFXHEADER:")) return "ofx";
  return "csv";
}

/** OFX de cartão de crédito usa CREDITCARDMSGSRSV1/CCSTMTRS em vez de BANKMSGSRSV1/STMTRS. */
export function ehOFXCartao(texto: string): boolean {
  const t = texto.toUpperCase();
  return t.includes("<CREDITCARDMSGSRSV1>") || t.includes("<CCSTMTRS>");
}

function bancoDoOFX(fid: string, org: string): string | null {
  const codigo = parseInt(fid, 10); // "0001", "001" e "1" são o mesmo BB
  if (!isNaN(codigo) && OFX_FID_MAP[codigo]) return OFX_FID_MAP[codigo];
  const l = org.toLowerCase();
  return OFX_ORG_MAP.find(([padrao]) => l.includes(padrao))?.[1] ?? null;
}

export function detectarBancoOFX(texto: string): { builtinKey: string | null; orgName: string } {
  const fid = tagValue(texto, "FID");
  const org = tagValue(texto, "ORG");
  const banco = bancoDoOFX(fid, org);

  // Mesmo banco, arquivo de fatura: nunca tratar como conta corrente.
  if (ehOFXCartao(texto)) {
    return { builtinKey: banco ? `${banco}-cartao-ofx` : null, orgName: `${org || "Banco não identificado"} — fatura de cartão` };
  }
  return { builtinKey: banco ? `${banco}-corrente-ofx` : null, orgName: org || fid || "Banco não identificado" };
}

const PADROES_DATA = [
  /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,
  /^\d{4}-\d{2}-\d{2}/,
  /^\d{1,2}-\d{1,2}-\d{2,4}$/,
  /^\d{2}\.\d{2}\.\d{4}$/,
];
const pareceData = (v: string) => PADROES_DATA.some((p) => p.test(v.trim()));
const pareceNumero = (v: string) => /^-?[\d.,]+$/.test(v.replace(/[R$\s%]/g, "").replace(/^\((.+)\)$/, "-$1"));

/** Cabeçalho: a última linha pulada com ao menos duas células preenchidas (ou a primeira linha de dados). */
function cabecalho(linhas: string[][], linhasPular: number): string[] {
  for (let i = Math.min(linhasPular, linhas.length) - 1; i >= 0; i--) {
    if (linhas[i].filter((c) => c.trim()).length >= 2) return linhas[i];
  }
  return linhas[Math.min(linhasPular, Math.max(linhas.length - 1, 0))] ?? [];
}

// Heurística para pré-preencher papéis das colunas num CSV: o nome da coluna
// manda quando diz algo ("Crédito", "Débito", "Saldo", "Detalhes"…); senão,
// o conteúdo (datas, números, texto mais longo).
export function sugerirPapeis(linhas: string[][], linhasPular: number): Papel[] {
  const dados = linhas.slice(linhasPular);
  const numCols = Math.max(...linhas.map((r) => r.length), 0);
  const papeis: Papel[] = new Array(numCols).fill("") as Papel[];
  if (dados.length === 0) return papeis;

  const header = cabecalho(linhas, linhasPular).map((h) => normalizar(h ?? "").trim());
  const numericCol: number[] = [];
  let bestDescCol = -1;
  let bestDescAvg = 0;
  let descPeloNome = -1;
  let complemento = -1;
  let entrada = -1, saida = -1;

  for (let col = 0; col < numCols; col++) {
    const nome = header[col] ?? "";
    if (nome.includes("parcela")) { papeis[col] = "parcela"; continue; }
    if (/saldo|^doc|docto|documento|n[°ºo]\.? ?doc/.test(nome)) continue; // não é dado do lançamento

    const vals = dados.map((r) => (r[col] || "").trim()).filter(Boolean);
    if (vals.length === 0) continue;

    const dateScore = vals.filter(pareceData).length / vals.length;
    const numScore = vals.filter(pareceNumero).length / vals.length;
    const avgLen = vals.reduce((s, v) => s + v.length, 0) / vals.length;

    if (dateScore > 0.6 && !papeis.includes("data")) {
      papeis[col] = "data";
    } else if (numScore > 0.6) {
      if (/credito|entrada/.test(nome) && entrada < 0) entrada = col;
      else if (/debito|saida/.test(nome) && saida < 0) saida = col;
      else numericCol.push(col);
    } else if (/detalh|complement|favorecid|benefici|estabelec|observa/.test(nome)) {
      if (complemento < 0) complemento = col;
    } else {
      if (/histor|descri|lancamento|memo/.test(nome) && descPeloNome < 0) descPeloNome = col;
      if (avgLen > bestDescAvg && avgLen > 5) { bestDescAvg = avgLen; bestDescCol = col; }
    }
  }

  if (entrada >= 0 || saida >= 0) {
    if (entrada >= 0) papeis[entrada] = "entrada";
    if (saida >= 0) papeis[saida] = "saida";
  } else if (numericCol.length >= 2) {
    // 2 colunas numéricas → provavelmente Entrada/Saída separadas
    papeis[numericCol[0]] = "entrada";
    papeis[numericCol[1]] = "saida";
  } else if (numericCol.length === 1) {
    papeis[numericCol[0]] = "valor";
  }

  const desc = descPeloNome >= 0 ? descPeloNome : bestDescCol;
  if (desc >= 0) papeis[desc] = "descricao";
  if (complemento >= 0 && complemento !== desc) papeis[complemento] = "complemento";

  return papeis;
}

export interface ColunasPerfil {
  colData: number | null;
  colDescricao: number | null;
  colComplemento: number | null;
  colParcela: number | null;
  colValor: number | null;
  colEntrada: number | null;
  colSaida: number | null;
  modoValor: "unica" | "separadas";
}

/** Papéis escolhidos na tela → colunas do perfil. */
export function colunasDosPapeis(papeis: Papel[]): ColunasPerfil {
  const idx = (p: Papel) => { const i = papeis.indexOf(p); return i < 0 ? null : i; };
  const separadas = papeis.includes("entrada") || papeis.includes("saida");
  return {
    colData: idx("data"), colDescricao: idx("descricao"), colComplemento: idx("complemento"), colParcela: idx("parcela"),
    colValor: separadas ? null : idx("valor"), colEntrada: idx("entrada"), colSaida: idx("saida"),
    modoValor: separadas ? "separadas" : "unica",
  };
}

/** Colunas de um perfil salvo → papéis na tela (para editar com um arquivo de exemplo). */
export function papeisDoPerfil(p: Partial<ColunasPerfil>, nColunas: number): Papel[] {
  const papeis: Papel[] = new Array(nColunas).fill("") as Papel[];
  const separadas = p.modoValor === "separadas";
  const pares: [keyof ColunasPerfil, Papel, boolean][] = [
    ["colData", "data", true], ["colDescricao", "descricao", true], ["colComplemento", "complemento", true],
    ["colParcela", "parcela", true], ["colValor", "valor", !separadas], ["colEntrada", "entrada", separadas], ["colSaida", "saida", separadas],
  ];
  for (const [campo, papel, vale] of pares) {
    const i = p[campo];
    if (vale && typeof i === "number" && i >= 0 && i < nColunas) papeis[i] = papel;
  }
  return papeis;
}

/**
 * O arquivo traz a descrição em duas linhas? Linhas sem data, com texto e sem
 * valor, logo abaixo de um lançamento (o nome de quem recebeu o Pix, p. ex.).
 */
export function sugerirJuntarLinhas(linhas: string[][], linhasPular: number, papeis: Papel[]): boolean {
  const colData = papeis.indexOf("data");
  if (colData < 0) return false;
  const colsValor = papeis.map((p, i) => (p === "valor" || p === "entrada" || p === "saida" ? i : -1)).filter((i) => i >= 0);
  let datadas = 0, continuacoes = 0, anteriorDatada = false;
  for (const r of linhas.slice(linhasPular)) {
    if (pareceData(r[colData] ?? "")) { datadas++; anteriorDatada = true; continue; }
    const texto = r.some((c) => c.trim() && !pareceNumero(c.trim()));
    const valor = colsValor.some((i) => (r[i] ?? "").trim() !== "" && pareceNumero((r[i] ?? "").trim()));
    if (anteriorDatada && texto && !valor) continuacoes++;
    anteriorDatada = false;
  }
  return continuacoes >= 2 && continuacoes >= datadas * 0.2;
}
