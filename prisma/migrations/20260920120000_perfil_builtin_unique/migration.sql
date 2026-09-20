-- Remove perfis nativos duplicados (GETs concorrentes em /api/perfis podiam
-- criar o mesmo builtin duas vezes), mantendo o mais antigo de cada par.
DELETE FROM "PerfilImportacao" p
USING "PerfilImportacao" q
WHERE p."userId" = q."userId"
  AND p."builtin" = q."builtin"
  AND p."builtin" IS NOT NULL
  AND p."id" > q."id";

-- Garante um perfil nativo por usuário. NULL não colide em índices únicos do
-- Postgres, então perfis personalizados (builtin NULL) continuam ilimitados.
CREATE UNIQUE INDEX "PerfilImportacao_userId_builtin_key"
  ON "PerfilImportacao"("userId", "builtin");
