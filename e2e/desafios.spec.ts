// Desafios: sugestões pelo histórico da semente, aceite, card no dashboard,
// desistência, teto escolhido no catálogo, limite de 3 e isolamento.
import { expect, test, type Page } from "@playwright/test";
import { entrar, vigiarErros } from "./ajuda";

/** Começa sem desafios em andamento (o banco é compartilhado entre execuções). */
async function semDesafios(page: Page) {
  const dados = await (await page.request.get("/api/desafios")).json();
  for (const d of dados.emCurso) await page.request.patch("/api/desafios", { data: { id: d.id, acao: "desistir" } });
}

test("sugere pelo histórico, aceita, mostra no dashboard e desiste", async ({ page }) => {
  const erros = vigiarErros(page);
  await entrar(page, "Ana");
  await semDesafios(page);
  await page.goto("/desafios");

  // semente: mercado R$ 650/mês na média → teto 10% abaixo; mês passado no vermelho (financiamento + escola)
  const sugestoes = page.locator("[data-sugestao]");
  await expect(sugestoes.first()).toContainText("Gastar menos do que ganha");
  const mercado = sugestoes.filter({ hasText: "Supermercado e Mercearia" });
  await expect(mercado).toContainText(/Até R\$\s590 em Supermercado e Mercearia no mês/);
  await expect(mercado).toContainText(/Sua média é de R\$\s650 por mês/);
  await expect(page.getByText(/sem categoria/)).toBeVisible(); // a semente tem pendências

  await mercado.getByRole("button", { name: "Aceitar" }).click();
  const emCurso = page.locator("[data-desafio]");
  await expect(emCurso).toHaveCount(1);
  await expect(emCurso).toContainText(/Até R\$\s590 em Supermercado e Mercearia no mês/);
  await expect(page.getByText("1 de 3")).toBeVisible();
  await expect(sugestoes.filter({ hasText: "Supermercado e Mercearia" })).toHaveCount(0); // não sugere o que já aceitou

  await page.goto("/");
  const card = page.locator("[data-card=desafios]");
  await expect(card).toContainText("1 em andamento");
  await expect(card).toContainText("Supermercado e Mercearia");

  await page.goto("/desafios");
  page.once("dialog", (d) => d.accept());
  await emCurso.getByRole("button", { name: "Desistir" }).click();
  await expect(emCurso).toHaveCount(0);
  await expect(sugestoes.filter({ hasText: "Supermercado e Mercearia" })).toHaveCount(1);
  expect(erros).toEqual([]);
});

test("teto escolhido no catálogo; no máximo 3 ao mesmo tempo", async ({ page }) => {
  await entrar(page, "Ana");
  await semDesafios(page);
  await page.goto("/desafios");

  const teto = page.locator("[data-catalogo=teto-categoria]");
  await teto.getByLabel("Categoria do teto").selectOption("Restaurantes e Lanches");
  await expect(teto.getByLabel("Teto no mês")).toHaveValue("90"); // média 95, 10% abaixo
  await teto.getByLabel("Teto no mês").fill("80");
  await teto.getByRole("button", { name: "Aceitar" }).click();
  await expect(page.locator("[data-desafio]")).toContainText(/Até R\$\s80 em Restaurantes e Lanches no mês/);

  await page.locator("[data-catalogo=sobra]").getByRole("button", { name: "Aceitar" }).click();
  await page.locator("[data-catalogo=semana-sem-delivery]").getByRole("button", { name: "Aceitar" }).click();
  await expect(page.locator("[data-desafio]")).toHaveCount(3);
  await expect(page.getByText("3 de 3")).toBeVisible();
  await expect(page.locator("[data-catalogo=zero-encargos]").getByRole("button", { name: "Aceitar" })).toBeDisabled();

  const quarto = await page.request.post("/api/desafios", { data: { modelo: "zero-encargos" } });
  expect(quarto.status()).toBe(409);
  await semDesafios(page);
});

test("Bruno não vê nem desiste dos desafios da Ana", async ({ page, browser }) => {
  const ctxAna = await browser.newContext();
  const ana = await ctxAna.newPage();
  await entrar(ana, "Ana");
  await semDesafios(ana);
  const criado = await (await ana.request.post("/api/desafios", { data: { modelo: "sobra" } })).json();

  await entrar(page, "Bruno");
  const doBruno = await (await page.request.get("/api/desafios")).json();
  expect(doBruno.emCurso).toEqual([]);
  expect(doBruno.semHistorico).toBe(true);
  expect((await page.request.patch("/api/desafios", { data: { id: criado.id, acao: "desistir" } })).status()).toBe(404);

  const daAna = await (await ana.request.get("/api/desafios")).json();
  expect(daAna.emCurso.map((d: { id: number }) => d.id)).toContain(criado.id);
  await semDesafios(ana);
  await ctxAna.close();
});
