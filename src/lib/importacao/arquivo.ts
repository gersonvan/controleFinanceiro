// Leitura de arquivos enviados à importação (somente servidor).
import { decodificarBytes } from "./decodificar";

/**
 * Texto do arquivo: UTF-8 quando válido, senão Latin-1/Windows-1252 — o CSV
 * do Banco do Brasil vem assim ("Lançamento" viraria "Lan�amento").
 */
export function decodificarTexto(buffer: Buffer): string {
  return decodificarBytes(buffer);
}

export function ehPDF(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString("latin1") === "%PDF-";
}

/** Extrai o texto de um PDF digital. Lança erro para PDF escaneado ou corrompido. */
export async function extrairTextoPDF(buffer: Buffer): Promise<string> {
  // pdf-parse v2: classe PDFParse (a v1 exportava uma função — chamar assim quebrava toda leitura de PDF)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PDFParse } = require("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    return (await parser.getText()).text as string;
  } finally {
    await parser.destroy?.();
  }
}

/**
 * Chave de deduplicação: mesmo dia, descrição e valor = mesmo lançamento.
 * A descrição é normalizada (espaços e maiúsculas) — o mesmo Pix já entrou
 * duas vezes por diferir só num espaço no fim.
 */
export function chaveLancamento(l: { data: Date; descricao: string; valor: number }): string {
  const descricao = l.descricao.trim().replace(/\s+/g, " ").toLowerCase();
  return `${l.data.toISOString().slice(0, 10)}|${descricao}|${l.valor.toFixed(2)}`;
}

/** Mesma data e valor (sem olhar a descrição): sinal de extrato repetido em outro formato. */
export function chaveDataValor(l: { data: Date; valor: number }): string {
  return `${l.data.toISOString().slice(0, 10)}|${l.valor.toFixed(2)}`;
}

/** Parcelas "(2/10)" repetem data e valor entre faturas sem serem duplicatas. */
export const ehParcela = (descricao: string) => /\(\d+\/\d+\)/.test(descricao);
