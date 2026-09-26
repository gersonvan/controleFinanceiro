-- Previsão: categorias marcadas como encerradas (ex.: prestação de imóvel vendido)
ALTER TABLE "UserProfile" ADD COLUMN "previsaoEncerradas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
