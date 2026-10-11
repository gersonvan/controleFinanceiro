// Finanças compartilhadas: o Bruno (dono) dá acesso à Ana. Ela abre as finanças
// dele pelo menu, ajuda (altera nas dele, não nas dela), depois só vê (alterar é
// recusado) e, com o acesso retirado ou o cookie forjado, volta às próprias.
// O Bruno compartilha pela API: a conta dele continua sem onboarding para os outros testes.
import { expect, test, type APIRequestContext, type Browser } from "@playwright/test";
import { entrar } from "./ajuda";

test.describe.configure({ mode: "serial" });

const ANA = "ana.teste@example.com";
const BRUNO = "bruno.teste@example.com";
let bruno: { api: APIRequestContext; fechar: () => Promise<void> };
let acessoId: number;

async function logar(browser: Browser, quem: "Ana" | "Bruno") {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await entrar(page, quem);
  return { page, api: page.request, ctx, fechar: () => ctx.close() };
}
const total = async (api: APIRequestContext) => (await (await api.get("/api/lancamentos?limit=1")).json()).total as number;
const regras = async (api: APIRequestContext) => ((await (await api.get("/api/memoria-ia")).json()) as { id: number; descricao: string }[]);

test.beforeAll(async ({ browser }) => {
  bruno = await logar(browser, "Bruno");
  const r = await bruno.api.post("/api/acessos", { data: { email: ANA, papel: "ajudar" } });
  expect(r.status()).toBe(201);
  acessoId = (await r.json()).id;
  expect((await bruno.api.post("/api/acessos", { data: { email: ANA, papel: "ver" } })).status()).toBe(409);
  expect((await bruno.api.post("/api/acessos", { data: { email: BRUNO, papel: "ver" } })).status()).toBe(400);
});
test.afterAll(async () => {
  await bruno.api.delete(`/api/acessos?id=${acessoId}`).catch(() => {});
  await bruno.fechar();
});

test("com \"ajudar\", a Ana abre as finanças do Bruno pelo menu e altera nas dele", async ({ page }) => {
  await entrar(page, "Ana");
  const proprias = await total(page.request);
  expect(proprias).toBeGreaterThan(0);

  await page.goto("/");
  await page.locator("aside").getByLabel("Finanças abertas").selectOption(BRUNO);
  const aviso = page.locator("[data-espaco-aviso]");
  await expect(aviso).toContainText(`Você está nas finanças de ${BRUNO}`);
  await expect(aviso).toContainText("pode ajudar");
  expect(await total(page.request)).toBe(0); // as do Bruno (conta nova)

  const r = await page.request.post("/api/memoria-ia", { data: { descricao: "COMPARTILHADA TESTE", categoriaCorreta: "Compras" } });
  expect(r.ok()).toBe(true);
  const doBruno = (await regras(bruno.api)).find((x) => x.descricao.toLowerCase().includes("compartilhada teste"));
  expect(doBruno).toBeTruthy();

  await aviso.getByRole("button", { name: "Voltar para as minhas" }).click();
  await expect(aviso).toHaveCount(0);
  expect(await total(page.request)).toBe(proprias);
  expect((await regras(page.request)).some((x) => x.descricao.toLowerCase().includes("compartilhada teste"))).toBe(false);
  await bruno.api.delete(`/api/memoria-ia?id=${doBruno!.id}`);
});

test("com \"ver\", ela acompanha mas não altera nada", async ({ page }) => {
  expect((await bruno.api.patch("/api/acessos", { data: { id: acessoId, papel: "ver" } })).ok()).toBe(true);
  await entrar(page, "Ana");
  expect((await page.request.put("/api/espaco", { data: { dono: BRUNO } })).ok()).toBe(true);

  expect((await page.request.get("/api/lancamentos?limit=1")).ok()).toBe(true);
  expect((await page.request.post("/api/memoria-ia", { data: { descricao: "NAO PODE", categoriaCorreta: "Compras" } })).status()).toBe(401);
  expect((await page.request.post("/api/lancamentos", { data: { data: "2026-10-01", descricao: "NAO PODE", valor: -1, tipo: "Saída", conta: "Nubank · Débito" } })).status()).toBe(401);
  expect((await regras(bruno.api)).some((x) => x.descricao.toLowerCase().includes("nao pode"))).toBe(false);

  await page.goto("/importar");
  await expect(page.getByText(`Você está só vendo as finanças de ${BRUNO}`)).toBeVisible();
  await page.goto("/lancamentos");
  await expect(page.locator("[data-espaco-aviso]")).toContainText("só visualização");
  await expect(page.getByRole("button", { name: "+ Novo" })).toHaveCount(0);

  // trocar de finanças continua possível para quem só vê
  expect((await page.request.put("/api/espaco", { data: { dono: ANA } })).ok()).toBe(true);
  expect(await total(page.request)).toBeGreaterThan(0);
});

test("acesso retirado ou cookie forjado: cada um nas próprias finanças", async ({ page, context, baseURL }) => {
  await entrar(page, "Ana");
  const proprias = await total(page.request);
  expect((await page.request.put("/api/espaco", { data: { dono: BRUNO } })).ok()).toBe(true);
  expect(await total(page.request)).toBe(0);

  expect((await bruno.api.delete(`/api/acessos?id=${acessoId}`)).ok()).toBe(true);
  expect(await total(page.request)).toBe(proprias); // na hora, sem relogar
  expect((await page.request.put("/api/espaco", { data: { dono: BRUNO } })).status()).toBe(403);

  // cookie montado à mão para as finanças do Bruno: ignorado
  await context.addCookies([{ name: "espaco", value: BRUNO, url: baseURL! }]);
  expect(await total(page.request)).toBe(proprias);
  expect((await (await page.request.get("/api/espaco")).json()).atual.dono).toBe(ANA);
});

test("pela tela: dar acesso, mudar o nível e tirar", async ({ page }) => {
  await entrar(page, "Ana");
  await page.goto("/configuracoes/compartilhar");
  await page.getByLabel("E-mail da pessoa").fill(BRUNO);
  await page.getByRole("button", { name: "Dar acesso" }).click();
  const item = page.locator(`[data-acesso="${BRUNO}"]`);
  await expect(item).toBeVisible();
  await item.getByLabel(`Acesso de ${BRUNO}`).selectOption("ver");
  await expect.poll(async () => ((await (await page.request.get("/api/acessos")).json()).meus as { papel: string }[])[0]?.papel).toBe("ver");
  // o Bruno vê as finanças da Ana na lista dele
  expect(((await (await bruno.api.get("/api/acessos")).json()).comigo as { dono: string }[]).map((c) => c.dono)).toEqual([ANA]);
  page.once("dialog", (d) => d.accept());
  await item.getByRole("button", { name: "Tirar acesso" }).click();
  await expect(item).toHaveCount(0);
  await expect(page.getByText("Ninguém além de você.")).toBeVisible();
});
