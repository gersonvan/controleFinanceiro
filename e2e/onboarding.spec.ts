// Conta nova: o fluxo que quebrou em produção em 01/10 (proxy sem onboardingCompleto,
// useSession sem provider, menu só depois de F5).
import { expect, test } from "@playwright/test";
import { entrar, vigiarErros } from "./ajuda";

test.describe.configure({ mode: "serial" });

// Depois do login o servidor já entrega o onboarding (o proxy redireciona), mas o
// endereço pode continuar "/" — a navegação do login segue o redirecionamento sem
// trocar a URL. Por isso a checagem é pelo conteúdo.
const noOnboarding = (page: import("@playwright/test").Page) =>
  expect(page.getByRole("heading", { name: /Bem-vindo/ })).toBeVisible();

test("conta nova cai no onboarding e consegue sair", async ({ page }) => {
  await entrar(page, "Bruno");
  await noOnboarding(page);
  await page.reload(); // numa carga completa o endereço é o do onboarding
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("conclui o onboarding e o menu aparece sem recarregar", async ({ page }) => {
  const erros = vigiarErros(page);
  await entrar(page, "Bruno");
  await noOnboarding(page);
  await expect(page.locator("aside")).toHaveCount(0);

  await page.getByRole("button", { name: "Próximo →" }).click();          // boas-vindas
  await page.getByRole("button", { name: "Fazer depois" }).click();       // fotografia
  await expect(page.getByText("Conta corrente e poupança")).toBeVisible(); // bancos
  await expect(page.getByText("Cartão de crédito (fatura)")).toBeVisible();
  await expect(page.getByRole("button", { name: /Banco do Brasil — Cartão · OFX/ })).toBeVisible();
  await page.getByRole("button", { name: "Próximo →" }).click();
  await page.getByRole("button", { name: /Ir ao Dashboard/ }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("aside")).toBeVisible();
  await expect(page.locator("aside").getByText("bruno.teste@example.com")).toBeVisible();
  expect(erros).toEqual([]);
});

test("quem já concluiu não volta ao onboarding", async ({ page }) => {
  await entrar(page, "Bruno");
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/$/);
});
