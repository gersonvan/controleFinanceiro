// Conferência da leitura: compara o que saiu do PDF com o resumo que a própria
// fatura imprime. Nenhum leitor fica à prova de mudança de layout (o banco muda a
// fatura, cada tipo de cartão tem a sua); a conferência é o que diz quando o
// usuário precisa olhar as linhas antes de importar — e quando não precisa.
import { parseValor } from "./tipos";

export interface ConferenciaFatura {
  rotulo: string;   // como a fatura chama o número conferido
  esperado: number; // o que a fatura diz
  lido: number;     // o mesmo número, somado das linhas lidas
  confere: boolean;
  soma: SomaConferida;
}

// "gastos": só as compras; "liquido": compras menos estornos. O pagamento da fatura
// anterior não entra em nenhum dos dois (os leitores já o deixam de fora).
export type SomaConferida = "gastos" | "liquido";

const VALOR = String.raw`(\d{1,3}(?:\.\d{3})*,\d{2})`;

const RESUMOS: { re: RegExp; rotulo: string; soma: SomaConferida }[] = [
  // Bradesco: "(+)Compras/Débitos............ R$ 2.899,84" (estornos vão para "(-) Créditos/Pagamentos")
  { re: new RegExp(String.raw`\(\+\)\s*compras\s*\/\s*d[ée]bitos[\s.]*R\$\s*${VALOR}`, "i"), rotulo: "Compras/Débitos", soma: "gastos" },
  // Itaú: "Lançamentos atuais 4.681,81"
  { re: new RegExp(String.raw`lan[çc]amentos atuais\s+(?:R\$\s*)?${VALOR}`, "i"), rotulo: "Lançamentos atuais", soma: "liquido" },
  // Nomad: "Despesas e créditos do mês R$ 5.336,79"
  { re: new RegExp(String.raw`despesas e cr[ée]ditos do m[êe]s\s+(?:R\$\s*)?${VALOR}`, "i"), rotulo: "Despesas e créditos do mês", soma: "liquido" },
];

const arred = (n: number) => Math.round(n * 100) / 100;

function somar(lancamentos: { valor: number }[], soma: SomaConferida): number {
  const gastos = -lancamentos.filter((l) => l.valor < 0).reduce((a, l) => a + l.valor, 0);
  const creditos = lancamentos.filter((l) => l.valor > 0).reduce((a, l) => a + l.valor, 0);
  return arred(soma === "gastos" ? gastos : gastos - creditos);
}

/** null quando a fatura não traz um resumo conhecido — aí só o usuário confere. */
export function conferirFatura(texto: string, lancamentos: { valor: number }[]): ConferenciaFatura | null {
  for (const r of RESUMOS) {
    const m = texto.match(r.re);
    if (!m) continue;
    return reconferir({ rotulo: r.rotulo, esperado: parseValor(m[1]), lido: 0, confere: false, soma: r.soma }, lancamentos);
  }
  return null;
}

/** A mesma conferência com as linhas depois da revisão do usuário. */
export function reconferir(c: ConferenciaFatura, lancamentos: { valor: number }[]): ConferenciaFatura {
  const lido = somar(lancamentos, c.soma);
  return { ...c, lido, confere: Math.abs(lido - c.esperado) < 0.005 };
}
