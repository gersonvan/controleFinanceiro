// Leitura de arquivos enviados à importação (somente servidor).

export function ehPDF(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString("latin1") === "%PDF-";
}

/** Extrai o texto de um PDF digital. Lança erro para PDF escaneado ou corrompido. */
export async function extrairTextoPDF(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse");
  const pdfData = await pdfParse(buffer);
  return pdfData.text as string;
}

/** Chave de deduplicação: mesmo dia, descrição e valor = mesmo lançamento. */
export function chaveLancamento(l: { data: Date; descricao: string; valor: number }): string {
  return `${l.data.toISOString().slice(0, 10)}|${l.descricao}|${l.valor.toFixed(2)}`;
}
