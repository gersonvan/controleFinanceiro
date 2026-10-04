// Lançamento manual: a lista de contas mostra primeiro as usadas (das mais para as
// menos usadas), depois as dos bancos ativos; bancos desativados não aparecem.
import { expect, test } from "@playwright/test";
import { entrar } from "./ajuda";

test("contas sugeridas: em uso primeiro, desativadas fora", async ({ page }) => {
  await entrar(page, "Ana");
  // desativa todos os perfis da conta "Inter · Crédito" (fatura em PDF e em OFX)
  const perfis = await (await page.request.get("/api/perfis?todos=true")).json();
  for (const p of perfis.filter((x: { conta: string }) => x.conta === "Inter · Crédito"))
    await page.request.patch("/api/perfis", { data: { id: p.id, ativo: false } });

  await page.goto("/lancamentos");
  await page.getByRole("button", { name: /Novo/ }).click();
  const lista = page.locator("#contas-conhecidas option");
  await expect.poll(() => lista.count()).toBeGreaterThan(2); // as sugestões chegam depois de abrir
  const opcoes = await lista.evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
  expect(opcoes.slice(0, 2)).toEqual(["Nubank · Débito", "Nubank · Crédito"]); // a semente tem mais lançamentos no Débito
  expect(opcoes).not.toContain("Inter · Crédito");
  expect(opcoes.length).toBe(new Set(opcoes).size); // sem repetição
});
