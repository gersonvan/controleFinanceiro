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

/**
 * PDF de texto mínimo, uma linha de texto por linha (Helvetica, WinAnsi, 60 linhas por
 * página) — o extrator do app (pdf-parse) devolve as mesmas linhas, como numa fatura.
 */
export function pdfDeTexto(linhas: string[]): Buffer {
  const paginas: string[][] = [];
  for (let i = 0; i < linhas.length; i += 60) paginas.push(linhas.slice(i, i + 60));
  // Latin-1: acento vira escape octal de um byte; ( ) \ escapados
  const literal = (s: string) => "(" + [...s].map((c) =>
    "()\\".includes(c) ? "\\" + c : c.charCodeAt(0) > 126 ? "\\" + c.charCodeAt(0).toString(8).padStart(3, "0") : c).join("") + ")";
  const objs = [
    "",
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${paginas.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${paginas.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  paginas.forEach((ls, i) => {
    const conteudo = "BT /F1 10 Tf 40 800 Td 14 TL\n" + ls.map((l) => `${literal(l)} '`).join("\n") + "\nET";
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    objs.push(`<< /Length ${Buffer.byteLength(conteudo, "latin1")} >>\nstream\n${conteudo}\nendstream`);
  });
  let corpo = "%PDF-1.4\n";
  const posicoes: number[] = [];
  for (let i = 1; i < objs.length; i++) {
    posicoes.push(Buffer.byteLength(corpo, "latin1"));
    corpo += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(corpo, "latin1");
  corpo += `xref\n0 ${objs.length}\n0000000000 65535 f \n` + posicoes.map((p) => `${String(p).padStart(10, "0")} 00000 n \n`).join("");
  corpo += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(corpo, "latin1");
}
