-- Perfis personalizados: descrição completa (coluna de complemento e linhas sem data)
ALTER TABLE "PerfilImportacao" ADD COLUMN "colComplemento" INTEGER;
ALTER TABLE "PerfilImportacao" ADD COLUMN "juntarLinhasSemData" BOOLEAN NOT NULL DEFAULT false;
