// O mesmo pagamento chega com descrições diferentes conforme o banco e o meio:
//   "Pagamento de Boleto - AYMORE CREDITO  FINANCIAMENTO - Data balanc.: 01"
//   "Pagamento de Boleto - CATA ALENTO EDUCACAO INFANTIL LTDA - Data balanc"
//   "Pix - Enviado - 04/09 12:18 CATA ALENTO"
// Aqui sai esse ruído para comparar e agrupar. O texto gravado no lançamento
// não muda: a detecção de duplicados usa a descrição original.

/**
 * Para chaves (Memória, histórico, Revisar): tira o ruído mas mantém a direção
 * do Pix — uma regra de "Pix enviado para MARIA" não pode valer para "Pix
 * recebido de MARIA". O Pix do BB vira o formato dos outros bancos.
 */
export function semRuido(descricao: string): string {
  const d = descricao.trim()
    .replace(/^pagamento de boleto( efetuado)?\s*-\s*/i, "")                 // BB, Nubank
    .replace(/^pix\s*-\s*enviado\s*-\s*/i, "Pix enviado para ")               // BB: "Pix - Enviado - 04/09 12:18 FULANO"
    .replace(/^pix\s*-\s*recebido\s*-\s*/i, "Pix recebido de ")
    .replace(/^(pix (enviado para|recebido de) )\d{1,2}\/\d{1,2}(\/\d{2,4})?\s+(\d{1,2}:\d{2}(:\d{2})?\s+)?/i, "$1")
    .replace(/\s*-\s*data bal\w*.*$/i, "")                                    // BB: " - Data balanc.: 03" (às vezes cortado)
    .replace(/\s+(ltda|s\.?\s?\/?\s?a\.?|me|eireli|epp)\.?\s*$/i, "")         // razão social
    .replace(/[\s·-]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return d || descricao.trim();
}

/** Para mostrar (Matriz): também sem o meio de pagamento — "Pix enviado para X" → "X". */
export function nomeDoEstabelecimento(descricao: string): string {
  const d = semRuido(descricao)
    .replace(/^pix (enviado para|recebido de)\s+/i, "")
    .replace(/^transfer[êe]ncia (enviada|recebida) pelo pix\s*-\s*/i, "")
    .replace(/\s+(ltda|s\.?\s?\/?\s?a\.?|me|eireli|epp)\.?\s*$/i, "")
    .trim();
  return d || descricao.trim();
}
