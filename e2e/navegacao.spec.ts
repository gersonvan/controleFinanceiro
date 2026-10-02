// Todas as páginas do menu abrem com dados, sem erro de JavaScript, console ou 5xx.
import { expect, test } from "@playwright/test";
import { entrar, vigiarErros } from "./ajuda";

const PAGINAS = [
  "/", "/planejamento", "/importar", "/lancamentos", "/lancamentos/revisar",
  "/matriz", "/previsao", "/reserva", "/emprestimos", "/financas/meios", "/financas/divida",
  "/configuracoes/contas", "/configuracoes/importacao", "/configuracoes/memoria", "/configuracoes/mesmo-pagamento",
];

for (const caminho of PAGINAS) {
  test(`abre ${caminho}`, async ({ page }) => {
    const erros = vigiarErros(page);
    await entrar(page, "Ana");
    await page.goto(caminho);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("aside")).toBeVisible();
    await expect(page.locator("main h1").first()).toBeVisible();
    await expect(page.getByText(/couldn.t load|Application error|Unhandled Runtime Error/i)).toHaveCount(0);
    expect(erros).toEqual([]);
  });
}
