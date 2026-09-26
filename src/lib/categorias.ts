export const CATEGORIAS = [
  // Receitas
  "Salário",
  "Receita de Aluguel",
  "Rendimento Investimentos",
  "Transferência Recebida",
  "Recebimento de Empréstimo",
  "Outras Entradas",
  "Estorno",
  // Moradia
  "Contas de Consumo",
  "Aluguel",
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
  { grupo: "Entradas", categorias: ["Salário", "Outras Entradas", "Transferência Recebida", "Rendimento Investimentos", "Receita de Aluguel", "Recebimento de Empréstimo", "Estorno"] },
  { grupo: "Moradia", categorias: ["Aluguel", "Condomínio", "Contas de Consumo", "Casa: Manutenção e Móveis", "Serviços Domésticos"] },
  { grupo: "Alimentação", categorias: ["Supermercado e Mercearia", "Restaurantes e Lanches", "Delivery e iFood"] },
  { grupo: "Transporte", categorias: ["Transporte por App", "Automóvel", "Viagem"] },
  { grupo: "Saúde", categorias: ["Plano de Saúde", "Consultas e Terapias", "Farmácia", "Academia e Bem-estar"] },
  { grupo: "Educação", categorias: ["Mensalidades e Cursos"] },
  { grupo: "Pessoal e Lazer", categorias: ["Compras", "Lazer e Entretenimento", "Assinaturas Digitais", "Cuidados Pessoais", "Presentes", "Pets"] },
  { grupo: "Financeiro", categorias: ["Taxas e Anuidades", "Impostos e Tributos", "Seguros", "Investimentos (Aportes)", "Empréstimo"] },
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
  "Pets",
  "Plano de Saúde",
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
  "Pagamento de Cartão de Crédito",
  "Transferência entre Contas",
  "Gastos de Terceiros",
  "Empresa (PJ)",
]);

// Pix entre contas do próprio Gerson (os bancos grafam o nome de vários jeitos).
const NOMES_PROPRIOS = [
  "gerson neto",
  "gerson albuquerque",
  "gerson vieira alb", // o BB corta o nome: "GERSON VIEIRA ALB"
  "gerson v albuquerque",
];

export function mapearCategoria(
  descricao: string,
  categoriaOriginal: string,
  tipo: string,
  memoriaIA?: Map<string, string>
): string {
  const d = descricao.toLowerCase();

  // Prioridade 0: Memória da IA
  if (memoriaIA?.has(d)) return memoriaIA.get(d)!;

  // Prioridade 1: transferências entre contas próprias (inclui a aplicação
  // automática "BB Rende Fácil", que entra e sai da conta sozinha)
  if (NOMES_PROPRIOS.some((nome) => d.includes(nome)) || d.includes("bb rende f"))
    return "Transferência entre Contas";

  // Prioridade 2: pagamento de fatura do cartão (aparece como Entrada no extrato
  // do cartão, mas NÃO é receita — é liquidação da fatura)
  if (
    d === "pagamento recebido" || // fatura Nubank: é o pagamento do próprio cartão
    d.includes("pag fatura boleto") ||
    d.includes("pagamento de fatura boleto") ||
    d.includes("pgto fat cartao") ||
    d.includes("pagamento fatura cartao")
  )
    return "Pagamento de Cartão de Crédito";

  if (tipo === "Entrada") {
    if (d.includes("recebimento salario")) return "Salário";
    if (d.includes("reserve imobiliaria")) return "Receita de Aluguel";
    if (d.includes("transferência de saldo nuinvest"))
      return "Rendimento Investimentos";
    if (d.includes("pix recebido") || d.includes("transferência recebida"))
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
    (d.includes("microsoft") && !d.includes("banco")) ||
    d.includes("ppro *")
  )
    return "Assinaturas Digitais";

  // Moradia
  if (d.includes("enel") || d.includes("brisanet")) return "Contas de Consumo";
  if (d.includes("his emp imobiliarios ltda")) return "Aluguel";
  if (d.includes("edificio livorno")) return "Condomínio";
  if (d.includes("normatel")) return "Casa: Manutenção e Móveis";
  if (d.includes("deliane alves do nascimento")) return "Serviços Domésticos";

  // Alimentação
  if (d.includes("superm") || d.includes("super sao luiz"))
    return "Supermercado e Mercearia";
  if (
    d.includes("kina do feijao verde") ||
    d.includes("divino vagao") ||
    d.includes("art pao") ||
    d.includes("natura suco") ||
    d.includes("star midia e cafe") ||
    d.includes("milky moo")
  )
    return "Restaurantes e Lanches";
  if (
    d.includes("ifd*") ||
    d.includes("rappi") ||
    d.includes("ifood com agencia de restaurantes online s a")
  )
    return "Delivery e iFood";

  // Transporte
  if (d.includes("uber") || d.includes("99 ride")) return "Transporte por App";
  if (
    d.includes("c6tag") ||
    d.includes("estacionamento") ||
    d.includes("relacionados a automotivo")
  )
    return "Automóvel";

  // Saúde
  if (d.includes("unimed") || d.includes("hapvida") || d.includes("amil") || d.includes("bradesco saude"))
    return "Plano de Saúde";
  if (d.includes("narjara") || d.includes("correia e duete servicos medicos ltda"))
    return "Consultas e Terapias";
  if (d.includes("stark") || d.includes("wellhub")) return "Academia e Bem-estar";
  if (d.includes("rd saude") || d.includes("raia drogasil s a")) return "Farmácia";

  // Educação
  if (d.includes("n b educacao infantil") || d.includes("ungposservicos"))
    return "Mensalidades e Cursos";

  // Pessoal e Lazer
  if (d.includes("petz") || d.includes("cobasi") || d.includes("pet shop") || d.includes("petlove"))
    return "Pets";
  if (d.includes("barbearia") || d.includes("salao de beleza") || d.includes("salão de beleza"))
    return "Cuidados Pessoais";
  if (d.includes("temu") || d.includes("vestuário")) return "Compras";
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
  if (d.includes("ipva") || d.includes("iptu") || d.includes("darf") || d.includes("sefaz"))
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
  if (d.includes("compra de ações")) return "Investimentos (Aportes)";
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
  if (d.includes("seguro")) return "Seguros";
  if (
    d.includes("agência: 1956") ||
    d.includes("pix enviado para") ||
    d.includes("transferência enviada")
  )
    return "Transferência para Terceiros";

  return "";
}
