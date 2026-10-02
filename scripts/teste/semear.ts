// Dados fictícios para os testes. Ana: conta em uso há 6 meses. Bruno: conta
// nova (sem perfil — o primeiro login cria, e ele cai no onboarding).
import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { USUARIOS_TESTE } from "../../src/lib/login-teste";

const ANA = USUARIOS_TESTE[0].email;
const utc = (ano: number, mes: number, dia: number) => new Date(Date.UTC(ano, mes, dia));

export async function semear() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const hoje = new Date();
  const lancamentos: Prisma.LancamentoCreateManyInput[] = [];
  const add = (ano: number, mes: number, dia: number, descricao: string, valor: number, categoria: string | null, conta: string, mesRef?: Date) =>
    lancamentos.push({
      userId: ANA, data: utc(ano, mes, dia), descricao, valor, categoria, conta,
      tipo: valor >= 0 ? "Entrada" : "Saída", fonte: "Semente de teste",
      mesReferencia: mesRef ?? utc(ano, mes, 1),
    });

  for (let i = 5; i >= 0; i--) {
    const ref = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - i, 1));
    const [a, m] = [ref.getUTCFullYear(), ref.getUTCMonth()];
    const corrente = "Conta Teste", cartao = "Cartão Teste";
    add(a, m, 5, "SALARIO EMPRESA FICTICIA", 6000, "Salário", corrente);
    add(a, m, 10, "ALUGUEL APTO TESTE", -1800, "Aluguel", corrente);
    add(a, m, 12, "ENERGIA DISTRIBUIDORA TESTE", -150 - i * 5, "Contas de Consumo", corrente);
    add(a, m, 15, "APLICACAO CDB TESTE", -500, "Investimentos (Aportes)", corrente);
    add(a, m, 20, "Pagamento de fatura", -1100, "Pagamento de Cartão de Crédito", corrente);
    add(a, m, 22, "Pix enviado para FULANO DE TAL", -80, "Transferência para Terceiros", corrente);
    add(a, m, 3, "MERCADO FICTICIO", -420, "Supermercado e Mercearia", cartao, ref);
    add(a, m, 17, "MERCADO FICTICIO", -230, "Supermercado e Mercearia", cartao, ref);
    add(a, m, 8, "RESTAURANTE TESTE", -95, "Restaurantes e Lanches", cartao, ref);
    add(a, m, 9, "STREAMING TESTE", -39.9, "Assinaturas Digitais", cartao, ref);
    add(a, m, 14, `LOJA PARCELADA TESTE (${6 - i}/6)`, -200, "Compras", cartao, ref);
  }
  // mesmo pagamento com descrições diferentes (como no BB): financeira que mudou de
  // nome e escola com variações ("LTDA", "- Data balanc.: 04")
  const [ha, hm] = [hoje.getUTCFullYear(), hoje.getUTCMonth()];
  add(ha, hm - 3, 2, "Pagamento de Boleto - FINANCEIRA A CREDITO - Data balanc.: 02", -2578.05, "Automóvel", "Conta Teste");
  add(ha, hm - 2, 3, "Pagamento de Boleto - FINANCEIRA A CREDITO - Data balanc.: 03", -2579.2, "Automóvel", "Conta Teste");
  add(ha, hm - 1, 1, "Pagamento de Boleto - BANCO B SOCIEDADE DE CREDITO", -2576.9, null, "Conta Teste");
  add(ha, hm, 1, "Pagamento de Boleto - BANCO B SOCIEDADE DE CREDITO - Data balanc.: 0", -2580.35, null, "Conta Teste");
  add(ha, hm - 1, 4, "Pagamento de Boleto - ESCOLA FICTICIA INFANTIL", -1804, null, "Conta Teste");
  add(ha, hm - 1, 20, "Pagamento de Boleto - ESCOLA FICTICIA INFANTIL LTDA - Data balanc", -236.25, null, "Conta Teste");
  add(ha, hm, 4, "Pagamento de Boleto - ESCOLA FICTICIA INFANTIL - Data balanc.: 04", -1864, null, "Conta Teste");

  // pendências para a tela Revisar
  add(hoje.getUTCFullYear(), hoje.getUTCMonth(), 2, "PIX QRS LOJINHA SEM CATEGORIA", -45, null, "Conta Teste");
  add(hoje.getUTCFullYear(), hoje.getUTCMonth(), 2, "COMPRA DESCONHECIDA TESTE", -60, null, "Cartão Teste");

  await prisma.userProfile.create({
    data: { userId: ANA, nome: "Ana", nomeCompleto: USUARIOS_TESTE[0].nome, onboardingCompleto: true, fotografiaConcluidaEm: hoje },
  });
  await prisma.conta.createMany({ data: [
    { userId: ANA, nome: "Conta Teste", tipo: "corrente" },
    { userId: ANA, nome: "Cartão Teste", tipo: "cartao" },
  ] });
  await prisma.lancamento.createMany({ data: lancamentos });
  await prisma.planejamentoItem.createMany({ data: [
    { userId: ANA, grupo: "entrada", descricao: "Salário", categoria: "Salário", valor: 6000 },
    { userId: ANA, grupo: "fixo", descricao: "Aluguel", categoria: "Aluguel", valor: 1800 },
    { userId: ANA, grupo: "variavel", descricao: "Mercado", categoria: "Supermercado e Mercearia", valor: 150, periodicidade: "semanal" },
  ] });
  await prisma.reserva.create({
    data: { userId: ANA, nome: "CDB Teste", tipo: "investimento", saldoInformado: 10000, dataSaldo: utc(hoje.getUTCFullYear(), hoje.getUTCMonth() - 6, 1), conta: "Conta Teste" },
  });
  await prisma.memoriaIA.create({ data: { userId: ANA, descricao: "restaurante teste", categoriaCorreta: "Restaurantes e Lanches" } });

  const anaIds = (await prisma.lancamento.findMany({ where: { userId: ANA }, select: { id: true }, orderBy: { id: "asc" } })).map((l) => l.id);
  await prisma.$disconnect();
  return { ana: { email: ANA, lancamentoIds: anaIds }, resumo: `${anaIds.length} lançamentos da Ana; Bruno sem dados` };
}
