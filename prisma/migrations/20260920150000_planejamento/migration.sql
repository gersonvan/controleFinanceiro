-- Fotografia do mês
--
-- A tabela "UserProfile" existe em produção mas não foi criada por nenhuma
-- migração (levada por `db push`). Os guards IF NOT EXISTS mantêm esta
-- migração válida tanto no banco atual quanto num banco novo.
CREATE TABLE IF NOT EXISTS "UserProfile" (
    "userId" TEXT NOT NULL,
    "nome" TEXT NOT NULL DEFAULT '',
    "onboardingCompleto" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "UserProfile" ADD COLUMN IF NOT EXISTS "margemPercentual" DOUBLE PRECISION NOT NULL DEFAULT 20;
ALTER TABLE "UserProfile" ADD COLUMN IF NOT EXISTS "fotografiaConcluidaEm" TIMESTAMP(3);

CREATE TABLE "PlanejamentoItem" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "grupo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "periodicidade" TEXT NOT NULL DEFAULT 'mensal',
    "parcelaAtual" INTEGER,
    "parcelaTotal" INTEGER,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanejamentoItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlanejamentoItem_userId_grupo_idx" ON "PlanejamentoItem"("userId", "grupo");
