-- Uma conta por usuário + banco + Débito/Crédito + apelido (lib/bancos.ts).
-- Conferido antes em produção: nenhuma combinação repetida.
CREATE UNIQUE INDEX "Conta_userId_banco_tipo_apelido_key" ON "Conta"("userId", "banco", "tipo", "apelido");
