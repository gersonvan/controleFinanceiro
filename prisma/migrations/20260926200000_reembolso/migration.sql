-- "Dividir": Pix recebido que reembolsa um ou mais gastos
ALTER TABLE "Lancamento" ADD COLUMN "valorReembolsado" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE TABLE "Reembolso" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "entradaId" INTEGER NOT NULL,
    "saidaId" INTEGER NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reembolso_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Reembolso_entradaId_saidaId_key" ON "Reembolso"("entradaId", "saidaId");
CREATE INDEX "Reembolso_userId_saidaId_idx" ON "Reembolso"("userId", "saidaId");

ALTER TABLE "Reembolso" ADD CONSTRAINT "Reembolso_entradaId_fkey" FOREIGN KEY ("entradaId") REFERENCES "Lancamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reembolso" ADD CONSTRAINT "Reembolso_saidaId_fkey" FOREIGN KEY ("saidaId") REFERENCES "Lancamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
