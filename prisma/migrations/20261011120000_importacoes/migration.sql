-- Importações de arquivo: agrupam os lançamentos criados, para desfazer
CREATE TABLE "Importacao" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "perfil" TEXT NOT NULL,
    "conta" TEXT NOT NULL,
    "arquivo" TEXT NOT NULL,
    "saldo" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Importacao_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Importacao_userId_createdAt_idx" ON "Importacao"("userId", "createdAt");

ALTER TABLE "Lancamento" ADD COLUMN "importacaoId" INTEGER;

CREATE INDEX "Lancamento_importacaoId_idx" ON "Lancamento"("importacaoId");

ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_importacaoId_fkey" FOREIGN KEY ("importacaoId") REFERENCES "Importacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
