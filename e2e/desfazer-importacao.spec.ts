// Desfazer importação: apaga só os lançamentos que aquela importação criou e
// devolve o saldo da conta na Reserva ao que era antes dela.
import { expect, test, type APIRequestContext } from "@playwright/test";
import { entrar } from "./ajuda";

// CSV no formato do extrato Bradesco (Data;Histórico;Docto.;Crédito;Débito;Saldo)
const csv = (linhas: [string, string, number, number][]) => [
  "Extrato de: Ag: 1 | Conta: 2;;;;;",
  "Data;Histórico;Docto.;Crédito (R$);Débito (R$);Saldo (R$)",
  ...linhas.map(([d, h, v, saldo]) =>
    `${d};${h};1;${v > 0 ? v.toFixed(2).replace(".", ",") : " "};${v < 0 ? (-v).toFixed(2).replace(".", ",") : " "};${saldo.toFixed(2).replace(".", ",")}`),
].join("\n");

async function importarCSV(api: APIRequestContext, perfilId: number, nome: string, conteudo: string) {
  const r = await api.post("/api/importar", { multipart: {
    perfilId: String(perfilId), file: { name: nome, mimeType: "text/csv", buffer: Buffer.from(conteudo) },
  } });
  expect(r.status()).toBe(200);
  return r.json() as Promise<{ novos: number; importacaoId: number }>;
}
const buscar = async (api: APIRequestContext, texto: string) =>
  (await (await api.get(`/api/lancamentos?limit=50&busca=${encodeURIComponent(texto)}`)).json()).lancamentos as { descricao: string }[];
const saldoDaConta = async (api: APIRequestContext) =>
  ((await (await api.get("/api/reservas")).json()).reservas as { conta: string | null; saldoInformado: number }[])
    .find((r) => r.conta === "Bradesco · Débito")?.saldoInformado;

test("desfaz só a importação escolhida e o saldo volta ao anterior", async ({ page, browser }) => {
  await entrar(page, "Ana");
  const api = page.request;
  const perfil = await (await api.post("/api/perfis", { data: {
    nome: "Bradesco CSV (teste desfazer)", conta: "Bradesco · Débito", formato: "csv", delimitador: ";", linhasPular: 2,
    modoValor: "separadas", colData: 0, colDescricao: 1, colEntrada: 3, colSaida: 4,
  } })).json();

  const primeira = await importarCSV(api, perfil.id, "bradesco-setembro.csv",
    csv([["01/10/2026", "DESFAZER PRIMEIRA A", -10, 990], ["02/10/2026", "DESFAZER PRIMEIRA B", -40, 950]]));
  const segunda = await importarCSV(api, perfil.id, "bradesco-errado.csv",
    csv([["05/10/2026", "DESFAZER SEGUNDA A", -100, 850], ["06/10/2026", "DESFAZER SEGUNDA B", -50, 800]]));
  expect([primeira.novos, segunda.novos]).toEqual([2, 2]);
  expect(await saldoDaConta(api)).toBe(800);

  // isolamento: o Bruno não vê nem desfaz importação da Ana
  const ctxBruno = await browser.newContext();
  const bruno = await ctxBruno.newPage();
  await entrar(bruno, "Bruno");
  expect(await (await bruno.request.get("/api/importacoes")).json()).toEqual([]);
  expect((await bruno.request.delete(`/api/importacoes?id=${segunda.importacaoId}`)).status()).toBe(404);
  await ctxBruno.close();

  await page.goto("/importar");
  const item = page.locator(`[data-importacao="${segunda.importacaoId}"]`);
  await expect(item).toContainText("bradesco-errado.csv");
  await expect(item).toContainText("2 lançamentos");
  page.once("dialog", (d) => d.accept());
  await item.getByRole("button", { name: "Desfazer" }).click();
  await expect(page.getByRole("status")).toContainText("2 lançamento(s) apagado(s) e o saldo da conta voltou ao anterior");
  await expect(item).toHaveCount(0);

  expect(await buscar(api, "DESFAZER SEGUNDA")).toEqual([]);
  expect((await buscar(api, "DESFAZER PRIMEIRA")).length).toBe(2);
  expect(await saldoDaConta(api)).toBe(950);

  // limpeza
  expect((await api.delete(`/api/importacoes?id=${primeira.importacaoId}`)).status()).toBe(200);
  expect(await buscar(api, "DESFAZER PRIMEIRA")).toEqual([]);
  await api.delete(`/api/perfis?id=${perfil.id}`);
});

test("depois de importar, dá para desfazer pela própria tela de resultado", async ({ page }) => {
  await entrar(page, "Ana");
  await page.goto("/importar");
  const ofx = [
    "OFXHEADER:100", "DATA:OFXSGML", "<OFX>",
    "<SIGNONMSGSRSV1><SONRS><FI><ORG>NU PAGAMENTOS S.A.</ORG><FID>260</FID></FI></SONRS></SIGNONMSGSRSV1>",
    "<BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>",
    "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261003<TRNAMT>-22.50<MEMO>DESFAZER RESULTADO</STMTTRN>",
    "</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>",
  ].join("\n");
  await page.locator('input[type="file"]').last().setInputFiles({ name: "nubank.ofx", mimeType: "application/x-ofx", buffer: Buffer.from(ofx) });
  await page.getByRole("button", { name: /Importar agora/ }).click();
  await expect(page.getByText(/1 nova transação importada/)).toBeVisible();
  expect((await buscar(page.request, "DESFAZER RESULTADO")).length).toBe(1);

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Desfazer esta importação/ }).click();
  await expect(page.getByRole("status")).toContainText("1 lançamento(s) apagado(s)");
  expect(await buscar(page.request, "DESFAZER RESULTADO")).toEqual([]);
});
