import { ehNomeProprio } from "./nome-proprio";

export const CATEGORIAS = [
  // Receitas
  "Salário",
  "Receita de Aluguel",
  "Rendimento Investimentos",
  "Transferência Recebida",
  "Recebimento de Empréstimo",
  "Outras Entradas",
  "Estorno",
  "Reembolso", // Pix que devolve parte de um gasto ("Dividir"): abate o gasto; só a sobra é entrada (valorLiquido)
  // Moradia
  "Contas de Consumo",
  "Aluguel",
  "Prestação de Imóvel", // financiamento/prestação do imóvel próprio
  "Condomínio",
  "Casa: Manutenção e Móveis",
  "Serviços Domésticos",
  // Alimentação
  "Supermercado e Mercearia",
  "Restaurantes e Lanches",
  "Delivery e iFood",
  // Transporte
  "Transporte por App",
  "Automóvel",
  "Viagem",
  // Saúde
  "Consultas e Terapias",
  "Academia e Bem-estar",
  "Farmácia",
  "Plano de Saúde",
  // Educação
  "Mensalidades e Cursos",
  // Pessoal e Lazer
  "Compras",
  "Lazer e Entretenimento",
  "Assinaturas Digitais",
  "Gastos de Terceiros",
  "Cuidados Pessoais",
  "Presentes",
  "Pets",
  // Empréstimos
  "Empréstimo",
  // Financeiro e Transferências
  "Pagamento de Cartão de Crédito",
  "Investimentos (Aportes)",
  "Pagamento de Empréstimos", // quitar dívida sua: empréstimo na previdência, consignado, financiamento, crédito pessoal
  "Compra e Venda de Bens", // imóvel, carro…: patrimônio mudando de forma, com os custos da operação (comissão, ITBI, cartório)
  "Taxas e Anuidades",
  "Impostos e Tributos",
  "Seguros",
  "Transferência para Terceiros",
  "Transferência entre Contas",
  // Empresa
  "Empresa (PJ)",
] as const;

export type Categoria = (typeof CATEGORIAS)[number];

/**
 * Categorias agrupadas por tema, na ordem em que aparecem nos seletores.
 * Toda categoria de CATEGORIAS está em exatamente um grupo (há teste).
 */
export const GRUPOS_CATEGORIAS: { grupo: string; categorias: Categoria[] }[] = [
  { grupo: "Entradas", categorias: ["Salário", "Outras Entradas", "Transferência Recebida", "Rendimento Investimentos", "Receita de Aluguel", "Recebimento de Empréstimo", "Estorno", "Reembolso"] },
  { grupo: "Moradia", categorias: ["Aluguel", "Prestação de Imóvel", "Condomínio", "Contas de Consumo", "Casa: Manutenção e Móveis", "Serviços Domésticos"] },
  { grupo: "Alimentação", categorias: ["Supermercado e Mercearia", "Restaurantes e Lanches", "Delivery e iFood"] },
  { grupo: "Transporte", categorias: ["Transporte por App", "Automóvel", "Viagem"] },
  { grupo: "Saúde", categorias: ["Plano de Saúde", "Consultas e Terapias", "Farmácia", "Academia e Bem-estar"] },
  { grupo: "Educação", categorias: ["Mensalidades e Cursos"] },
  { grupo: "Pessoal e Lazer", categorias: ["Compras", "Lazer e Entretenimento", "Assinaturas Digitais", "Cuidados Pessoais", "Presentes", "Pets"] },
  { grupo: "Financeiro", categorias: ["Taxas e Anuidades", "Impostos e Tributos", "Seguros", "Investimentos (Aportes)", "Compra e Venda de Bens", "Empréstimo", "Pagamento de Empréstimos"] },
  { grupo: "Transferências", categorias: ["Transferência para Terceiros", "Transferência entre Contas", "Pagamento de Cartão de Crédito", "Gastos de Terceiros"] },
  { grupo: "Empresa", categorias: ["Empresa (PJ)"] },
];

export const CATEGORIAS_RECEITA = [
  "Salário",
  "Receita de Aluguel",
  "Rendimento Investimentos",
  "Transferência Recebida",
  "Outras Entradas",
  "Estorno",
];

/** Categorias de entrada (receitas), em ordem alfabética */
export const CATEGORIAS_ENTRADA = [
  "Estorno",
  "Outras Entradas",
  "Receita de Aluguel",
  "Recebimento de Empréstimo",
  "Reembolso",
  "Rendimento Investimentos",
  "Salário",
  "Transferência Recebida",
];

/** Categorias de saída (despesas), em ordem alfabética */
export const CATEGORIAS_SAIDA = [
  "Academia e Bem-estar",
  "Aluguel",
  "Assinaturas Digitais",
  "Automóvel",
  "Casa: Manutenção e Móveis",
  "Compra e Venda de Bens",
  "Compras",
  "Condomínio",
  "Consultas e Terapias",
  "Contas de Consumo",
  "Cuidados Pessoais",
  "Delivery e iFood",
  "Empresa (PJ)",
  "Empréstimo",
  "Farmácia",
  "Gastos de Terceiros",
  "Impostos e Tributos",
  "Investimentos (Aportes)",
  "Lazer e Entretenimento",
  "Mensalidades e Cursos",
  "Pagamento de Cartão de Crédito",
  "Pagamento de Empréstimos",
  "Pets",
  "Plano de Saúde",
  "Prestação de Imóvel",
  "Presentes",
  "Restaurantes e Lanches",
  "Seguros",
  "Serviços Domésticos",
  "Supermercado e Mercearia",
  "Taxas e Anuidades",
  "Transferência entre Contas",
  "Transferência para Terceiros",
  "Transporte por App",
  "Viagem",
];

/** Categorias que pertencem ao módulo de empréstimos */
export const CATEGORIAS_EMPRESTIMO = ["Empréstimo", "Recebimento de Empréstimo"] as const;

export const CATEGORIAS_FIXAS = [
  "Aluguel",
  "Prestação de Imóvel",
  "Assinaturas Digitais",
  "Condomínio",
  "Contas de Consumo",
  "Mensalidades e Cursos",
  "Consultas e Terapias",
  "Academia e Bem-estar",
  "Plano de Saúde",
  "Pets",
];

/**
 * Fora das finanças pessoais: movimentações internas (pagamento da fatura,
 * transferência entre contas próprias), gastos de terceiros e despesas da
 * empresa. Excluídas dos totais do dashboard, do resumo e do Planejado ×
 * Realizado; continuam visíveis em Lançamentos e na Matriz.
 */
export const CATEGORIAS_NEUTRAS = new Set<string>([
  "Compra e Venda de Bens", // venda de imóvel/carro e custos da operação não são renda nem gasto do mês
  "Pagamento de Cartão de Crédito",
  "Transferência entre Contas",
  "Gastos de Terceiros",
  "Empresa (PJ)",
]);

const MESES_ABREV = "jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez";

/**
 * Chave da Memória Local: a descrição sem as partes que mudam a cada compra —
 * data e hora ("99* POP 25Set 13h37min", "19/09 12:51"), número de parcela
 * ("Parcela 3/4", "(2/10)"), espaços e maiúsculas. Assim uma regra aprendida
 * para uma corrida do 99 vale para todas. Também tira o que muda só por causa
 * do banco ou do formato, para o mesmo estabelecimento cair na mesma chave:
 * cidade e país do extrato C6 ("LOJA   FORTALEZA     BRA", largura fixa
 * 22 + 13) e os "Pix no Crédito - ", "Compra no débito - " e " - NuPay" do Nubank.
 */
export function chaveMemoria(descricao: string): string {
  return descricao
    .replace(/^(.{22}) .{13} BRA\s*$/, "$1")                              // C6: estabelecimento + cidade + BRA
    .toLowerCase()
    .replace(/^(pix no cr[eé]dito|compra no d[eé]bito)\s+-\s+/, "")       // Nubank
    .replace(/\s+-\s+nupay\b/, " ")
    .replace(new RegExp(`\\b\\d{1,2}(${MESES_ABREV})\\b`, "g"), " ")   // 25set
    .replace(/\b\d{1,2}h\d{2}(min)?\b/g, " ")                              // 13h37min
    .replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, " ")                   // 19/09, 19/09/2026, parcela 3/4
    .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, " ")                          // 12:51
    .replace(/\(\s*\)|\bparcela\b/g, " ")                                   // "( )" e "parcela" que sobraram
    .replace(/\s+/g, " ")
    .replace(/[\s·-]+$/, "")                                               // "amazon br vi -" → "amazon br vi"
    .trim();
}

/** Memória explícita (regras salvas) e histórico do que o usuário já categorizou. */
export interface MemoriaCategorizacao {
  memoria: Map<string, string>;
  /** chave = `${tipo}|${chaveMemoria(descricao)}` — ver montarHistorico */
  historico?: Map<string, string>;
  /** nome completo do usuário, para reconhecer Pix/TED entre contas dele (ver nome-proprio.ts) */
  nomeCompleto?: string;
}
/** Só a Memória (Map) ou Memória + histórico. */
export type FonteMemoria = Map<string, string> | MemoriaCategorizacao;
export type OrigemCategoria = "memoria" | "historico" | "regra";

// O coringa das regras ("Pix enviado para …") não é uma escolha do usuário:
// conta no total do histórico, mas nunca é sugerido por ele.
const FORA_DO_HISTORICO = new Set(["Transferência para Terceiros"]);
const PARTICIPACAO_MINIMA_HISTORICO = 0.75;

export const chaveHistorico = (tipo: string, descricao: string) => `${tipo}|${chaveMemoria(descricao)}`;

/**
 * Histórico → categoria por estabelecimento: vale quando a mesma chave recebeu
 * a mesma categoria em pelo menos 75% das vezes (entrada e saída separadas).
 */
export function montarHistorico(
  linhas: { descricao: string; tipo: string; categoria: string | null; n?: number }[],
): Map<string, string> {
  const porChave = new Map<string, Map<string, number>>();
  for (const l of linhas) {
    if (!l.categoria) continue;
    const chave = chaveHistorico(l.tipo, l.descricao);
    if (chave.length - l.tipo.length - 1 < 4) continue; // chave curta demais para dizer algo
    const cats = porChave.get(chave) ?? new Map<string, number>();
    cats.set(l.categoria, (cats.get(l.categoria) ?? 0) + (l.n ?? 1));
    porChave.set(chave, cats);
  }
  const historico = new Map<string, string>();
  for (const [chave, cats] of porChave) {
    const total = [...cats.values()].reduce((a, b) => a + b, 0);
    const [categoria, n] = [...cats.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!FORA_DO_HISTORICO.has(categoria) && n / total >= PARTICIPACAO_MINIMA_HISTORICO) historico.set(chave, categoria);
  }
  return historico;
}

/** Delivery vence o histórico: é separado de Restaurantes por escolha do usuário. */
function ehDelivery(d: string): boolean {
  if (d.includes("ifood club")) return false; // assinatura
  return d.includes("delivery") || d.includes("ifd*") || d.includes("rappi") || d.includes("ifood");
}

/**
 * Ordem: Memória Local → delivery → histórico → regras. Devolve também de onde
 * veio a categoria, para a tela de categorização contar cada fonte.
 */
export function categorizarComOrigem(
  descricao: string,
  categoriaOriginal: string,
  tipo: string,
  fonte?: FonteMemoria,
): { categoria: string; origem: OrigemCategoria | null } {
  const { memoria, historico, nomeCompleto } = fonte instanceof Map ? { memoria: fonte, historico: undefined, nomeCompleto: undefined } : fonte ?? {};
  const chave = chaveMemoria(descricao);
  if (memoria?.has(chave)) return { categoria: memoria.get(chave)!, origem: "memoria" };

  const d = descricao.toLowerCase();
  if (tipo !== "Entrada" && ehDelivery(d)) return { categoria: "Delivery e iFood", origem: "regra" };

  const h = historico?.get(chaveHistorico(tipo, descricao));
  if (h) return { categoria: h, origem: "historico" };

  const categoria = ehNomeProprio(descricao, nomeCompleto) ? "Transferência entre Contas" : regras(d, categoriaOriginal, tipo);
  return { categoria, origem: categoria ? "regra" : null };
}

export function mapearCategoria(
  descricao: string,
  categoriaOriginal: string,
  tipo: string,
  memoriaIA?: FonteMemoria
): string {
  return categorizarComOrigem(descricao, categoriaOriginal, tipo, memoriaIA).categoria;
}

/** Regras fixas por padrão de texto (d = descrição em minúsculas). */
function regras(d: string, categoriaOriginal: string, tipo: string): string {
  // Prioridade 1: transferências entre contas próprias. As com o nome do usuário
  // são vistas antes, em categorizarComOrigem (ehNomeProprio); aqui fica a aplicação
  // automática "BB Rende Fácil", que entra e sai da conta sozinha.
  if (d.includes("bb rende f"))
    return "Transferência entre Contas";

  // Prioridade 2: pagamento de fatura do cartão (aparece como Entrada no extrato
  // do cartão, mas NÃO é receita — é liquidação da fatura)
  if (
    d === "pagamento recebido" || // fatura Nubank: é o pagamento do próprio cartão
    d.includes("pag fatura boleto") ||
    d.includes("pagamento de fatura boleto") ||
    d.includes("pgto fat cartao") ||
    d.includes("pagamento fatura cartao") ||
    /^fatura (paga|itau)\b/.test(d) // extrato Itaú: "FATURA PAGA Itau Uniclass", "FATURA ITAU UNICLASS MC"
  )
    return "Pagamento de Cartão de Crédito";

  if (tipo === "Entrada") {
    // resgate de aplicação: dinheiro guardado voltando — abate o "Guardado", não é renda
    if (/resgate.*(investimento|cdb|rdb|lci|lca|tesouro)/.test(d)) return "Investimentos (Aportes)";
    if (d.includes("recebimento salario") || /^(remuneracao\/salario|pagto salario)\b/.test(d)) return "Salário";
    if (d.startsWith("rend pago aplic")) return "Rendimento Investimentos"; // Itaú: aplicação automática
    if (d.startsWith("dev pix") || d.startsWith("cancelamento de compra") || d.startsWith("estorno")) return "Estorno";
    if (d.includes("imobiliaria") || d.includes("imobiliária")) return "Receita de Aluguel"; // repasse de aluguel
    if (d.includes("transferência de saldo nuinvest"))
      return "Rendimento Investimentos";
    if (d.includes("pix recebido") || d.includes("transferência recebida") || d.startsWith("pix transf"))
      return "Transferência Recebida";
    return categoriaOriginal || "Outras Entradas";
  }

  // Assinaturas Digitais (antes de Delivery para ifood club não cair na regra ifd*)
  if (
    d.includes("ifood club") ||
    d.includes("melimais") ||
    d.includes("hbomaxcom") ||
    d.includes("helpmax") ||
    d.includes("chatgpt") ||
    d.includes("openai") ||
    d.includes("anthropic") ||
    d.includes("claude.ai") ||
    d.includes("linkedin") ||
    d.includes("github") ||
    d.includes("google one") ||
    d.includes("scribd") ||
    d.includes("locaweb") ||
    d.includes("netflix") ||
    d.includes("spotify") ||
    d.includes("disney") ||
    d.includes("amazon prime") ||
    d.includes("amazonprime") ||
    d.includes("prime video") ||
    (d.includes("microsoft") && !d.includes("banco")) ||
    d.includes("ppro *")
  )
    return "Assinaturas Digitais";

  // Moradia
  if (d.includes("enel") || d.includes("brisanet")) return "Contas de Consumo";
  // operadoras: "Pix enviado para TIM S A", "TIM SA", "CLARO S.A.", "TELEFONICA BRASIL" (Vivo)
  if (/\b(tim s\.? ?a|claro s\.? ?a|telefonica|vivo (fibra|s\.? ?a)|oi s\.? ?a)\b/.test(d)) return "Contas de Consumo";
  if (d.includes("his emp imobiliarios ltda")) return "Aluguel";
  if (/(caixa\W+habitac|habitacional|prestac[aã]o (do )?(im[oó]vel|apartamento|apto)|financiamento imobili)/.test(d)) return "Prestação de Imóvel";
  // compra/venda de imóvel: ITBI, registro, vistoria da Caixa, sinal/comissão do compra e venda
  if (/(\bitbi\b|registro de im[oó]veis|caixa economica federal - engenharia|sinal cv|comiss[aã]o apartamento)/.test(d)) return "Compra e Venda de Bens";
  if (d.includes("edificio livorno")) return "Condomínio";
  if (d.includes("normatel")) return "Casa: Manutenção e Móveis";
  if (d.includes("deliane alves do nascimento")) return "Serviços Domésticos";

  // Alimentação
  if (
    d.includes("superm") ||
    d.includes("super sao luiz") ||
    d.includes("atacad") ||
    d.includes("assai") ||
    d.includes("sams club") ||
    d.includes("carrefour") ||
    d.includes("pao de acucar") ||
    d.includes("mercadinho") ||
    d.includes("mercearia") ||
    d.includes("hortifruti")
  )
    return "Supermercado e Mercearia";
  if (
    d.includes("kina do feijao verde") ||
    d.includes("divino vagao") ||
    d.includes("art pao") ||
    d.includes("natura suco") ||
    d.includes("star midia e cafe") ||
    d.includes("milky moo") ||
    /(restaurante|pizza|churrascaria|hamburg|burger|sushi|lanchonete|pastelaria|sorveteria|cafeteria)/.test(d)
  )
    return "Restaurantes e Lanches";

  // Transporte
  // empresas conhecidas pelo nome jurídico (aparecem assim em Pix)
  if (/\bzamp\b/.test(d)) return "Restaurantes e Lanches";         // operadora do Burger King
  if (d.includes("vibra energia")) return "Automóvel";               // postos (ex-BR Distribuidora)
  if (d.includes("bolsaki")) return "Mensalidades e Cursos";
  // 99 na fatura do C6 vem sem o "99*": "POP 13AGO 17H41MIN"
  if (/^pop \d{1,2}[a-z]{3} \d{1,2}h\d{2}min/.test(d)) return "Transporte por App";
  if (d.includes("uber") || d.includes("99 ride") || d.startsWith("99* pop") || d.startsWith("99*pop") || d.includes("99app") || d.includes("99 tecnologia"))
    return "Transporte por App";
  if (
    d.includes("c6tag") ||
    d.includes("estacio") || // o nome vem cortado: "ANCAR NORDESTE ESTACIO"
    /(parkfor|repark|parking|estapar|zona azul)/.test(d) || // PARKFOR, MP *NONREPARK
    d.includes("relacionados a automotivo")
  )
    return "Automóvel";

  // Saúde
  if (d.includes("unimed") || d.includes("hapvida") || d.includes("amil") || d.includes("bradesco saude"))
    return "Plano de Saúde";
  if (d.includes("narjara") || d.includes("correia e duete servicos medicos ltda"))
    return "Consultas e Terapias";
  if (d.includes("stark") || d.includes("wellhub")) return "Academia e Bem-estar";
  if (/(rd saude|drogasil|droga ?raia|drogaria|farmacia|farmácia|pague menos|extrafarma|panvel)/.test(d)) return "Farmácia";

  // Educação
  if (d.includes("n b educacao infantil") || d.includes("ungposservicos"))
    return "Mensalidades e Cursos";

  // Pessoal e Lazer
  if (d.includes("petz") || d.includes("cobasi") || d.includes("pet shop") || d.includes("petlove"))
    return "Pets";
  if (d.includes("barbearia") || d.includes("salao de beleza") || d.includes("salão de beleza"))
    return "Cuidados Pessoais";
  if (
    d.includes("temu") ||
    d.includes("vestuário") ||
    d.includes("mercadolivre") ||
    d.includes("amazon") ||
    d.includes("shopee") ||
    d.includes("shein") ||
    d.includes("aliexpress") ||
    d.includes("magalu")
  )
    return "Compras";
  if (d.includes("entretenimento")) return "Lazer e Entretenimento";

  // Empresa (antes de Impostos: "simples nacional" não é tributo pessoal)
  if (
    d.includes("contador") ||
    d.includes("contabil") ||
    d.includes("contábil") ||
    d.includes("endereço fiscal") ||
    d.includes("endereco fiscal") ||
    d.includes("simples nacional") ||
    d.includes("coworking") ||
    d.includes("certificado digital") ||
    d.includes("junta comercial") ||
    d.includes("pgdas")
  )
    return "Empresa (PJ)";

  // Impostos
  if (d.includes("ipva") || d.includes("iptu") || d.includes("darf") || d.includes("sefaz") ||
      d.includes("prefeitura") || d.includes("*pref")) // "BR1*PREFFORTALEZA"
    return "Impostos e Tributos";

  // Financeiro
  if (
    d.includes("banco ibi s a") ||
    d.includes("pagamento efetuado") ||
    d.includes("pagamento de fatura") ||
    d.includes("banco c6 s.a.") ||
    d.includes("banco bradescard s a") ||
    d.includes("pgto fat cartao c6")
  )
    return "Pagamento de Cartão de Crédito";
  // quitação de dívida própria (≠ "Empréstimo", que é dinheiro emprestado a alguém)
  if (/(soc\.? ?cred\.? ?financ|consignad|empr[eé]stimo pessoal|cr[eé]dito pessoal)/.test(d)) return "Pagamento de Empréstimos";
  if (d.includes("compra de ações") || d.includes("aplicação rdb") || d.includes("aplicacao rdb") ||
      /aplica[cç][aã]o.*(investimento|cdb|lci|lca|tesouro)/.test(d))
    return "Investimentos (Aportes)";
  if (
    d.includes("anuidade diferenciada") ||
    d.includes("iof") ||
    d.includes("juros cheque esp") ||
    d.includes("por fatura atrasada") ||
    d.includes("encargos") ||
    d.includes("multa contratual") ||
    d.includes("juros de mora")
  )
    return "Taxas e Anuidades";
  if (d.includes("seguro") || d.includes("seg vida")) return "Seguros";
  // GPS = guia do INSS ("PAGAMENTO TRIBUTO GPS", "INT /GPS 0109…")
  if (/\btributo gps\b|^int \/gps\b/.test(d)) return "Impostos e Tributos";
  // mensagem do Pix diz para que foi: "Pix enviado para FULANO · Emprestimo"
  if (d.includes("pix") && /· .*\bempr[eé]stimo\b/.test(d)) return "Empréstimo";
  if (
    d.includes("pix enviado para") ||
    d.includes("pix enviada para") || // "Recorrência Pix enviada para …"
    d.startsWith("pix transf") || // Itaú: "PIX TRANSF FULANO 25/09" (Pix por QR code, "PIX QRS", é compra)
    d.includes("transferência enviada")
  )
    return "Transferência para Terceiros";

  return "";
}
