// Sugestão do mês de referência de uma fatura de cartão ("AAAA-MM").
//
// 1. Se o texto da fatura traz a data de vencimento, ela manda.
// 2. Senão: mês da compra mais recente + 10 dias. A fatura fecha logo depois
//    da última compra e vence ~7–10 dias após o fechamento, então o mês do
//    vencimento cai aí. Acerta as 12 últimas faturas do C6 do histórico
//    (fechamento ~dia 3, compras até o dia 28 ainda caem no mês seguinte).
// É só uma sugestão: a tela deixa o usuário corrigir antes de importar.

const pad = (n: number) => String(n).padStart(2, "0");

export function vencimentoNoTexto(texto: string): string | null {
  const m = texto.match(/vencimento[^\d\n]{0,40}(\d{2})\/(\d{2})\/(\d{2,4})/i);
  if (!m) return null;
  const mes = parseInt(m[2]);
  let ano = parseInt(m[3]);
  if (ano < 100) ano += 2000;
  if (mes < 1 || mes > 12) return null;
  return `${ano}-${pad(mes)}`;
}

export function sugerirMesReferencia(datas: Date[], texto?: string): string | null {
  const doTexto = texto ? vencimentoNoTexto(texto) : null;
  if (doTexto) return doTexto;
  if (datas.length === 0) return null;

  const ultima = new Date(Math.max(...datas.map((d) => d.getTime())));
  const alvo = new Date(ultima.getFullYear(), ultima.getMonth(), ultima.getDate() + 10);
  return `${alvo.getFullYear()}-${pad(alvo.getMonth() + 1)}`;
}
