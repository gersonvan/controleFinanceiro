export const CATEGORIAS = [
  // Receitas
  "Salário",
  "Receita de Aluguel",
  "Rendimento Investimentos",
  "Transferência Recebida",
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
  // Educação
  "Mensalidades e Cursos",
  // Pessoal e Lazer
  "Compras",
  "Lazer e Entretenimento",
  // Financeiro e Transferências
  "Pagamento de Cartão de Crédito",
  "Investimentos (Aportes)",
  "Pagamento de Empréstimo",
  "Taxas e Anuidades",
  "Seguros",
  "Transferência para Terceiros",
  "Transferência entre Contas",
] as const;

export type Categoria = (typeof CATEGORIAS)[number];

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
  "Rendimento Investimentos",
  "Salário",
  "Transferência Recebida",
];

/** Categorias de saída (despesas), em ordem alfabética */
export const CATEGORIAS_SAIDA = [
  "Academia e Bem-estar",
  "Aluguel",
  "Automóvel",
  "Casa: Manutenção e Móveis",
  "Compras",
  "Condomínio",
  "Consultas e Terapias",
  "Contas de Consumo",
  "Delivery e iFood",
  "Farmácia",
  "Investimentos (Aportes)",
  "Lazer e Entretenimento",
  "Mensalidades e Cursos",
  "Pagamento de Cartão de Crédito",
  "Pagamento de Empréstimo",
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

export const CATEGORIAS_FIXAS = [
  "Aluguel",
  "Condomínio",
  "Contas de Consumo",
  "Mensalidades e Cursos",
  "Consultas e Terapias",
  "Academia e Bem-estar",
];

const NOMES_PROPRIOS = ["gerson neto", "gerson albuquerque"];

export function mapearCategoria(
  descricao: string,
  categoriaOriginal: string,
  tipo: string,
  memoriaIA?: Map<string, string>
): string {
  const d = descricao.toLowerCase();

  // Prioridade 0: Memória da IA
  if (memoriaIA?.has(d)) return memoriaIA.get(d)!;

  // Prioridade 1: transferências entre contas próprias
  if (NOMES_PROPRIOS.some((nome) => d.includes(nome)))
    return "Transferência entre Contas";

  if (tipo === "Entrada") {
    if (d.includes("recebimento salario")) return "Salário";
    if (d.includes("reserve imobiliaria")) return "Receita de Aluguel";
    if (d.includes("transferência de saldo nuinvest"))
      return "Rendimento Investimentos";
    if (d.includes("pix recebido") || d.includes("transferência recebida"))
      return "Transferência Recebida";
    return categoriaOriginal || "Outras Entradas";
  }

  // Educação (antes das regras de moradia para evitar falso-positivo)
  if (d.includes("melimais")) return "Mensalidades e Cursos";

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
  if (d.includes("narjara") || d.includes("correia e duete servicos medicos ltda"))
    return "Consultas e Terapias";
  if (d.includes("stark") || d.includes("wellhub")) return "Academia e Bem-estar";
  if (d.includes("rd saude") || d.includes("raia drogasil s a")) return "Farmácia";

  // Educação
  if (d.includes("n b educacao infantil") || d.includes("ungposservicos"))
    return "Mensalidades e Cursos";

  // Pessoal e Lazer
  if (d.includes("temu") || d.includes("vestuário")) return "Compras";
  if (d.includes("entretenimento")) return "Lazer e Entretenimento";

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
  if (d.includes("credito refinanciamento")) return "Pagamento de Empréstimo";
  if (
    d.includes("anuidade diferenciada") ||
    d.includes("iof") ||
    d.includes("juros cheque esp") ||
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
