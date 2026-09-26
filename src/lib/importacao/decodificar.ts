// Texto de um arquivo de extrato: UTF-8 e, se não for UTF-8 válido, Latin-1
// (Windows-1252, como o BB exporta). Usado no navegador e no servidor.
export function decodificarBytes(bytes: ArrayBuffer | Uint8Array): string {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(bytes) : utf8;
}
