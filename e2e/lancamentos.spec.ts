// Trocar a categoria de um lançamento: salva ao escolher (sem botão) e a página
// não volta ao topo — antes a lista inteira recarregava e a rolagem se perdia.
import { expect, test } from "@playwright/test";
import { entrar, vigiarErros } from "./ajuda";

test("escolher a categoria salva na hora e mantém a rolagem", async ({ page }) => {
  const erros = vigiarErros(page);
  await page.setViewportSize({ width: 1024, height: 520 }); // lista maior que a tela
  await entrar(page, "Ana");
  await page.goto("/lancamentos");
  const linha = page.locator("table tbody tr").nth(10);
  await linha.scrollIntoViewIfNeeded();
  const rolagem = await page.evaluate(() => window.scrollY);
  expect(rolagem).toBeGreaterThan(0);

  await linha.locator("button.badge").click();
  const salvou = page.waitForResponse((r) => r.url().endsWith("/api/lancamentos") && r.request().method() === "PATCH");
  await linha.locator("select").selectOption("Lazer e Entretenimento");
  expect((await salvou).ok()).toBe(true);

  await expect(linha.locator("button.badge")).toHaveText("Lazer e Entretenimento");
  await expect(linha.locator("select")).toHaveCount(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(rolagem);
  expect(erros).toEqual([]);
});

test("Esc cancela a edição sem salvar", async ({ page }) => {
  await entrar(page, "Ana");
  await page.goto("/lancamentos");
  const badge = page.locator("table tbody tr").first().locator("button.badge");
  const antes = await badge.textContent();
  let patch = false;
  page.on("request", (r) => { if (r.method() === "PATCH") patch = true; });
  await badge.click();
  await page.locator("table tbody tr").first().locator("select").press("Escape");
  await expect(page.locator("table tbody tr").first().locator("button.badge")).toHaveText(antes!);
  expect(patch).toBe(false);
});
