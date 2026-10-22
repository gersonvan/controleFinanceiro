// Testes de ponta a ponta no ambiente de testes: banco Postgres local (Docker),
// servidor na porta 3100 com .env.test e login de teste (src/lib/login-teste.ts).
// npm run db:teste:up  →  npm run test:e2e
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/preparar.ts", // zera o banco de testes e semeia antes de cada rodada
  fullyParallel: false,
  // o servidor de teste roda em modo dev: a 1ª chamada a uma rota a compila, o que pode
  // passar dos 5 s padrão com a máquina ocupada
  expect: { timeout: 15_000 },
  workers: 1, // os testes compartilham o banco
  forbidOnly: !!process.env.CI, // um test.only esquecido não pode passar no CI pulando o resto
  // no CI, "github" anota as falhas direto nas linhas do PR
  reporter: process.env.CI
    ? [["github"], ["list"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3100",
    locale: "pt-BR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev:teste",
    url: "http://localhost:3100/login",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
