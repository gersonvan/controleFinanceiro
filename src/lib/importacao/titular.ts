// Documento de outra pessoa? Extratos e faturas trazem o nome do titular; se
// ele não bate com o "nome nos extratos" do usuário, a importação pede
// confirmação (um arquivo da irmã no meio de um lote entrou inteiro na conta
// errada). Sem nome do usuário, ou sem nome no documento (OFX, a maioria dos
// CSV), não há como saber e não se pergunta nada.

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const PALAVRA_DE_NOME = /^[a-zà-ü'-]{2,}$/i;

/**
 * Nome do titular quando o documento diz com um rótulo no começo da linha:
 * "Nome: Fulana de Tal", "Titular: FULANA DE TAL", "Cliente: …". Só as
 * palavras do nome (para antes de número, cartão, CPF).
 */
export function titularDoDocumento(texto: string): string | null {
  const m = texto.match(/^[ \t]*(?:nome(?: do titular)?|titular|cliente)[ \t]*:[ \t]*([^\n]+)$/im);
  if (!m) return null;
  const palavras: string[] = [];
  for (const p of m[1].trim().split(/\s+/)) {
    if (!PALAVRA_DE_NOME.test(p)) break;
    palavras.push(p);
  }
  return palavras.length >= 2 ? palavras.join(" ") : null;
}

const primeiroNome = (nome: string) => normalizar(nome.trim().split(/\s+/)[0] ?? "");
const temPalavra = (texto: string, palavra: string) => new RegExp(`(^|[^a-z])${palavra}([^a-z]|$)`).test(texto);

/**
 * `null` = nada a avisar. Senão, o documento parece de outra pessoa; `nome` é
 * o titular quando o documento o diz.
 * - Com titular no documento: vale ele (o nome do usuário pode aparecer num Pix).
 * - Sem titular, em PDF: o primeiro nome do usuário tem de aparecer no texto.
 */
export function documentoDeOutraPessoa(
  texto: string, formato: string, nomeDoUsuario: string,
): { nome: string | null } | null {
  const primeiro = primeiroNome(nomeDoUsuario);
  if (primeiro.length < 2) return null;
  const titular = titularDoDocumento(texto);
  if (titular) return temPalavra(normalizar(titular), primeiro) ? null : { nome: titular };
  if (formato !== "pdf") return null;
  return temPalavra(normalizar(texto), primeiro) ? null : { nome: null };
}

/** Nome do usuário para a conferência: o dos extratos; sem ele, o de exibição. */
export const nomeParaConferir = (perfil: { nomeCompleto?: string | null; nome?: string | null } | null) =>
  (perfil?.nomeCompleto || perfil?.nome || "").trim();
