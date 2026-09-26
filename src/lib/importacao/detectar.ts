// Detecção automática de formato e banco a partir do conteúdo do arquivo.
// Usado na tela de Importação para dispensar escolha manual do perfil.

export type Papel = "" | "data" | "descricao" | "parcela" | "valor" | "entrada" | "saida";

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
    return { builtinKey: "c6-debito", nome: "C6 Bank — Extrato Débito" };
  }

  // Nubank: fatura do cartão "date,title,amount"; conta "Data,Valor,Identificador,Descrição".
  const campos = normalizado.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  if (campos.join(",") === "date,title,amount") {
    return { builtinKey: "nubank-credito", nome: "Nubank — Fatura Crédito" };
  }
  if (campos[0] === "data" && campos[1] === "valor" && campos[2] === "identificador" && campos[3] === "descricao") {
    return { builtinKey: "nubank-debito", nome: "Nubank — Extrato Débito" };
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

// FID BACEN → builtin profile key
const OFX_FID_MAP: Record<string, string> = {
  "0341": "itau-corrente-ofx",
  "0237": "bradesco-corrente-ofx",
  "0033": "santander-corrente-ofx",
  "0001": "bb-corrente-ofx",
  "0104": "caixa-corrente-ofx",
  "0077": "inter-corrente-ofx",
  "0756": "sicoob-corrente-ofx",
  "0748": "sicredi-corrente-ofx",
};

// Fragmento do ORG → builtin key (ordem importa: mais específico primeiro)
const OFX_ORG_MAP: [string, string][] = [
  ["nu pagamentos", "nubank-corrente-ofx"],
  ["nubank",        "nubank-corrente-ofx"],
  ["banco inter",   "inter-corrente-ofx"],
  ["inter bank",    "inter-corrente-ofx"],
  ["banco do brasil","bb-corrente-ofx"],
  ["itau",          "itau-corrente-ofx"],
  ["bradesco",      "bradesco-corrente-ofx"],
  ["santander",     "santander-corrente-ofx"],
  ["caixa econom",  "caixa-corrente-ofx"],
  ["sicoob",        "sicoob-corrente-ofx"],
  ["sicredi",       "sicredi-corrente-ofx"],
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

// Faturas de cartão em OFX: só alguns bancos têm perfil próprio.
const OFX_CARTAO_MAP: [string, string][] = [
  ["nu pagamentos", "nubank-cartao-ofx"],
  ["nubank",        "nubank-cartao-ofx"],
];

/** OFX de cartão de crédito usa CREDITCARDMSGSRSV1/CCSTMTRS em vez de BANKMSGSRSV1/STMTRS. */
export function ehOFXCartao(texto: string): boolean {
  const t = texto.toUpperCase();
  return t.includes("<CREDITCARDMSGSRSV1>") || t.includes("<CCSTMTRS>");
}

export function detectarBancoOFX(texto: string): { builtinKey: string | null; orgName: string } {
  const fid = tagValue(texto, "FID");
  const org = tagValue(texto, "ORG");

  // Mesmo banco, arquivo de fatura: nunca tratar como conta corrente.
  if (ehOFXCartao(texto)) {
    const l = org.toLowerCase();
    const achado = OFX_CARTAO_MAP.find(([padrao]) => l.includes(padrao));
    return { builtinKey: achado?.[1] ?? null, orgName: `${org || "Banco não identificado"} — fatura de cartão` };
  }

  if (fid && OFX_FID_MAP[fid]) return { builtinKey: OFX_FID_MAP[fid], orgName: org || fid };

  if (org) {
    const l = org.toLowerCase();
    for (const [pattern, key] of OFX_ORG_MAP) {
      if (l.includes(pattern)) return { builtinKey: key, orgName: org };
    }
  }

  return { builtinKey: null, orgName: org || "Banco não identificado" };
}

// Heurística para pré-preencher papéis das colunas num CSV.
// Analisa as linhas de dados (após linhasPular) e classifica cada coluna.
export function sugerirPapeis(linhas: string[][], linhasPular: number): Papel[] {
  const dados = linhas.slice(linhasPular);
  const numCols = Math.max(...linhas.map((r) => r.length), 0);
  const papeis: Papel[] = new Array(numCols).fill("") as Papel[];
  if (dados.length === 0) return papeis;

  const datePatterns = [
    /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,
    /^\d{4}-\d{2}-\d{2}/,
    /^\d{1,2}-\d{1,2}-\d{2,4}$/,
    /^\d{2}\.\d{2}\.\d{4}$/,
  ];
  const header = linhas[Math.min(linhasPular, Math.max(linhas.length - 1, 0))] ?? [];
  const numericCol: number[] = [];
  let bestDescCol = -1;
  let bestDescAvg = 0;

  for (let col = 0; col < numCols; col++) {
    if ((header[col] ?? "").trim().toLowerCase().includes("parcela")) {
      papeis[col] = "parcela";
      continue;
    }
    const vals = dados.map((r) => (r[col] || "").trim()).filter(Boolean);
    if (vals.length === 0) continue;

    const dateScore = vals.filter((v) => datePatterns.some((p) => p.test(v))).length / vals.length;
    const cleaned = vals.map((v) => v.replace(/[R$\s%]/g, "").replace(/^\((.+)\)$/, "-$1"));
    const numScore = cleaned.filter((v) => /^-?[\d.,]+$/.test(v)).length / vals.length;
    const avgLen = vals.reduce((s, v) => s + v.length, 0) / vals.length;

    if (dateScore > 0.6 && !papeis.includes("data")) {
      papeis[col] = "data";
    } else if (numScore > 0.6) {
      numericCol.push(col);
    } else if (avgLen > bestDescAvg && avgLen > 5) {
      bestDescAvg = avgLen;
      bestDescCol = col;
    }
  }

  // 2 colunas numéricas → provavelmente Entrada/Saída separadas
  if (numericCol.length >= 2) {
    papeis[numericCol[0]] = "entrada";
    papeis[numericCol[1]] = "saida";
  } else if (numericCol.length === 1) {
    papeis[numericCol[0]] = "valor";
  }

  if (bestDescCol >= 0) papeis[bestDescCol] = "descricao";

  return papeis;
}
