// Categorias do usuário: criar uma própria, ocultar uma nativa levando os
// lançamentos para outra, regras que respeitam a ocultação, renomear e excluir.
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { entrar, vigiarErros } from "./ajuda";

const lancar = async (api: APIRequestContext, descricao: string, categoria: string | null) => {
  const r = await api.post("/api/lancamentos", { data: {
    data: "2026-09-15", descricao, valor: -42, tipo: "Saída", conta: "Nubank · Crédito", categoria,
  } });
  return { status: r.status(), id: r.ok() ? (await r.json()).id as number : null };
};
const categoriaDe = async (api: APIRequestContext, id: number) =>
  ((await (await api.get("/api/lancamentos?limit=50&busca=CATEG%20TESTE")).json()).lancamentos as { id: number; categoria: string | null }[])
    .find((l) => l.id === id)?.categoria;
const opcoesDoFiltro = async (page: Page) => {
  await page.goto("/lancamentos");
  return page.locator("select").filter({ hasText: "Todas as categorias" }).locator("option").allInnerTexts();
};

test("cria, oculta com destino, renomeia e exclui — e os dados acompanham", async ({ page, browser }) => {
  const erros = vigiarErros(page);
  await entrar(page, "Ana");
  const api = page.request;

  // categoria própria
  await page.goto("/configuracoes/categorias");
  await page.getByLabel("Nome da categoria").fill("Cachorro");
  await page.getByLabel("Grupo").selectOption("Pessoal e Lazer");
  await page.getByRole("button", { name: "Criar" }).click();
  await expect(page.getByRole("status")).toContainText("“Cachorro” criada");
  await expect(page.locator('[data-categoria="Cachorro"]')).toContainText("sua");
  expect(await opcoesDoFiltro(page)).toContain("Cachorro");

  // gravação só aceita categoria do usuário
  expect((await lancar(api, "CATEG TESTE INVENTADA", "Inventada")).status).toBe(400);
  const pets = await lancar(api, "CATEG TESTE RACAO", "Pets");
  const semCategoria = await lancar(api, "CATEG TESTE COBASI", null);
  expect([pets.status, semCategoria.status]).toEqual([201, 201]);

  // do sistema não oculta
  expect((await api.patch("/api/categorias", { data: { acao: "ocultar", nome: "Estorno", destino: null } })).status()).toBe(400);

  // ocultar Pets levando para Cachorro
  await page.goto("/configuracoes/categorias");
  await page.locator('[data-categoria="Pets"]').getByRole("button", { name: "Ocultar" }).click();
  const escolha = page.locator("[data-escolher-destino]");
  await expect(escolha).toContainText("1 lançamento em “Pets”");
  await escolha.getByLabel("Categoria de destino").selectOption("Cachorro");
  await escolha.getByRole("button", { name: "Ocultar" }).click();
  await expect(page.getByRole("status")).toContainText("“Pets” oculta: 1 lançamento foi para “Cachorro”");
  await expect(page.locator('[data-oculta="Pets"]')).toContainText("“Cachorro”");
  expect(await categoriaDe(api, pets.id!)).toBe("Cachorro");
  const opcoes = await opcoesDoFiltro(page);
  expect(opcoes).not.toContain("Pets");
  expect(opcoes).toContain("Cachorro");

  // a regra que daria Pets ("cobasi") dá o destino
  await api.post("/api/categorizar", { data: { ids: [semCategoria.id] } });
  expect(await categoriaDe(api, semCategoria.id!)).toBe("Cachorro");

  // renomear: lançamentos e o destino da oculta acompanham
  expect((await api.patch("/api/categorias", { data: { acao: "renomear", nome: "Cachorro", novoNome: "Cachorros" } })).status()).toBe(200);
  expect(await categoriaDe(api, pets.id!)).toBe("Cachorros");
  await page.goto("/configuracoes/categorias");
  await expect(page.locator('[data-oculta="Pets"]')).toContainText("“Cachorros”");

  // teto de desafio numa categoria própria; enquanto ele anda, a categoria não sai da lista
  const teto = await api.post("/api/desafios", { data: { modelo: "teto-categoria", categoria: "Cachorros", meta: 100 } });
  expect(teto.status()).toBe(201);
  const excluirComDesafio = await api.patch("/api/categorias", { data: { acao: "excluir", nome: "Cachorros", destino: null } });
  expect(excluirComDesafio.status()).toBe(409);
  expect((await excluirComDesafio.json()).error).toContain("desafio em andamento");
  expect((await api.patch("/api/desafios", { data: { id: (await teto.json()).id, acao: "desistir" } })).status()).toBe(200);

  // isolamento: o Bruno não vê as categorias da Ana
  const ctxBruno = await browser.newContext();
  const bruno = await ctxBruno.newPage();
  await entrar(bruno, "Bruno");
  expect((await (await bruno.request.get("/api/categorias")).json()).linhas).toEqual([]);
  await ctxBruno.close();

  // excluir deixando sem categoria; a oculta passa a mandar para "sem categoria"
  await page.locator('[data-categoria="Cachorros"]').getByRole("button", { name: "Excluir" }).click();
  await escolha.getByLabel("Deixar sem categoria").check();
  await escolha.getByRole("button", { name: "Excluir" }).click();
  await expect(page.getByRole("status")).toContainText("“Cachorros” excluída: 2 lançamentos ficaram sem categoria");
  expect(await categoriaDe(api, pets.id!)).toBeNull();
  await expect(page.locator('[data-oculta="Pets"]')).toContainText("sem categoria");

  // mostrar de novo e limpar
  await page.locator('[data-oculta="Pets"]').getByRole("button", { name: "Mostrar de novo" }).click();
  await expect(page.locator('[data-categoria="Pets"]')).toBeVisible();
  for (const id of [pets.id, semCategoria.id]) expect((await api.delete(`/api/lancamentos?id=${id}`)).status()).toBe(200);
  expect(erros).toEqual([]);
});
