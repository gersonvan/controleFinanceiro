// Roda um script Node com as variáveis do .env.test por cima das do .env
// (que aponta para produção). `node --env-file` não serve para o Next: ele
// repassa as opções do Node aos processos filhos, e --env-file não é aceito lá.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

// sobrescreve o que já existir (process.loadEnvFile não sobrescreve: um DATABASE_URL
// exportado no shell levaria os testes para outro banco)
// caminho a partir deste arquivo: funciona rodando de qualquer pasta
Object.assign(process.env, parseEnv(readFileSync(new URL("../../.env.test", import.meta.url), "utf8")));
const [script, ...args] = process.argv.slice(2);
const filho = spawn(process.execPath, [script, ...args], { stdio: "inherit", env: process.env });
filho.on("exit", (codigo, sinal) => (sinal ? process.kill(process.pid, sinal) : process.exit(codigo ?? 1)));
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => filho.kill(s));
