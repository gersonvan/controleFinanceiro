// Categorização inteligente: a IA só sugere; o usuário revisa, troca o que
// quiser e aplica. A resposta da IA é simulada no navegador (o ambiente de
// testes não tem chave); o "Aplicar" vai ao servidor de verdade.
import { expect, test, type APIRequestContext } from "@playwright/test";
import { entrar, vigiarErros } from "./ajuda";

async function criar(api: APIRequestContext, descricao: string) {
  const r = await api.post("/api/lancamentos", { data: { data: "2026-10-03", descricao, valor: -42, tipo: "Saída", conta: "Nubank · Crédito" } });
  expect(r.status()).toBe(201);
  return r.json() as Promise<{ id: number; descricao: string; data: string; valor: number; conta: string }>;
}
const categoriaDe = async (api: APIRequestContext, descricao: string) =>
  (await (await api.get(`/api/lancamentos?limit=5&busca=${encodeURIComponent(descricao)}`)).json()).lancamentos[0]?.categoria ?? null;

test("sugere, o usuário revisa e só o confirmado é gravado", async ({ page }) => {
  const erros = vigiarErros(page);
  await entrar(page, "Ana");
  const api = page.request;
  const certa = await criar(api, "LOJINHA SUGERIDA IA ALTA");
  const palpite = await criar(api, "LOJINHA SUGERIDA IA BAIXA");

  await page.route("**/api/categorizar", (route) => {
    const metodo = route.request().method();
    if (metodo === "GET") return route.fulfill({ json: { inteligente: true } });
    if (metodo === "POST") return route.fulfill({ json: {
      total: 2, porMemoria: 0, porHistorico: 0, porRegras: 0, semCategoria: 2, inteligente: "ok",
      sugestoes: [{ ...certa, categoria: "Compras", certeza: "alta" }, { ...palpite, categoria: "Lazer e Entretenimento", certeza: "baixa" }],
    } });
    return route.continue(); // PUT: aplicar de verdade
  });

  await page.goto("/lancamentos");
  await page.getByRole("button", { name: /Inteligente/ }).click();
  const revisao = page.getByRole("dialog", { name: /categorização inteligente/ });
  await expect(revisao).toBeVisible();
  await expect(revisao.getByText("Nada foi gravado ainda")).toBeVisible();
  // certeza alta vem marcada; palpite não
  await expect(revisao.getByLabel(`Aplicar em ${certa.descricao}`)).toBeChecked();
  await expect(revisao.getByLabel(`Aplicar em ${palpite.descricao}`)).not.toBeChecked();
  expect(await categoriaDe(api, certa.descricao)).toBeNull(); // abrir a revisão não grava nada

  // troca a categoria sugerida antes de aplicar
  await revisao.locator(`[data-sugestao-ia="${certa.id}"] select`).selectOption("Presentes");
  await revisao.getByRole("button", { name: "Aplicar 1" }).click();
  await expect(revisao).toBeHidden();
  await expect(page.getByText(/1 categorizado pela categorização inteligente/)).toBeVisible();

  expect(await categoriaDe(api, certa.descricao)).toBe("Presentes");
  expect(await categoriaDe(api, palpite.descricao)).toBeNull();
  for (const l of [certa, palpite]) await api.delete(`/api/lancamentos?id=${l.id}`);
  expect(erros).toEqual([]);
});

test("aplicar não mexe no que já tem categoria nem em lançamento de outra conta", async ({ page, browser }) => {
  await entrar(page, "Ana");
  const daAna = await criar(page.request, "LOJINHA DA ANA SEM CATEGORIA");

  const ctxBruno = await browser.newContext();
  const bruno = await ctxBruno.newPage();
  await entrar(bruno, "Bruno");
  expect(await (await bruno.request.put("/api/categorizar", { data: { itens: [{ id: daAna.id, categoria: "Compras" }] } })).json()).toEqual({ aplicados: 0 });
  await ctxBruno.close();
  expect(await categoriaDe(page.request, daAna.descricao)).toBeNull();

  await page.request.put("/api/lancamentos", { data: { ids: [daAna.id], categoriaCorreta: "Farmácia" } });
  expect(await (await page.request.put("/api/categorizar", { data: { itens: [{ id: daAna.id, categoria: "Compras" }] } })).json()).toEqual({ aplicados: 0 });
  expect(await categoriaDe(page.request, daAna.descricao)).toBe("Farmácia");
  await page.request.delete(`/api/lancamentos?id=${daAna.id}`);
});
