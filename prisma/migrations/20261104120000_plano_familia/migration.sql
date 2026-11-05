-- Plano da família: pessoas, rendas e contas da casa (com quem paga) e cenários
CREATE TABLE "PlanoFamilia" (
    "userId" TEXT NOT NULL,
    "dados" JSONB NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanoFamilia_pkey" PRIMARY KEY ("userId")
);
