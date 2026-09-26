-- Pix de reembolso passa a guardar quanto dele abateu gastos (o resto é sobra/entrada)
UPDATE "Lancamento" l
SET "valorReembolsado" = s.total
FROM (
  SELECT "entradaId", ROUND(SUM("valor")::numeric, 2)::double precision AS total
  FROM "Reembolso"
  GROUP BY "entradaId"
) s
WHERE l.id = s."entradaId";
