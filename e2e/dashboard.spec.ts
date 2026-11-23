// Dashboard: abre no mês corrente com o resumo (saldo, entradas, saídas, plano),
// "Fique de olho", categorias, 50/30/20, meios e o mês a mês; o ritmo dia a dia
// abre pelo resumo; no "Ano todo" saem os cartões mensais e entra a média por mês.
import { expect, test } from "@playwright/test";
import { entrar, vigiarErros } from "./ajuda";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");
const txt = async (l: import("@playwright/test").Locator) => (await l.innerText()).replace(/ /g, " ");

test("abre no mês corrente, mostra o resumo e os cartões do mês, e muda para o ano todo", async ({ page }) => {
  const erros = vigiarErros(page);
  await entrar(page, "Ana");
  const hoje = new Date();
  const ano = hoje.getFullYear(), mes = hoje.getMonth() + 1;
  const api = await (await page.request.get(`/api/dashboard?ano=${ano}&mes=${mes}`)).json();
  // a soma das categorias é o total de saídas (sem categoria inclusive)
  expect(api.porCategoria.reduce((a: number, [, v]: [string, number]) => a + v, 0)).toBeCloseTo(api.totalSaidas, 2);
  expect(api.porMes).toHaveLength(6);

  await page.goto("/");
  await expect(page.locator("[data-periodo]")).toContainText(`${MESES[mes - 1]} de ${ano} · hoje é dia ${hoje.getDate()}`);
  const resumo = page.locator("[data-resumo-periodo]");
  expect(await txt(resumo.locator("[data-entradas]"))).toBe(reais(api.totalEntradas));
  expect(await txt(resumo.locator("[data-saidas]"))).toBe(reais(api.totalSaidas));
  await expect(resumo.locator("[data-plano]")).toContainText("Saídas × plano da Fotografia"); // a Ana fez a Fotografia

  await expect(page.locator("[data-fique-de-olho] [data-aviso]").first()).toBeVisible();
  await expect(page.locator("[data-para-onde-foi]")).toContainText(api.porCategoria[0][0]);
  await expect(page.locator("[data-divisao-mes] [data-fatia]")).toHaveCount(3);
  await expect(page.locator("[data-como-pagou] [data-divida]")).toBeVisible();
  await expect(page.locator("[data-ultimos-meses]")).toContainText("Últimos 6 meses");

  await resumo.getByRole("button", { name: "Ver o ritmo dia a dia" }).click();
  await expect(page.getByRole("heading", { name: "Ritmo do mês" })).toBeVisible();

  // ano todo: só o que faz sentido para o ano
  await page.getByLabel("Mês", { exact: true }).selectOption({ label: "Ano todo" });
  await expect(page.locator("[data-periodo]")).toContainText(`${ano}, o ano todo`);
  await expect(resumo.locator("[data-media-mes]")).toBeVisible();
  await expect(page.locator("[data-divisao-mes]")).toHaveCount(0);
  await expect(page.locator("[data-como-pagou]")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Ritmo do mês" })).toHaveCount(0);
  await expect(page.locator("[data-ultimos-meses]")).toContainText(`Mês a mês em ${ano}`);
  const doAno = await (await page.request.get(`/api/dashboard?ano=${ano}`)).json();
  expect(await txt(resumo.locator("[data-saidas]"))).toBe(reais(doAno.totalSaidas));
  expect(erros).toEqual([]);
});
