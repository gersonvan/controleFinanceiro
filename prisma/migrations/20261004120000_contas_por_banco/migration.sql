-- Contas por banco: banco + tipo (Débito/Crédito) + apelido. Só acrescenta colunas;
-- os nomes existentes são convertidos por scripts/migrar-contas.ts (com prévia).
ALTER TABLE "Conta" ADD COLUMN "banco" TEXT NOT NULL DEFAULT 'outro';
ALTER TABLE "Conta" ADD COLUMN "apelido" TEXT NOT NULL DEFAULT '';

ALTER TABLE "PerfilImportacao" ADD COLUMN "banco" TEXT;
ALTER TABLE "PerfilImportacao" ADD COLUMN "tipoConta" TEXT;
