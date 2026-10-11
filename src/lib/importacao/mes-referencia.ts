// Sugestão do mês de referência de uma fatura de cartão ("AAAA-MM").
//
// 1. Se o texto da fatura traz a data de vencimento, ela manda.
// 2. Depois, uma data no nome do arquivo (os bancos nomeiam pelo vencimento).
// 3. Senão: mês da compra mais recente + 10 dias. A fatura fecha logo depois
//    da última compra e vence ~7–10 dias após o fechamento, então o mês do
//    vencimento cai aí. Acerta as 12 últimas faturas do C6 do histórico
//    (fechamento ~dia 3, compras até o dia 28 ainda caem no mês seguinte).
// É só uma sugestão: a tela deixa o usuário corrigir antes de importar.

const pad = (n: number) => String(n).padStart(2, "0");

export function vencimentoNoTexto(texto: string): string | null {
  // a data pode vir na linha de baixo ("Data de vencimento\n05/10/2026", Nomad)
  const m = texto.match(/vencimento[^\d\n]{0,40}\n?[^\d\n]{0,10}(\d{2})\/(\d{2})\/(\d{2,4})/i);
  if (!m) return null;
  const mes = parseInt(m[2]);
  let ano = parseInt(m[3]);
  if (ano < 100) ano += 2000;
  if (mes < 1 || mes > 12) return null;
  return `${ano}-${pad(mes)}`;
}

/** "Nubank_2026-09-10.ofx", "c6 Fatura_2026-08-10.csv": a data no nome é o vencimento. */
export function vencimentoNoNome(nomeArquivo: string): string | null {
  const m = nomeArquivo.match(/(20\d{2})[-_](\d{2})[-_]\d{2}/);
  if (!m) return null;
  const mes = parseInt(m[2]);
  return mes >= 1 && mes <= 12 ? `${m[1]}-${m[2]}` : null;
}

export function sugerirMesReferencia(datas: Date[], texto?: string, nomeArquivo?: string): string | null {
  const doTexto = texto ? vencimentoNoTexto(texto) : null;
  if (doTexto) return doTexto;
  const doNome = nomeArquivo ? vencimentoNoNome(nomeArquivo) : null;
  if (doNome) return doNome;
  if (datas.length === 0) return null;

  const ultima = new Date(Math.max(...datas.map((d) => d.getTime())));
  const alvo = new Date(ultima.getFullYear(), ultima.getMonth(), ultima.getDate() + 10);
  return `${alvo.getFullYear()}-${pad(alvo.getMonth() + 1)}`;
}
