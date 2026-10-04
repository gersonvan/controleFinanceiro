// Etapa 3 das contas por banco: Configurações › Contas e lançamento manual.
import { expect, test, type Page } from "@playwright/test";
import { entrar } from "./ajuda";

const daConta = async (page: Page, conta: string) =>
  (await (await page.request.get(`/api/lancamentos?conta=${encodeURIComponent(conta)}&limit=1`)).json()).total as number;

test("apelido renomeia a conta e leva os lançamentos junto", async ({ page }) => {
  await entrar(page, "Ana");
  const antes = await daConta(page, "Nubank · Crédito");
  expect(antes).toBeGreaterThan(0);

  await page.goto("/configuracoes/contas");
  const nubank = page.locator('[data-banco="nubank"]');
  // a linha cujo título é "Crédito" (a do Débito também tem um botão "Crédito")
  const credito = nubank.locator("div.py-2\\.5").filter({ has: page.locator("div.font-medium", { hasText: /^Crédito/ }) });
  await credito.getByRole("button", { name: "Apelido" }).click();
  await credito.getByLabel("Apelido").fill("Roxinho");
  await credito.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Conta atualizada")).toBeVisible();
  await expect(nubank.getByText("· Roxinho")).toBeVisible();
  expect(await daConta(page, "Nubank · Crédito · Roxinho")).toBe(antes);
  expect(await daConta(page, "Nubank · Crédito")).toBe(0);

  // desfaz (os outros testes contam com "Nubank · Crédito")
  const contas = await (await page.request.get("/api/contas")).json();
  const id = contas.find((c: { nome: string }) => c.nome === "Nubank · Crédito · Roxinho").id;
  expect((await page.request.patch("/api/contas", { data: { id, apelido: "" } })).ok()).toBe(true);
  expect(await daConta(page, "Nubank · Crédito")).toBe(antes);
});

test("cria e exclui uma conta sem banco (Outro · Carteira)", async ({ page }) => {
  await entrar(page, "Ana");
  await page.goto("/configuracoes/contas");
  await page.getByLabel("Banco").last().selectOption("outro");
  await page.getByLabel("Nome da conta").fill("Carteira");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByText('Conta "Outro · Carteira" criada.')).toBeVisible();
  const outro = page.locator('[data-banco="outro"]');
  await expect(outro.getByText("Carteira", { exact: true })).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await outro.getByRole("button", { name: "Excluir" }).click();
  await expect(page.getByText("Conta excluída.")).toBeVisible();
  await expect(page.locator('[data-banco="outro"]')).toHaveCount(0);
});

test("lançamento manual em conta nova: 'Outra conta…' grava em 'Outro · Vale'", async ({ page }) => {
  await entrar(page, "Ana");
  await page.goto("/lancamentos");
  await page.getByRole("button", { name: /Novo/ }).click();
  await page.getByPlaceholder("0,00").fill("25,00");
  await page.getByPlaceholder("Ex.: Mercado da esquina").fill("ALMOCO NO VALE");
  await page.getByLabel("Conta", { exact: true }).selectOption("__outra__");
  await page.getByLabel("Banco").selectOption("outro");
  await page.getByLabel("Nome da conta").fill("Vale");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect.poll(() => daConta(page, "Outro · Vale")).toBe(1);
});
