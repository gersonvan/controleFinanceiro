// Sugestões (chips) do wizard da Fotografia do mês. Cada uma já traz a
// categoria do sistema, para o usuário só informar nome e valor.
import type { Grupo, Periodicidade } from "./planejamento";

export interface Sugestao {
  nome: string;
  categoria: string;
  periodicidade?: Periodicidade; // padrão do grupo quando omitido
}

export const PERIODICIDADE_PADRAO: Record<Grupo, Periodicidade> = {
  entrada: "mensal",
  fixo: "mensal",
  variavel: "mensal",
  sazonal: "anual",
  parcela: "mensal",
};

export const SUGESTOES: Record<Grupo, Sugestao[]> = {
  entrada: [
    { nome: "Salário", categoria: "Salário" },
    { nome: "Renda extra / freelance", categoria: "Outras Entradas" },
    { nome: "Vale-alimentação", categoria: "Outras Entradas" },
    { nome: "Aluguel recebido", categoria: "Receita de Aluguel" },
    { nome: "Pensão", categoria: "Outras Entradas" },
    { nome: "Rendimentos", categoria: "Rendimento Investimentos" },
  ],
  fixo: [
    { nome: "Aluguel", categoria: "Aluguel" },
    { nome: "Prestação do imóvel", categoria: "Prestação de Imóvel" },
    { nome: "Condomínio", categoria: "Condomínio" },
    { nome: "Energia", categoria: "Contas de Consumo" },
    { nome: "Água", categoria: "Contas de Consumo" },
    { nome: "Gás", categoria: "Contas de Consumo" },
    { nome: "Internet", categoria: "Contas de Consumo" },
    { nome: "Celular", categoria: "Contas de Consumo" },
    { nome: "Plano de saúde", categoria: "Plano de Saúde" },
    { nome: "Academia", categoria: "Academia e Bem-estar" },
    { nome: "Terapia", categoria: "Consultas e Terapias" },
    { nome: "Escola / faculdade", categoria: "Mensalidades e Cursos" },
    { nome: "Streaming e assinaturas", categoria: "Assinaturas Digitais" },
    { nome: "Combustível", categoria: "Combustível" },
    { nome: "Estacionamento (mensal)", categoria: "Estacionamento" },
    { nome: "Transporte público", categoria: "Transporte por App" },
    { nome: "Seguro", categoria: "Seguros" },
    { nome: "Investimento mensal", categoria: "Investimentos (Aportes)" },
    { nome: "Farmácia (uso contínuo)", categoria: "Farmácia" },
    { nome: "Pet", categoria: "Pets" },
    { nome: "Cuidados pessoais", categoria: "Cuidados Pessoais" },
    { nome: "Diarista / empregada", categoria: "Serviços Domésticos" },
    { nome: "Ajuda à família", categoria: "Transferência para Terceiros" },
  ],
  variavel: [
    { nome: "Mercado", categoria: "Supermercado e Mercearia" },
    { nome: "Restaurantes e lanches", categoria: "Restaurantes e Lanches" },
    { nome: "Delivery", categoria: "Delivery e iFood" },
    { nome: "Uber / 99", categoria: "Transporte por App" },
    { nome: "Lazer e saídas", categoria: "Lazer e Entretenimento" },
    { nome: "Compras", categoria: "Compras" },
    { nome: "Farmácia", categoria: "Farmácia" },
  ],
  sazonal: [
    { nome: "IPVA", categoria: "Impostos e Tributos" },
    { nome: "IPTU", categoria: "Impostos e Tributos" },
    { nome: "Seguro do carro", categoria: "Seguros" },
    { nome: "Manutenção do carro", categoria: "Automóvel" },
    { nome: "Dentista", categoria: "Consultas e Terapias" },
    { nome: "Anuidade (conselho, associação)", categoria: "Taxas e Anuidades" },
    { nome: "Assinaturas anuais", categoria: "Assinaturas Digitais" },
    { nome: "Viagens", categoria: "Viagem" },
    { nome: "Presentes", categoria: "Presentes" },
    { nome: "Material escolar", categoria: "Mensalidades e Cursos" },
    { nome: "Veterinário", categoria: "Pets" },
  ],
  parcela: [],
};

/** Categoria usada quando o usuário cria um item livre ("Outro…") num grupo. */
export const CATEGORIA_LIVRE: Record<Grupo, string> = {
  entrada: "Outras Entradas",
  fixo: "Contas de Consumo",
  variavel: "Compras",
  sazonal: "Compras",
  parcela: "Compras",
};
