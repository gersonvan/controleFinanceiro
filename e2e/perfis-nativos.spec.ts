// Conta nova reconhece sozinha o extrato do C6 e os CSVs do Nubank (antes esses
// perfis só existiam para quem criou a conta na primeira versão do app).
import { expect, test } from "@playwright/test";
import { entrar } from "./ajuda";

const ARQUIVOS: [string, string, string, string][] = [
  ["Nubank_2026-10-10.csv", "date,title,amount\n2026-09-20,Padaria Nativa,12.50\n", "Nubank — Fatura Cartão (CSV)", "Nubank · Crédito"],
  ["NU_123_01SET2026_30SET2026.csv", "Data,Valor,Identificador,Descrição\n20/09/2026,-12.50,abc,Compra no débito - Padaria Nativa\n", "Nubank — Extrato da Conta (CSV)", "Nubank · Débito"],
  ["extrato-c6.csv", [
    "EXTRATO DE CONTA CORRENTE C6 BANK", "Agência: 1;Conta: 123456", "",
    "Data Lançamento,Data Contábil,Título,Descrição,Entrada(R$),Saída(R$),Saldo do Dia(R$)",
    "08/09/2026,08/09/2026,\"DEBITO DE CARTAO \",PADARIA NATIVA FORTALEZA BRA,0.00,14.00,1000.00",
  ].join("\n"), "C6 — Extrato da Conta (CSV)", "C6 · Débito"],
];

test("conta nova reconhece o extrato do C6 e os CSVs do Nubank", async ({ page }) => {
  await entrar(page, "Bruno");
  for (const [nome, conteudo, perfil, conta] of ARQUIVOS) {
    const r = await page.request.post("/api/importar/analisar", { multipart: { file: { name: nome, mimeType: "text/csv", buffer: Buffer.from(conteudo) } } });
    const analise = await r.json();
    expect(analise, nome).toMatchObject({ reconhecido: true, total: 1, perfil: { nome: perfil, conta } });
  }
});
