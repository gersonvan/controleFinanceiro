// Editar perfil personalizado vendo o arquivo: prévia dos lançamentos, aviso de
// descrição genérica, coluna de complemento e linhas de baixo na descrição.
import { expect, test } from "@playwright/test";
import { entrar } from "./ajuda";

const CSV = [
  "Data;Histórico;Detalhes;Crédito (R$);Débito (R$)",
  "03/10/2026;PIX ENVIADO;;;80,00",
  ";EDITAR FULANO DE TAL;;;",
  "04/10/2026;PIX QR CODE DINAMICO;;;25,00",
  ";EDITAR PADARIA BOA;;;",
  "05/10/2026;TRANSFERENCIA RECEBIDA;EDITAR CICLANO;300,00;",
].join("\n");

test("ajusta o perfil com um arquivo de exemplo e a importação sai com a descrição completa", async ({ page }) => {
  await entrar(page, "Ana");
  const api = page.request;
  // como o "Bradesco CC" que importou "PIX ENVIADO" sem o nome
  const perfil = await (await api.post("/api/perfis", { data: {
    nome: "Banco Exemplo CSV", conta: "Nubank · Débito", formato: "csv", delimitador: ";", linhasPular: 1,
    modoValor: "separadas", colData: 0, colDescricao: 1, colEntrada: 3, colSaida: 4,
  } })).json();

  await page.goto("/configuracoes/importacao");
  await page.locator(`a[href="/configuracoes/importacao/perfil?id=${perfil.id}"]`).click();
  await expect(page.getByRole("heading", { name: "Editar perfil: Banco Exemplo CSV" })).toBeVisible();

  await page.getByLabel("Arquivo de exemplo").setInputFiles({ name: "extrato.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) });
  const previa = page.locator("[data-previa-lancamentos]");
  await expect(previa).toContainText("3 lançamentos");
  // o arquivo traz o nome na linha de baixo: a tela já sugere juntar
  const juntar = page.getByLabel("Linhas sem data completam a descrição da linha de cima");
  await expect(juntar).toBeChecked();
  await expect(previa).toContainText("PIX ENVIADO - EDITAR FULANO DE TAL");
  await expect(previa).toContainText("PIX QR CODE DINAMICO - EDITAR PADARIA BOA");

  // a prévia avisa enquanto alguma descrição fica genérica
  await juntar.uncheck();
  await expect(previa.getByRole("alert")).toContainText("3 de 3 descrições só dizem o tipo da transação");
  await juntar.check();
  await expect(previa.getByRole("alert")).toContainText("1 de 3"); // TRANSFERENCIA RECEBIDA, sem o nome

  // a coluna "Detalhes" como complemento
  await page.getByLabel("Papel da coluna 3").selectOption("complemento");
  await expect(previa).toContainText("TRANSFERENCIA RECEBIDA - EDITAR CICLANO");
  await expect(previa.getByRole("alert")).toHaveCount(0);

  await page.getByRole("button", { name: "Salvar perfil" }).click();
  await page.waitForURL("**/configuracoes/importacao");
  const salvo = ((await (await api.get("/api/perfis?todos=true")).json()) as { id: number; juntarLinhasSemData: boolean; colComplemento: number | null }[])
    .find((p) => p.id === perfil.id)!;
  expect(salvo).toMatchObject({ juntarLinhasSemData: true, colComplemento: 2 });

  // a importação com o perfil corrigido
  const r = await api.post("/api/importar", { multipart: { perfilId: String(perfil.id), file: { name: "extrato.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) } } });
  const { importacaoId } = await r.json();
  const lista = (await (await api.get("/api/lancamentos?limit=10&busca=EDITAR")).json()).lancamentos as { descricao: string }[];
  expect(lista.map((l) => l.descricao).sort()).toEqual([
    "PIX ENVIADO - EDITAR FULANO DE TAL", "PIX QR CODE DINAMICO - EDITAR PADARIA BOA", "TRANSFERENCIA RECEBIDA - EDITAR CICLANO",
  ]);

  await api.delete(`/api/importacoes?id=${importacaoId}`);
  await api.delete(`/api/perfis?id=${perfil.id}`);
});
