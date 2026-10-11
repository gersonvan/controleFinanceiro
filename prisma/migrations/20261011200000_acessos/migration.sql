-- Finanças compartilhadas: quem pode ver ou ajudar nas finanças de quem
CREATE TABLE "Acesso" (
    "id" SERIAL NOT NULL,
    "donoUserId" TEXT NOT NULL,
    "membroEmail" TEXT NOT NULL,
    "papel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Acesso_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Acesso_donoUserId_membroEmail_key" ON "Acesso"("donoUserId", "membroEmail");

CREATE INDEX "Acesso_membroEmail_idx" ON "Acesso"("membroEmail");
