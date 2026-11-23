// Planejado × Realizado: clicar numa categoria abre os Lançamentos já filtrados por
// ela, pelo mês e por saídas — e o total de saídas ali é o "Realizado" da linha.
import { expect, test } from "@playwright/test";
import { entrar, vigiarErros } from "./ajuda";

const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\u00a0/g, " ");

test("a categoria abre os lançamentos que formam o realizado", async ({ page }) => {
  const erros = vigiarErros(page);
  await entrar(page, "Ana");
  const hoje = new Date();
  const ano = hoje.getFullYear(), mes = hoje.getMonth() + 1;
  const api = await (await page.request.get(`/api/planejamento/realizado?ano=${ano}&mes=${mes}`)).json();
  const linha = api.linhas.find((l: { realizado: number }) => l.realizado > 0);
  expect(linha, "a Ana precisa de uma categoria planejada com gasto no mês").toBeTruthy();

  await page.goto("/planejamento?aba=comparacao");
  await page.locator("[data-ver-lancamentos]", { hasText: linha.categoria }).first().click();

  await expect(page).toHaveURL(/\/lancamentos\?/);
  const url = new URL(page.url());
  expect(url.searchParams.get("categoria")).toBe(linha.categoria);
  expect(url.searchParams.get("tipo")).toBe("Saída");
  expect(url.searchParams.get("dataInicio")).toBe(`${ano}-${String(mes).padStart(2, "0")}-01`);

  await expect(page.locator("select").filter({ hasText: "Todas as categorias" })).toHaveValue(linha.categoria);
  await expect(page.locator("select").filter({ hasText: "Entrada e Saída" })).toHaveValue("Saída");
  await expect(page.locator("[data-total-saidas]")).toBeVisible();
  expect((await page.locator("[data-total-saidas]").innerText()).replace(/\u00a0/g, " ")).toBe(reais(linha.realizado));
  expect(erros).toEqual([]);
});
