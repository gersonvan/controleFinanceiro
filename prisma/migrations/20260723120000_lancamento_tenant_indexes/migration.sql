-- Índices compostos para as consultas sempre delimitadas pelo tenant.
CREATE INDEX IF NOT EXISTS "Lancamento_userId_data_idx"
ON "Lancamento"("userId", "data");

CREATE INDEX IF NOT EXISTS "Lancamento_userId_mesReferencia_idx"
ON "Lancamento"("userId", "mesReferencia");

CREATE INDEX IF NOT EXISTS "Lancamento_userId_categoria_idx"
ON "Lancamento"("userId", "categoria");

CREATE INDEX IF NOT EXISTS "Lancamento_userId_pessoa_idx"
ON "Lancamento"("userId", "pessoa");
