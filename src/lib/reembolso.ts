// "Dividir": um Pix recebido reembolsa um ou mais gastos. O Pix vira categoria
// Reembolso (não é renda) e o valor abate os gastos vinculados, no mês de cada
// gasto. Funções puras; a gravação fica em reembolso-dados.ts.

export const CATEGORIA_REEMBOLSO = "Reembolso";

/**
 * Valor de um lançamento descontado o que foi reembolsado. Saída reembolsada
 * por inteiro vira 0 (nunca positiva); entradas não mudam.
 */
export function valorLiquido(l: { valor: number; valorReembolsado?: number | null }): number {
  if (l.valor >= 0 || !l.valorReembolsado) return l.valor;
  return Math.min(l.valor + l.valorReembolsado, 0);
}

/** Troca `valor` pelo líquido — para aplicar logo depois de ler do banco. */
export function comValorLiquido<T extends { valor: number; valorReembolsado?: number | null }>(l: T): T {
  return { ...l, valor: valorLiquido(l) };
}

export interface GastoParaReembolso {
  id: number;
  valor: number;          // negativo
  jaReembolsado: number;  // por outros Pix (não conta o que está sendo redistribuído)
}

const centavos = (n: number) => Math.round(n * 100);

/**
 * Distribui o Pix entre os gastos em proporção ao que falta reembolsar de cada
 * um, sem passar do que falta. Devolve as partes (em reais) e a sobra, se o Pix
 * for maior que o total em aberto.
 */
export function distribuirReembolso(valorPix: number, gastos: GastoParaReembolso[]): {
  partes: { saidaId: number; valor: number }[];
  sobra: number;
} {
  const abertos = gastos.map((g) => ({ id: g.id, falta: Math.max(centavos(-g.valor) - centavos(g.jaReembolsado), 0) }));
  const totalAberto = abertos.reduce((a, g) => a + g.falta, 0);
  const pix = centavos(valorPix);
  if (totalAberto === 0) return { partes: [], sobra: valorPix };

  const distribuir = Math.min(pix, totalAberto);
  const partes = abertos.map((g) => ({ saidaId: g.id, c: Math.floor((distribuir * g.falta) / totalAberto) }));
  // centavos que sobraram do arredondamento vão para quem ainda tem espaço
  let resto = distribuir - partes.reduce((a, p) => a + p.c, 0);
  for (let i = 0; resto > 0 && i < partes.length; i++) {
    const espaco = abertos[i].falta - partes[i].c;
    const extra = Math.min(espaco, resto);
    partes[i].c += extra;
    resto -= extra;
  }
  return {
    partes: partes.filter((p) => p.c > 0).map((p) => ({ saidaId: p.saidaId, valor: p.c / 100 })),
    sobra: (pix - distribuir) / 100,
  };
}
