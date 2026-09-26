-- Tipo de cada conta (corrente ou cartão de crédito)
CREATE TABLE "Conta" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'corrente',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conta_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Conta_userId_nome_key" ON "Conta"("userId", "nome");
