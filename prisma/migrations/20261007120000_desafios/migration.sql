-- Desafios: metas curtas com medição automática nos lançamentos
CREATE TABLE "Desafio" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "categoria" TEXT,
    "meta" DOUBLE PRECISION NOT NULL,
    "referencia" DOUBLE PRECISION NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "resultado" DOUBLE PRECISION,
    "economia" DOUBLE PRECISION,
    "parcial" BOOLEAN NOT NULL DEFAULT false,
    "encerradoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Desafio_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Desafio_userId_status_idx" ON "Desafio"("userId", "status");
