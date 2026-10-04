// Migração para contas por banco (lib/bancos.ts): renomeia lançamentos, reservas e
// perfis para o nome gerado por banco + tipo + apelido, e preenche o registro de contas.
//   prévia (não altera nada):  node --env-file=.env node_modules/.bin/jiti scripts/migrar-contas.ts
//   aplicar (com backup):      ... scripts/migrar-contas.ts --aplicar <pasta-do-backup>
// Tudo numa transação; confere que nenhum lançamento some ou é criado.
import { mkdirSync, writeFileSync } from "node:fs";
import pg from "pg";
import { planejarMigracao, type PlanoMigracao } from "../src/lib/migracao-contas";

const aplicar = process.argv[2] === "--aplicar";
const pastaBackup = process.argv[3];
if (aplicar && !pastaBackup) { console.error("Informe a pasta do backup: --aplicar <pasta>"); process.exit(1); }

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const host = new URL(process.env.DATABASE_URL!).hostname.split(".")[0];
console.log(`Banco: ${host} · modo: ${aplicar ? "APLICAR" : "prévia (nada é alterado)"}\n`);

const usuarios = (await c.query(`select distinct "userId" u from "Lancamento" union select distinct "userId" from "PerfilImportacao" union select distinct "userId" from "Conta"`)).rows.map((r) => r.u as string).filter(Boolean).sort();
const planos = new Map<string, PlanoMigracao>();
for (const u of usuarios) {
  const lanc = (await c.query(`select conta, count(*)::int n from "Lancamento" where "userId"=$1 group by 1`, [u])).rows;
  const plano = planejarMigracao({
    lancamentosPorConta: new Map(lanc.map((r) => [r.conta as string, r.n as number])),
    reservas: (await c.query(`select id, conta from "Reserva" where "userId"=$1`, [u])).rows,
    perfis: (await c.query(`select id, builtin, conta from "PerfilImportacao" where "userId"=$1`, [u])).rows,
    contas: (await c.query(`select nome, tipo from "Conta" where "userId"=$1`, [u])).rows,
  });
  planos.set(u, plano);
  console.log(`== ${u}`);
  for (const i of plano.itens) {
    const muda = i.antigo !== i.novo ? `${i.antigo.padEnd(22)} → ${i.novo}` : `${i.novo.padEnd(22)}   (já no formato novo)`;
    console.log(`  ${muda.padEnd(60)} ${String(i.lancamentos).padStart(5)} lanç.${i.reservas ? ` · ${i.reservas} reserva(s)` : ""}${i.dados.banco === "outro" ? "  ⚠ sem banco reconhecido" : ""}`);
  }
  const custom = plano.perfis.filter((p) => !(p as { builtin?: string }).builtin);
  console.log(`  perfis atualizados: ${plano.perfis.length} · contas no registro ao final: ${plano.contasFinais.length}\n`);
  void custom;
}

if (!aplicar) { await c.end(); process.exit(0); }

// backup do que será alterado
mkdirSync(pastaBackup!, { recursive: true });
const backup = {
  lancamentos: (await c.query(`select id, "userId", conta from "Lancamento"`)).rows,
  reservas: (await c.query(`select id, "userId", conta from "Reserva"`)).rows,
  perfis: (await c.query(`select id, "userId", conta, banco, "tipoConta" from "PerfilImportacao"`)).rows,
  contas: (await c.query(`select * from "Conta"`)).rows,
};
const arquivo = `${pastaBackup}/backup-contas-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(arquivo, JSON.stringify(backup));
console.log(`Backup: ${arquivo}`);

const totalAntes = (await c.query(`select count(*)::int n from "Lancamento"`)).rows[0].n;
await c.query("begin");
try {
  for (const [u, plano] of planos) {
    for (const i of plano.itens) {
      if (i.antigo === i.novo) continue;
      const r = await c.query(`update "Lancamento" set conta=$1 where "userId"=$2 and conta=$3`, [i.novo, u, i.antigo]);
      if (r.rowCount !== i.lancamentos) throw new Error(`${u} ${i.antigo}: ${r.rowCount} ≠ ${i.lancamentos}`);
      await c.query(`update "Reserva" set conta=$1 where "userId"=$2 and conta=$3`, [i.novo, u, i.antigo]);
    }
    for (const p of plano.perfis)
      await c.query(`update "PerfilImportacao" set conta=$1, banco=$2, "tipoConta"=$3 where id=$4 and "userId"=$5`, [p.conta, p.banco, p.tipoConta, p.id, u]);
    for (const f of plano.contasFinais)
      await c.query(
        `insert into "Conta" ("userId", nome, banco, apelido, tipo, "createdAt", "updatedAt") values ($1,$2,$3,$4,$5, now(), now())
         on conflict ("userId", nome) do update set banco=excluded.banco, apelido=excluded.apelido, tipo=excluded.tipo, "updatedAt"=now()`,
        [u, f.nome, f.banco, f.apelido, f.tipo],
      );
    await c.query(`delete from "Conta" where "userId"=$1 and not (nome = any($2::text[]))`, [u, plano.contasFinais.map((f) => f.nome)]);
  }
  const totalDepois = (await c.query(`select count(*)::int n from "Lancamento"`)).rows[0].n;
  if (totalDepois !== totalAntes) throw new Error(`total de lançamentos mudou: ${totalAntes} → ${totalDepois}`);
  await c.query("commit");
  console.log(`Aplicado. Lançamentos: ${totalAntes} (sem perda).`);
} catch (e) {
  await c.query("rollback");
  console.error("ROLLBACK:", (e as Error).message);
  process.exitCode = 1;
}
await c.end();
