// Contas por banco: a importação descobre a conta pelo banco + tipo do arquivo.
// Com duas contas do mesmo banco e tipo (apelidos), pede para escolher.
import { expect, test } from "@playwright/test";
import { entrar } from "./ajuda";

const ofx = (org: string, fid: string, cartao: boolean, itens: [string, number, string][]) => [
  "OFXHEADER:100", "DATA:OFXSGML", "<OFX>",
  `<SIGNONMSGSRSV1><SONRS><FI><ORG>${org}</ORG><FID>${fid}</FID></FI></SONRS></SIGNONMSGSRSV1>`,
  cartao ? "<CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><BANKTRANLIST>" : "<BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>",
  ...itens.map(([d, v, m]) => `<STMTTRN><TRNTYPE>${v < 0 ? "DEBIT" : "CREDIT"}<DTPOSTED>${d}<TRNAMT>${v.toFixed(2)}<MEMO>${m}</STMTTRN>`),
  cartao ? "</BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>" : "</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>",
].join("\n");

test("duas contas de crédito Nubank: a importação pede a conta e grava nela", async ({ page }) => {
  await entrar(page, "Ana");
  expect((await page.request.post("/api/contas", { data: { banco: "nubank", tipo: "cartao", apelido: "final 1234" } })).status()).toBe(201);

  await page.goto("/importar");
  await page.locator('input[type="file"]').last().setInputFiles({
    name: "Nubank_2026-09-10.ofx", mimeType: "application/x-ofx",
    buffer: Buffer.from(ofx("NU PAGAMENTOS S.A.", "260", true, [["20260902", -30.5, "LOJA DESTINO A"], ["20260905", -12.9, "LOJA DESTINO B"]])),
  });
  const escolha = page.getByLabel("Em qual conta?");
  await expect(escolha).toBeVisible();
  const botao = page.getByRole("button", { name: /Importar agora/ });
  await expect(botao).toBeDisabled();
  await escolha.selectOption("Nubank · Crédito · final 1234");
  await expect(botao).toBeEnabled();
  await botao.click();
  await expect(page.getByText(/2 novas transações importadas/)).toBeVisible();

  const lista = await (await page.request.get("/api/lancamentos?busca=LOJA%20DESTINO&limit=50")).json();
  expect(lista.lancamentos.map((l: { conta: string }) => l.conta)).toEqual(["Nubank · Crédito · final 1234", "Nubank · Crédito · final 1234"]);
});

test("banco ainda sem conta: o extrato do BB vai sozinho para 'BB · Débito'", async ({ page }) => {
  await entrar(page, "Ana"); // a Ana só tem contas na Nubank
  await page.goto("/importar");
  await page.locator('input[type="file"]').last().setInputFiles({
    name: "extrato.ofx", mimeType: "application/x-ofx",
    buffer: Buffer.from(ofx("Banco do Brasil", "1", false, [["20260910", -45, "PADARIA DESTINO"]])),
  });
  await expect(page.getByText("Vai para a conta")).toContainText("BB · Débito");
  await expect(page.getByText("(nova)")).toBeVisible();
  await page.getByRole("button", { name: /Importar agora/ }).click();
  await expect(page.getByText(/1 nova transação importada/)).toBeVisible();
  const lista = await (await page.request.get("/api/lancamentos?busca=PADARIA%20DESTINO")).json();
  expect(lista.lancamentos[0].conta).toBe("BB · Débito");
});
