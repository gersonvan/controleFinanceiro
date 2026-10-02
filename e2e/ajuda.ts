import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

export async function entrar(page: Page, quem: "Ana" | "Bruno") {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(`Entrar como ${quem}`) }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

/** Junta erros de JavaScript, do console e respostas 5xx enquanto o teste roda. */
export function vigiarErros(page: Page) {
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(`erro de página: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") erros.push(`console: ${m.text()}`); });
  page.on("response", (r) => { if (r.status() >= 500) erros.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  return erros;
}

export const semente = (): { ana: { email: string; lancamentoIds: number[] } } =>
  JSON.parse(readFileSync("e2e/.estado/semente.json", "utf8"));
