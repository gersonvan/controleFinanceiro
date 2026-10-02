-- "Mesmo pagamento": nome comum para descrições diferentes do mesmo compromisso
CREATE TABLE "Apelido" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Apelido_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Apelido_userId_idx" ON "Apelido"("userId");

CREATE UNIQUE INDEX "Apelido_userId_chave_key" ON "Apelido"("userId", "chave");
