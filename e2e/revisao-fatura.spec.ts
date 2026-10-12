// Fatura em PDF: conferência com o resumo impresso e revisão das linhas antes de
// importar (corrigir, excluir, incluir). PDF montado no teste, dados fictícios.
import { expect, test, type APIRequestContext } from "@playwright/test";
import { entrar, pdfDeTexto, vigiarErros } from "./ajuda";

// layout da fatura Bradesco de 2026: compras 100 + 150 + 30 + 200 = 480; estorno 20
const fatura = pdfDeTexto([
  "Com o Bradesco, você tem a opção de substituir sua fatura do Cartão em papel",
  "ANA TESTE DA SILVA",
  "Total da fatura", "R$ 460,00",
  "Vencimento", "01/09/2026",
  "Resumo da fatura",
  "Saldo anterior......................... R$ 300,00",
  "(-) Créditos/Pagamentos..... R$ 320,00",
  "(+)Compras/Débitos............ R$ 480,00",
  "(=)Total.................................... R$ 460,00",
  "Lançamentos",
  "Data Histórico de Lançamentos Cidade US$ Cotação",
  "03/08 PAGTO. POR DEB EM C/C 300,00 -",
  "ANA TESTE DA SILVA Cartão 4066 XXXX XXXX 0001",
  "05/08 REVISAO MERCADO FICTICIO FORTALEZA 100,00",
  "10/08 REVISAO LOJA PARCELADA D02/05 FORTALEZA 150,00",
  "12/08 REVISAO LOJA ESTORNADA FORTALEZA 20,00 -",
  "15/08 REVISAO FARMACIA TESTE FORTALEZA 30,00",
  "20/08 REVISAO POSTO FICTICIO FORTALEZA 200,00",
  "Total para ANA TESTE DA SILVA 460,00",
  "Total da fatura em real 460,00",
]);
const arquivo = { name: "fatura-bradesco.pdf", mimeType: "application/pdf", buffer: fatura };

const buscar = async (api: APIRequestContext, texto: string) =>
  (await (await api.get(`/api/lancamentos?limit=50&busca=${encodeURIComponent(texto)}`)).json())
    .lancamentos as { descricao: string; valor: number; categoria: string | null; mesReferencia: string }[];

test("revisa as linhas da fatura: a conferência acompanha e a importação grava o revisado", async ({ page }) => {
  const erros = vigiarErros(page);
  await entrar(page, "Ana");
  await page.goto("/importar");
  await page.locator('input[type="file"]').last().setInputFiles(arquivo);

  const leitura = page.locator("[data-leitura-pdf]");
  await expect(page.locator('[data-conferencia="confere"]')).toContainText("R$ 480,00");
  await expect(leitura.locator("li")).toHaveCount(5); // o pagamento da fatura anterior fica de fora
  const linha = (texto: string) => leitura.locator("li", { hasText: texto });

  // excluir uma compra: a soma deixa de bater; desfazer volta
  await linha("REVISAO POSTO FICTICIO").getByRole("button", { name: "Excluir linha" }).click();
  await expect(page.locator('[data-conferencia="diferente"]')).toContainText("faltam R$ 200,00");
  await linha("REVISAO POSTO FICTICIO").getByRole("button", { name: "Desfazer" }).click();
  await expect(page.locator('[data-conferencia="confere"]')).toBeVisible();

  // excluir de novo e incluir a linha certa no lugar
  await linha("REVISAO POSTO FICTICIO").getByRole("button", { name: "Excluir linha" }).click();
  await leitura.getByRole("button", { name: "+ Incluir lançamento que faltou" }).click();
  const form = leitura.locator("[data-editando-linha]");
  await form.getByLabel("Data").fill("2026-08-21");
  await form.getByLabel("Descrição").fill("REVISAO POSTO CORRETO");
  await form.getByLabel("Valor").fill("200,00");
  await form.getByRole("button", { name: "Salvar linha" }).click();
  await expect(linha("REVISAO POSTO CORRETO")).toContainText("incluída");
  await expect(page.locator('[data-conferencia="confere"]')).toBeVisible();

  // corrigir a descrição de outra
  await linha("REVISAO FARMACIA TESTE").getByRole("button", { name: "Corrigir linha" }).click();
  await form.getByLabel("Descrição").fill("REVISAO FARMACIA CORRIGIDA");
  await form.getByRole("button", { name: "Salvar linha" }).click();
  await expect(linha("REVISAO FARMACIA CORRIGIDA")).toContainText("corrigida");
  await expect(leitura).toContainText("revisado: 1 corrigida, 1 excluída, 1 incluída");

  const resposta = page.waitForResponse((r) => r.url().endsWith("/api/importar") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Importar 5 lançamentos" }).click();
  const importacao = await (await resposta).json();
  expect(importacao).toMatchObject({ novos: 5, duplicados: 0 });

  const gravados = await buscar(page.request, "REVISAO");
  expect(gravados.map((l) => l.descricao).sort()).toEqual([
    "REVISAO FARMACIA CORRIGIDA", "REVISAO LOJA ESTORNADA FORTALEZA", "REVISAO LOJA PARCELADA D (02/05) FORTALEZA",
    "REVISAO MERCADO FICTICIO FORTALEZA", "REVISAO POSTO CORRETO",
  ]);
  expect(gravados.find((l) => l.descricao.startsWith("REVISAO LOJA ESTORNADA"))).toMatchObject({ valor: 20, categoria: "Estorno" });
  expect(gravados.every((l) => l.mesReferencia.startsWith("2026-09-01"))).toBe(true);

  // a importação revisada se desfaz inteira, inclusive a linha incluída
  expect((await page.request.delete(`/api/importacoes?id=${importacao.importacaoId}`)).status()).toBe(200);
  expect(await buscar(page.request, "REVISAO")).toEqual([]);
  expect(erros).toEqual([]);
});

test("a API recusa ajustes sobre uma leitura diferente ou malformados, sem gravar nada", async ({ page }) => {
  await entrar(page, "Ana");
  const api = page.request;
  const perfis = await (await api.get("/api/perfis?todos=true")).json() as { id: number; builtin: string | null }[];
  const perfilId = String(perfis.find((p) => p.builtin === "bradesco-cartao-pdf")!.id);
  const enviar = (ajustes: string) => api.post("/api/importar", { multipart: { perfilId, mesReferencia: "2026-09", file: arquivo, ajustes } });

  const vazio = { excluir: [], alterar: [], incluir: [] };
  expect((await enviar(JSON.stringify({ total: 4, ...vazio, excluir: [0] }))).status()).toBe(409); // a leitura tem 5
  expect((await enviar(JSON.stringify({ total: 5, ...vazio, excluir: [5] }))).status()).toBe(400);
  expect((await enviar(JSON.stringify({ total: 5, ...vazio, incluir: [{ data: "2026-13-01", descricao: "X", valor: -1 }] }))).status()).toBe(400);
  expect((await enviar("{não é json")).status()).toBe(400);
  expect(await buscar(api, "REVISAO")).toEqual([]);
});
