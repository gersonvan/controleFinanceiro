// Zera o banco de TESTES, cria a estrutura e coloca os dados fictícios.
// Rodar com: npm run db:teste:preparar (carrega .env.test). Recusa qualquer
// banco que não seja local — o .env do projeto aponta para produção.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import pg from "pg";
import { loginDeTesteAtivo } from "../../src/lib/login-teste";

async function main() {
  if (!loginDeTesteAtivo()) {
    console.error("Recusado: precisa de AUTH_TEST_LOGIN=1 e DATABASE_URL em localhost (use npm run db:teste:preparar).");
    process.exit(1);
  }

  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  await c.end();

  // Estrutura direto do schema.prisma: as migrações não recriam o banco do zero
  // (a 20260723 indexa "userId", que entrou em produção fora delas) — ver relatório de QA.
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push"], { stdio: "inherit", env: process.env });

  const { semear } = await import("./semear");
  const estado = await semear();
  mkdirSync("e2e/.estado", { recursive: true });
  writeFileSync("e2e/.estado/semente.json", JSON.stringify(estado, null, 2));
  console.log("Banco de testes pronto:", estado.resumo);
}

main().catch((e) => { console.error(e); process.exit(1); });
