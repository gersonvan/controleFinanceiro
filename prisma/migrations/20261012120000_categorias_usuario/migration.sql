-- Categorias do usuário: nativas ocultas (com destino) e categorias personalizadas
CREATE TABLE "CategoriaUsuario" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nativa" BOOLEAN NOT NULL,
    "grupo" TEXT,
    "destino" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoriaUsuario_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CategoriaUsuario_userId_nome_key" ON "CategoriaUsuario"("userId", "nome");
