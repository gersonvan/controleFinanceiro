// Filtros de período/categoria compartilhados por /api/lancamentos e /api/resumo.
import { z } from "zod";
import { escopoDoUsuario } from "./tenant";
import { opcional, textoCurto, tipoSchema } from "./validacao";

export const filtrosLancamentoSchema = z.object({
  conta: opcional(textoCurto),
  // "__sem__" seleciona lançamentos sem categoria; qualquer outro valor filtra
  // pelo texto (dados antigos podem ter categorias fora da lista atual).
  categoria: opcional(z.string().trim().max(100)),
  tipo: opcional(tipoSchema),
  busca: opcional(textoCurto),
  pessoa: opcional(textoCurto),
  dataInicio: opcional(z.coerce.date()),
  dataFim: opcional(z.coerce.date()),
});

export type FiltrosLancamento = z.infer<typeof filtrosLancamentoSchema>;

// Quando mesReferencia está preenchido ele manda no período; senão vale a data.
export function filtroPeriodo(dataInicio?: Date, dataFim?: Date) {
  const dateFilter: Record<string, Date> = {};
  if (dataInicio) dateFilter.gte = dataInicio;
  if (dataFim) dateFilter.lte = dataFim;
  return [
    { mesReferencia: { not: null, ...dateFilter } },
    { mesReferencia: null, data: dateFilter },
  ];
}

export function montarWhereLancamentos(userId: string, f: FiltrosLancamento) {
  const where = escopoDoUsuario(userId);
  if (f.conta) where.conta = f.conta;
  if (f.categoria === "__sem__") where.categoria = null;
  else if (f.categoria) where.categoria = f.categoria;
  if (f.tipo) where.tipo = f.tipo;
  if (f.pessoa) where.pessoa = { contains: f.pessoa, mode: "insensitive" };
  if (f.busca) where.descricao = { contains: f.busca, mode: "insensitive" };
  if (f.dataInicio || f.dataFim) where.OR = filtroPeriodo(f.dataInicio, f.dataFim);
  return where;
}
