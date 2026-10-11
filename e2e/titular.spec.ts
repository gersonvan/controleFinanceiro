// Documento de outra pessoa: o titular não bate com o nome da Ana ("Ana Teste da
// Silva"). A importação só acontece com confirmação — pela API, no lote e no
// fluxo de um arquivo.
import { expect, test, type APIRequestContext } from "@playwright/test";
import { entrar } from "./ajuda";

// extrato da conta C6 em CSV (perfil nativo), com o nome do titular no cabeçalho
const extratoC6 = (titular: string, loja: string) => [
  "EXTRATO DE CONTA CORRENTE C6 BANK", `Nome: ${titular}`, "Agência: 1;Conta: 123456", "",
  "Data Lançamento,Data Contábil,Título,Descrição,Entrada(R$),Saída(R$),Saldo do Dia(R$)",
  `08/09/2026,08/09/2026,"DEBITO DE CARTAO ",${loja} FORTALEZA BRA,0.00,14.00,1000.00`,
].join("\n");
const faturaNubank = "date,title,amount\n2026-09-20,Titular Lote Nubank,12.50\n";

async function perfilC6(api: APIRequestContext) {
  const perfis = (await (await api.get("/api/perfis?todos=true")).json()) as { id: number; builtin: string | null }[];
  return perfis.find((p) => p.builtin === "c6-debito")!.id;
}
const importar = (api: APIRequestContext, perfilId: number, conteudo: string, confirmar = false) =>
  api.post("/api/importar", { multipart: {
    perfilId: String(perfilId), ...(confirmar ? { confirmarTitular: "1" } : {}),
    file: { name: "extrato-c6.csv", mimeType: "text/csv", buffer: Buffer.from(conteudo) },
  } });
async function desfazerTudo(api: APIRequestContext) {
  for (const i of (await (await api.get("/api/importacoes")).json()) as { id: number; arquivo: string }[])
    if (/extrato-c6|Nubank_2026-10-10/.test(i.arquivo)) await api.delete(`/api/importacoes?id=${i.id}`);
}

test("a API só importa documento de outra pessoa com confirmação", async ({ page }) => {
  await entrar(page, "Ana");
  const api = page.request;
  const perfil = await perfilC6(api);

  const recusado = await importar(api, perfil, extratoC6("FULANA DE TAL", "TITULAR API"));
  expect(recusado.status()).toBe(409);
  expect(await recusado.json()).toMatchObject({ outraPessoa: { nome: "FULANA DE TAL" }, error: "Este documento parece ser de FULANA DE TAL." });

  const confirmado = await importar(api, perfil, extratoC6("FULANA DE TAL", "TITULAR API"), true);
  expect(confirmado.status()).toBe(200);
  expect((await confirmado.json()).novos).toBe(1);

  // o da própria Ana passa direto
  const meu = await importar(api, perfil, extratoC6("ANA TESTE DA SILVA", "TITULAR API PROPRIO"));
  expect(meu.status()).toBe(200);
  await desfazerTudo(api);
});

test("no lote, o arquivo de outra pessoa só entra com \"é meu\"", async ({ page }) => {
  await entrar(page, "Ana");
  await page.goto("/importar");
  await page.locator('input[type="file"]').last().setInputFiles([
    { name: "extrato-c6.csv", mimeType: "text/csv", buffer: Buffer.from(extratoC6("FULANA DE TAL", "TITULAR LOTE")) },
    { name: "Nubank_2026-10-10.csv", mimeType: "text/csv", buffer: Buffer.from(faturaNubank) },
  ]);
  const aviso = page.locator("[data-outra-pessoa]");
  await expect(aviso).toContainText("Este documento parece ser de FULANA DE TAL.");
  const botao = page.getByRole("button", { name: /Importar \d arquivo/ });
  await expect(botao).toHaveText(/Importar 1 arquivo$/);
  const eMeu = page.getByLabel("É meu, importar mesmo assim");
  await eMeu.check();
  await expect(botao).toHaveText(/Importar 2 arquivos/);
  await eMeu.uncheck();

  await page.locator('input[type="month"]').fill("2026-10"); // a fatura do Nubank pede o mês
  // outros testes criam uma 2ª conta Nubank Crédito para a Ana: aí o app pede para escolher
  const nubank = page.locator("li").filter({ hasText: "Nubank_2026-10-10.csv" });
  await expect(nubank).not.toContainText("Conferindo a conta");
  const escolha = nubank.getByLabel("Em qual conta?");
  if (await escolha.count()) await escolha.selectOption("Nubank · Crédito");
  await botao.click();
  await expect(page.locator("li").filter({ hasText: "Nubank_2026-10-10.csv" })).toContainText("1 nova");
  await expect(page.locator("li").filter({ hasText: "extrato-c6.csv" }).locator("[data-outra-pessoa]")).toBeVisible(); // ficou de fora
  const busca = async (t: string) => (await (await page.request.get(`/api/lancamentos?limit=5&busca=${encodeURIComponent(t)}`)).json()).total;
  expect(await busca("Titular Lote Nubank")).toBe(1);
  expect(await busca("TITULAR LOTE")).toBe(1); // só o do Nubank ("Titular Lote Nubank"); o do C6 não entrou
  await desfazerTudo(page.request);
});

test("num arquivo só, recusar a confirmação não importa nada", async ({ page }) => {
  await entrar(page, "Ana");
  await page.goto("/importar");
  await page.locator('input[type="file"]').last().setInputFiles({ name: "extrato-c6.csv", mimeType: "text/csv", buffer: Buffer.from(extratoC6("FULANA DE TAL", "TITULAR UNICO")) });
  let mensagem = "";
  page.once("dialog", (d) => { mensagem = d.message(); void d.dismiss(); });
  await page.getByRole("button", { name: /Importar extrato/ }).click();
  await expect(page.getByText("Este documento parece ser de FULANA DE TAL. Importação cancelada.")).toBeVisible();
  expect(mensagem).toContain("Importar mesmo assim?");
  expect((await (await page.request.get("/api/lancamentos?limit=5&busca=TITULAR%20UNICO")).json()).total).toBe(0);
});
