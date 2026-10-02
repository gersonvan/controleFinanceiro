// Matriz abre pelos grupos e vai crescendo: grupo → categorias → lançamentos.
import { expect, test } from "@playwright/test";
import { entrar } from "./ajuda";

test("começa pelos grupos e abre categorias e lançamentos", async ({ page }) => {
  await entrar(page, "Ana");
  await page.goto("/matriz");
  // 1ª célula: "▶" + nome (grupo/categoria) ou só o nome (lançamento)
  const linha = (texto: string) =>
    page.locator("tbody tr").filter({ has: page.locator("td:first-child", { hasText: new RegExp(`^(▶\\s*)?${texto}$`) }) });

  await expect(linha("Alimentação")).toBeVisible();
  await expect(linha("Supermercado e Mercearia")).toHaveCount(0);

  await linha("Alimentação").click();
  await expect(linha("Supermercado e Mercearia")).toBeVisible();
  await expect(linha("MERCADO FICTICIO")).toHaveCount(0);

  await linha("Supermercado e Mercearia").click();
  await expect(linha("MERCADO FICTICIO")).toBeVisible();

  await page.getByRole("button", { name: "Abrir todos" }).click();
  await expect(linha("Aluguel")).toBeVisible();
  await page.getByRole("button", { name: "Fechar todos" }).click();
  await expect(linha("Aluguel")).toHaveCount(0);
});
