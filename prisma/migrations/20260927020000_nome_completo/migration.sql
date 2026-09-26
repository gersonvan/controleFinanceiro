-- Nome completo do usuário como aparece nos extratos (reconhece Pix entre contas próprias)
ALTER TABLE "UserProfile" ADD COLUMN "nomeCompleto" TEXT NOT NULL DEFAULT '';
