-- Plano da família compartilhado: o plano deixa de ser das finanças de alguém e
-- passa a ter membros (quem criou + convidados). O plano que já existe vira o
-- primeiro plano de quem o tinha, com essa pessoa como membro. A renda e as
-- contas pessoais de cada membro começam privadas (só ele vê).
ALTER TABLE "PlanoFamilia" RENAME TO "PlanoFamiliaAntigo";
ALTER TABLE "PlanoFamiliaAntigo" RENAME CONSTRAINT "PlanoFamilia_pkey" TO "PlanoFamiliaAntigo_pkey";

CREATE TABLE "PlanoFamilia" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "criadoPor" TEXT NOT NULL,
    "dados" JSONB NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 0,
    "atualizadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanoFamilia_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PlanoFamilia_criadoPor_idx" ON "PlanoFamilia"("criadoPor");

CREATE TABLE "MembroPlano" (
    "id" SERIAL NOT NULL,
    "planoId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "pessoa" TEXT,
    "aceito" BOOLEAN NOT NULL DEFAULT false,
    "convidadoPor" TEXT,
    "vistos" JSONB,
    "mostrarRenda" BOOLEAN NOT NULL DEFAULT false,
    "mostrarPessoais" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembroPlano_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MembroPlano_planoId_email_key" ON "MembroPlano"("planoId", "email");
CREATE INDEX "MembroPlano_email_idx" ON "MembroPlano"("email");
ALTER TABLE "MembroPlano" ADD CONSTRAINT "MembroPlano_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "PlanoFamilia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "PlanoFamilia" ("nome", "criadoPor", "dados", "versao", "atualizadoPor", "createdAt", "updatedAt")
SELECT 'Plano da família', lower("userId"), "dados", "versao", lower("userId"), "createdAt", "updatedAt" FROM "PlanoFamiliaAntigo";
INSERT INTO "MembroPlano" ("planoId", "email", "aceito", "createdAt")
SELECT "id", "criadoPor", true, "createdAt" FROM "PlanoFamilia";

DROP TABLE "PlanoFamiliaAntigo";
