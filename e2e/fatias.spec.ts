// 50/30/20: a divisão do mês no dashboard e a fatia de uma categoria própria.
import { expect, test, type APIRequestContext } from "@playwright/test";
import { entrar, vigiarErros } from "./ajuda";

interface Parte { valor: number; percentual: number | null; categorias: { categoria: string; valor: number }[] }
interface Divisao { renda: number; necessidades: Parte; desejos: Parte; futuro: Parte & { aplicado: number; naConta: number }; semFatia: { valor: number } }

const hoje = new Date();
const [ANO, MES] = [hoje.getFullYear(), hoje.getMonth() + 1];
const dividir = async (api: APIRequestContext) => (await (await api.get(`/api/financas/fatias?ano=${ANO}&mes=${MES}`)).json()) as Divisao;
const arred = (n: number) => Math.round(n * 100) / 100;

test("divide a renda do mês e a categoria própria vai para a fatia escolhida", async ({ page }) => {
  const erros = vigiarErros(page);
  await entrar(page, "Ana");
  const api = page.request;

  // a conta fecha: o futuro é o que sobrou da renda depois de todos os gastos
  const antes = await dividir(api);
  expect(antes.renda).toBeGreaterThan(0);
  expect(antes.futuro.valor).toBe(arred(antes.renda - antes.necessidades.valor - antes.desejos.valor - antes.semFatia.valor));

  // cartão no dashboard, com as categorias de cada fatia
  await page.goto("/");
  const cartao = page.locator("[data-divisao-mes]");
  await expect(cartao.locator("[data-fatia]")).toHaveCount(3);
  await cartao.getByRole("button", { name: "Ver categorias de cada fatia" }).click();
  await expect(cartao.locator("[data-detalhe-fatias]")).toBeVisible();

  // categoria própria criada como "futuro": o gasto nela conta como aplicado
  expect((await api.post("/api/categorias", { data: { nome: "Previdência teste", grupo: "Financeiro", fatia: "futuro" } })).status()).toBe(201);
  const dia = `${ANO}-${String(MES).padStart(2, "0")}-05`;
  const l = await (await api.post("/api/lancamentos", { data: {
    data: dia, descricao: "PREVIDENCIA FICTICIA", valor: -200, tipo: "Saída", conta: "Nubank · Débito", categoria: "Previdência teste",
  } })).json();
  const comoFuturo = await dividir(api);
  expect(comoFuturo.futuro.aplicado).toBe(arred(antes.futuro.aplicado + 200));
  expect(comoFuturo.futuro.categorias).toContainEqual({ categoria: "Previdência teste", valor: 200 });

  // trocar a fatia na tela de Categorias: passa a contar como necessidade
  await page.goto("/configuracoes/categorias");
  await page.getByLabel("Fatia de Previdência teste").selectOption("necessidades");
  await expect(page.getByRole("status")).toContainText("agora conta como necessidades");
  const comoNecessidade = await dividir(api);
  expect(comoNecessidade.necessidades.categorias).toContainEqual({ categoria: "Previdência teste", valor: 200 });
  expect(comoNecessidade.futuro.aplicado).toBe(antes.futuro.aplicado);

  // limpeza
  expect((await api.delete(`/api/lancamentos?id=${l.id}`)).status()).toBe(200);
  expect((await api.patch("/api/categorias", { data: { acao: "excluir", nome: "Previdência teste", destino: null } })).status()).toBe(200);
  expect(erros).toEqual([]);
});
