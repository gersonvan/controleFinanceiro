// Revisão das linhas lidas antes de importar: na prévia, o usuário exclui, corrige
// ou inclui lançamentos. O arquivo vai junto e o servidor o lê de novo — titular,
// saldo, duplicados e categorias continuam valendo — e aplica os ajustes sobre a
// própria leitura. `total` é quantas linhas o usuário viu: se a leitura do
// servidor tiver outro tamanho, os índices não valem e nada é importado.
import { z } from "zod";

/** data "AAAA-MM-DD"; valor < 0 = gasto, > 0 = crédito */
export interface LinhaEditada { data: string; descricao: string; valor: number }

export interface AjustesLeitura {
  total: number;
  excluir: number[];                          // índices na leitura
  alterar: (LinhaEditada & { i: number })[];  // a linha i corrigida
  incluir: LinhaEditada[];                    // o que o leitor não achou
}

export const semAjustes = (total: number): AjustesLeitura => ({ total, excluir: [], alterar: [], incluir: [] });

export const temAjustes = (a: AjustesLeitura | null | undefined): a is AjustesLeitura =>
  !!a && a.excluir.length + a.alterar.length + a.incluir.length > 0;

/** As linhas como vão ser importadas: na ordem lida, sem as excluídas, com as correções e, no fim, as incluídas. */
export function aplicarAjustes<T>(linhas: T[], ajustes: AjustesLeitura, montar: (original: T | null, linha: LinhaEditada) => T): T[] {
  const excluir = new Set(ajustes.excluir);
  const alterar = new Map(ajustes.alterar.map((a) => [a.i, a]));
  const resultado: T[] = [];
  linhas.forEach((l, i) => {
    if (excluir.has(i)) return;
    const a = alterar.get(i);
    resultado.push(a ? montar(l, a) : l);
  });
  for (const linha of ajustes.incluir) resultado.push(montar(null, linha));
  return resultado;
}

/** "AAAA-MM-DD" → meia-noite UTC, como o resto do sistema */
export const dataDaLinha = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
};

const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD").refine((s) => {
  const d = dataDaLinha(s);
  // mesmos limites da importação (engine.ts): de 2000 até um ano à frente
  return !isNaN(d.getTime()) && d.toISOString().startsWith(s)
    && d.getUTCFullYear() >= 2000 && d.getUTCFullYear() <= new Date().getUTCFullYear() + 1;
}, "Data inválida");

const linhaSchema = z.object({
  data: dataSchema,
  descricao: z.string().trim().min(1).max(200),
  valor: z.number().finite().refine((v) => Math.abs(v) >= 0.01 && Math.abs(v) < 1e9, "Valor inválido"),
});

const MAX_LINHAS = 5000;
export const ajustesSchema = z.object({
  total: z.number().int().min(0).max(MAX_LINHAS),
  excluir: z.array(z.number().int().min(0)).max(MAX_LINHAS),
  alterar: z.array(linhaSchema.extend({ i: z.number().int().min(0) })).max(MAX_LINHAS),
  incluir: z.array(linhaSchema).max(500),
}).refine((a) => [...a.excluir, ...a.alterar.map((x) => x.i)].every((i) => i < a.total), "Linha fora da leitura");
