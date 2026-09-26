-- Reserva: onde o dinheiro guardado está, com saldo informado e atualização pelos extratos
CREATE TABLE "Reserva" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'investimento',
    "bloqueada" BOOLEAN NOT NULL DEFAULT false,
    "saldoInformado" DOUBLE PRECISION NOT NULL,
    "dataSaldo" TIMESTAMP(3) NOT NULL,
    "conta" TEXT,
    "filtroDescricao" TEXT,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reserva_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Reserva_userId_idx" ON "Reserva"("userId");
