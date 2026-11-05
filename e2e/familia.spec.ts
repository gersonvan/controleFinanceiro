// Plano da família: pessoas, rendas e contas com quem paga, resumo por pessoa e
// por filho, cenário comparado ao principal, conflito de versão e validação.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { entrar, vigiarErros } from "./ajuda";

const txt = (s: string) => s.replace(/ /g, " ");

async function novaLinha(page: Page, secao: "rendas" | "contas"): Promise<Locator> {
  const s = page.locator(`[data-secao="${secao}"]`);
  await s.getByRole("button", { name: secao === "rendas" ? "Adicionar renda" : "Adicionar conta" }).click();
  return s.locator("[data-item]").last();
}
async function preencher(linha: Locator, rotulo: string, descricao: string, valor: string) {
  await linha.getByLabel(`Descrição da ${rotulo}`).fill(descricao);
  const campo = linha.getByLabel(`Valor da ${rotulo}`);
  await campo.fill(valor);
  await campo.blur();
}

test("monta o plano da família, salva, compara um cenário e recusa versão velha", async ({ page }) => {
  const erros = vigiarErros(page);
  await entrar(page, "Ana");
  await page.goto("/planejamento?aba=familia");
  const pessoas = page.locator('[data-secao="pessoas"]');
  await expect(pessoas).toContainText("Comece por quem tem renda");

  for (const [nome, tipo] of [["Ana", "adulto"], ["Bruno", "adulto"], ["Léo", "dependente"], ["Apartamento", "outro"]]) {
    await pessoas.getByLabel("Nome da pessoa").fill(nome);
    await pessoas.getByLabel("Tipo de pessoa").selectOption(tipo);
    await pessoas.getByRole("button", { name: "Adicionar" }).click();
  }
  await expect(pessoas.locator("[data-pessoa]")).toHaveCount(4);

  await preencher(await novaLinha(page, "rendas"), "renda", "Salário", "10000");
  const rendaBruno = await novaLinha(page, "rendas");
  await rendaBruno.getByLabel("De quem").selectOption({ label: "Bruno" });
  await preencher(rendaBruno, "renda", "Salário", "8000");

  const aluguel = await novaLinha(page, "contas");
  await preencher(aluguel, "conta", "Aluguel", "3000");
  await aluguel.getByRole("combobox").nth(3).selectOption("Aluguel"); // categoria
  const escola = await novaLinha(page, "contas");
  await preencher(escola, "conta", "Escola Léo", "1600");
  await escola.getByLabel("Quem paga").selectOption({ label: "Bruno" });
  await escola.getByLabel("Para quem").selectOption({ label: "Léo" });
  const ipva = await novaLinha(page, "contas");
  await preencher(ipva, "conta", "IPVA", "3600");
  await ipva.getByLabel("Periodicidade").selectOption("anual");
  await ipva.getByLabel("Quem paga").selectOption({ label: "Bruno" });
  await ipva.getByLabel("Grupo").fill("Carro");

  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("status")).toContainText("Plano salvo");

  // resumo: por pessoa, por filho e da casa (IPVA 3600/ano = 300/mês)
  const conferirResumo = async () => {
    expect(txt(await page.locator('[data-pessoa-resumo="Ana"]').innerText())).toContain("sobra R$ 7.000,00");
    expect(txt(await page.locator('[data-pessoa-resumo="Bruno"]').innerText())).toContain("sobra R$ 6.100,00");
    expect(txt(await page.locator("[data-por-dependente]").innerText())).toContain("R$ 1.600,00");
    expect(txt(await page.locator("[data-sobra]").innerText())).toContain("R$ 13.100,00");
  };
  await conferirResumo();
  await page.reload(); // gravado de verdade
  await conferirResumo();

  // cenário: cópia do principal com a escola mais barata
  await page.getByRole("button", { name: "+ Novo cenário" }).click();
  await page.getByLabel("Nome do cenário").fill("Escola um turno");
  await page.getByRole("button", { name: "OK" }).click();
  await expect(page.getByLabel("Cenário")).toHaveValue(/.+/);
  const escolaCenario = page.locator('[data-secao="contas"] [data-item="Escola Léo"]');
  await escolaCenario.getByLabel("Valor da conta").fill("1000");
  await escolaCenario.getByLabel("Valor da conta").blur();
  const comp = page.locator("[data-comparacao]");
  expect(txt(await comp.innerText())).toContain("Escola Léo R$ 1.600,00 → R$ 1.000,00");
  expect(txt(await comp.innerText())).toMatch(/Contas fixas\s+−R\$ 600,00/); // só a diferença, uma vez
  expect(txt(await comp.locator('[data-delta-pessoa="Bruno"]').innerText())).toMatch(/\+R\$ 600,00/);
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("status")).toContainText("Plano salvo");

  // versão velha (outra pessoa salvou antes) é recusada; dependente com renda também
  const { dados, versao } = await (await page.request.get("/api/familia")).json();
  expect(dados.cenarios).toHaveLength(2);
  expect((await page.request.put("/api/familia", { data: { dados, versao: versao - 1 } })).status()).toBe(409);
  const leo = dados.pessoas.find((p: { nome: string }) => p.nome === "Léo").chave;
  dados.cenarios[0].itens.push({ chave: "mesada", tipo: "renda", descricao: "Mesada", valor: 50, periodicidade: "mensal", pessoa: leo, para: null, categoria: null, grupo: null, origem: null });
  expect((await page.request.put("/api/familia", { data: { dados, versao } })).status()).toBe(400);
  expect(erros).toEqual([]);
});

test("traz a Fotografia do mês para o plano da família, sem repetir", async ({ page }) => {
  const erros = vigiarErros(page);
  await entrar(page, "Ana");
  // plano só com as pessoas; a Fotografia da Ana (semente) tem salário, aluguel e mercado (variável)
  const { versao } = await (await page.request.get("/api/familia")).json();
  const dados = {
    pessoas: [{ chave: "ana", nome: "Ana", tipo: "adulto" }, { chave: "bruno", nome: "Bruno", tipo: "adulto" }],
    cenarios: [{ chave: "principal", nome: "Plano principal", principal: true, itens: [] }],
  };
  expect((await page.request.put("/api/familia", { data: { dados, versao } })).status()).toBe(200);

  await page.goto("/planejamento?aba=familia");
  await page.getByRole("button", { name: "📸 Trazer da minha Fotografia do mês" }).click();
  const painel = page.locator("section[data-trazer-fotografia]");
  await painel.getByLabel("Quem é você na casa").selectOption({ label: "Ana" });
  await expect(painel).toContainText("1 renda e 1 conta");
  await expect(painel).toContainText("1 gasto variável (o dia a dia, não é conta fixa)");
  await painel.getByRole("button", { name: "Trazer" }).click();
  await expect(page.getByRole("status")).toContainText("2 itens trazidos");
  await expect(page.locator('[data-secao="rendas"] [data-item="Salário"]')).toBeVisible();
  await expect(page.locator('[data-secao="contas"] [data-item="Aluguel"]')).toBeVisible();
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("status")).toContainText("Plano salvo");

  const salvo = (await (await page.request.get("/api/familia")).json()).dados.cenarios[0].itens as { tipo: string; descricao: string; valor: number; pessoa: string }[];
  expect(salvo.map((i) => [i.tipo, i.descricao, i.valor, i.pessoa])).toEqual([["renda", "Salário", 6000, "ana"], ["conta", "Aluguel", 1800, "ana"]]);

  // de novo: nada se repete
  await page.getByRole("button", { name: "📸 Trazer da minha Fotografia do mês" }).click();
  await expect(painel).toContainText("Nada novo para trazer");
  expect(erros).toEqual([]);
});

test("linha em branco é descartada e a incompleta vira mensagem clara, sem texto técnico", async ({ page }) => {
  await entrar(page, "Ana");
  const { versao } = await (await page.request.get("/api/familia")).json();
  const dados = {
    pessoas: [{ chave: "ana", nome: "Ana", tipo: "adulto" }],
    cenarios: [{ chave: "principal", nome: "Plano principal", principal: true, itens: [] }],
  };
  expect((await page.request.put("/api/familia", { data: { dados, versao } })).status()).toBe(200);
  await page.goto("/planejamento?aba=familia");

  // o caso relatado: "Adicionar renda" e salvar sem preencher
  await novaLinha(page, "rendas");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("status")).toContainText("Plano salvo");
  await expect(page.locator('[data-secao="rendas"] [data-item]')).toHaveCount(0);

  // conta só com descrição: mensagem em português, linha destacada, nada de "dados.cenarios.0…"
  const conta = await novaLinha(page, "contas");
  await conta.getByLabel("Descrição da conta").fill("Aluguel");
  await page.getByRole("button", { name: "Salvar" }).click();
  const problemas = page.locator("[data-problemas]");
  await expect(problemas).toContainText("“Aluguel”: falta o valor");
  await expect(problemas).not.toContainText("dados.");
  await expect(conta).toHaveClass(/ring-red-300/);

  // corrigido, a mensagem some e salva
  await conta.getByLabel("Valor da conta").fill("1500");
  await conta.getByLabel("Valor da conta").blur();
  await expect(problemas).toHaveCount(0);
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("status")).toContainText("Plano salvo");
});
