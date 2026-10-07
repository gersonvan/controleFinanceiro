// Mesmo pagamento com descrições diferentes (caso real do BB): variações de
// ruído se juntam sozinhas; nomes diferentes o usuário junta e a categoria passa.
import { expect, test } from "@playwright/test";
import { entrar } from "./ajuda";

test("variações de ruído do BB viram um grupo só na Revisão", async ({ page }) => {
  await entrar(page, "Ana");
  await page.goto("/lancamentos/revisar");
  const escola = page.locator("li").filter({ hasText: "ESCOLA FICTICIA INFANTIL" });
  await expect(escola).toHaveCount(1);
  await expect(escola.getByText("3× ")).toBeVisible();
  await expect(escola.getByText("3 variações da descrição")).toBeVisible();
});

test("juntar dois nomes como mesmo pagamento leva a categoria de um para o outro", async ({ page }) => {
  await entrar(page, "Ana");
  await page.goto("/lancamentos");
  // período: todos os meses (o padrão é o mês atual); um clique antes da hidratação se perde
  const inicio = page.locator("input[type=date]").first();
  await expect(async () => {
    await page.getByRole("button", { name: "Limpar datas" }).click();
    await expect(inicio).toHaveValue("", { timeout: 1000 });
  }).toPass();
  const juntar = async (busca: string, nome: string) => {
    await page.getByPlaceholder("Buscar descrição…").fill(busca);
    await expect(page.locator("table tbody tr").first()).toContainText(busca);
    await page.locator("table thead input[type=checkbox]").check();
    await page.getByRole("button", { name: "Mesmo pagamento…" }).click();
    await page.getByPlaceholder(/Nome comum/).fill(nome);
    await page.getByRole("button", { name: "Juntar" }).click();
    await expect(page.getByText(/agora contam como "Financiamento do carro"/)).toBeVisible();
  };
  await juntar("FINANCEIRA A", "Financiamento do carro");
  await juntar("BANCO B", "Financiamento do carro");

  // na Revisão, o BANCO B (sem categoria) aparece com o nome comum
  await page.goto("/lancamentos/revisar");
  await expect(page.locator("li").filter({ hasText: "BANCO B" }).getByText("🔗 Financiamento do carro")).toBeVisible();

  // categorizar automaticamente: o histórico da FINANCEIRA A (Automóvel) vale para o BANCO B
  const r = await page.request.post("/api/categorizar", { data: { usarGemini: false } });
  expect(r.ok()).toBe(true);
  const lista = await (await page.request.get("/api/lancamentos?limit=500&busca=BANCO%20B")).json();
  expect(lista.lancamentos.map((l: { categoria: string }) => l.categoria)).toEqual(["Automóvel", "Automóvel"]);

  // e em Configurações o grupo aparece com as duas variações
  await page.goto("/configuracoes/mesmo-pagamento");
  const grupo = page.locator("li.card").filter({ hasText: "Financiamento do carro" });
  await expect(grupo.getByText(/FINANCEIRA A CREDITO/)).toBeVisible();
  await expect(grupo.getByText(/BANCO B SOCIEDADE DE CREDITO/)).toBeVisible();
});
