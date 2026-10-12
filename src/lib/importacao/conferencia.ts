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
}

const VALOR = String.raw`(\d{1,3}(?:\.\d{3})*,\d{2})`;

// "gastos": só as compras; "liquido": compras menos estornos. O pagamento da fatura
// anterior não entra em nenhum dos dois (os leitores já o deixam de fora).
const RESUMOS: { re: RegExp; rotulo: string; soma: "gastos" | "liquido" }[] = [
  // Bradesco: "(+)Compras/Débitos............ R$ 2.899,84" (estornos vão para "(-) Créditos/Pagamentos")
  { re: new RegExp(String.raw`\(\+\)\s*compras\s*\/\s*d[ée]bitos[\s.]*R\$\s*${VALOR}`, "i"), rotulo: "Compras/Débitos", soma: "gastos" },
  // Itaú: "Lançamentos atuais 4.681,81"
  { re: new RegExp(String.raw`lan[çc]amentos atuais\s+(?:R\$\s*)?${VALOR}`, "i"), rotulo: "Lançamentos atuais", soma: "liquido" },
  // Nomad: "Despesas e créditos do mês R$ 5.336,79"
  { re: new RegExp(String.raw`despesas e cr[ée]ditos do m[êe]s\s+(?:R\$\s*)?${VALOR}`, "i"), rotulo: "Despesas e créditos do mês", soma: "liquido" },
];

const arred = (n: number) => Math.round(n * 100) / 100;

/** null quando a fatura não traz um resumo conhecido — aí só o usuário confere. */
export function conferirFatura(texto: string, lancamentos: { valor: number }[]): ConferenciaFatura | null {
  for (const r of RESUMOS) {
    const m = texto.match(r.re);
    if (!m) continue;
    const gastos = -lancamentos.filter((l) => l.valor < 0).reduce((a, l) => a + l.valor, 0);
    const creditos = lancamentos.filter((l) => l.valor > 0).reduce((a, l) => a + l.valor, 0);
    const esperado = parseValor(m[1]);
    const lido = arred(r.soma === "gastos" ? gastos : gastos - creditos);
    return { rotulo: r.rotulo, esperado, lido, confere: Math.abs(lido - esperado) < 0.005 };
  }
  return null;
}
