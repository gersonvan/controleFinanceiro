-- CreateTable
CREATE TABLE "Lancamento" (
    "id" SERIAL NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "descricao" TEXT NOT NULL,
    "categoria" TEXT,
    "valor" DOUBLE PRECISION NOT NULL,
    "tipo" TEXT NOT NULL,
    "conta" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Paga',
    "fonte" TEXT,
    "mesReferencia" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lancamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoriaIA" (
    "id" SERIAL NOT NULL,
    "descricao" TEXT NOT NULL,
    "categoriaCorreta" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemoriaIA_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lancamento_data_idx" ON "Lancamento"("data");

-- CreateIndex
CREATE INDEX "Lancamento_categoria_idx" ON "Lancamento"("categoria");

-- CreateIndex
CREATE INDEX "Lancamento_conta_idx" ON "Lancamento"("conta");

-- CreateIndex
CREATE INDEX "Lancamento_tipo_idx" ON "Lancamento"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "MemoriaIA_descricao_key" ON "MemoriaIA"("descricao");
