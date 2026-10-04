// Estrutura das contas: Banco → Conta (banco + Débito/Crédito + apelido opcional)
// → perfis de importação (leitores de OFX/PDF/CSV daquele banco e tipo).
// O nome da conta nunca é digitado: sai sempre de nomeDaConta, então o mesmo
// cartão importado em PDF, OFX ou CSV cai na mesma conta ("Nubank · Crédito").
// Internamente o tipo segue "corrente" (Débito) | "cartao" (Crédito).
import type { TipoConta } from "./financas";

export interface Banco { id: string; nome: string; nomeCompleto: string }

export const BANCOS: Banco[] = [
  { id: "bb", nome: "BB", nomeCompleto: "Banco do Brasil" },
  { id: "bradesco", nome: "Bradesco", nomeCompleto: "Bradesco" },
  { id: "c6", nome: "C6", nomeCompleto: "C6 Bank" },
  { id: "caixa", nome: "Caixa", nomeCompleto: "Caixa Econômica Federal" },
  { id: "inter", nome: "Inter", nomeCompleto: "Banco Inter" },
  { id: "itau", nome: "Itaú", nomeCompleto: "Itaú" },
  { id: "nomad", nome: "Nomad", nomeCompleto: "Nomad" },
  { id: "nubank", nome: "Nubank", nomeCompleto: "Nubank" },
  { id: "santander", nome: "Santander", nomeCompleto: "Santander" },
  { id: "sicoob", nome: "Sicoob", nomeCompleto: "Sicoob" },
  { id: "sicredi", nome: "Sicredi", nomeCompleto: "Sicredi" },
  { id: "sofisa", nome: "Sofisa", nomeCompleto: "Sofisa Direto" },
  { id: "outro", nome: "Outro", nomeCompleto: "Outro (carteira, vale…)" },
];

const POR_ID = new Map(BANCOS.map((b) => [b.id, b]));
export const bancoPorId = (id: string) => POR_ID.get(id) ?? POR_ID.get("outro")!;
export const rotuloTipo = (tipo: TipoConta) => (tipo === "cartao" ? "Crédito" : "Débito");

export interface DadosConta { banco: string; tipo: TipoConta; apelido: string }

/** "Nubank · Débito", "Nubank · Crédito · final 1234", "Outro · Carteira". */
export function nomeDaConta({ banco, tipo, apelido }: DadosConta): string {
  const a = apelido.trim();
  if (banco === "outro") return `Outro · ${a || "Sem nome"}`;
  return `${bancoPorId(banco).nome} · ${rotuloTipo(tipo)}${a ? ` · ${a}` : ""}`;
}

/** Banco e tipo de um perfil nativo pela chave ("nubank-cartao-pdf" → Nubank · Crédito). */
export function contaDoPerfilNativo(builtin: string): DadosConta {
  const [banco, modalidade = ""] = builtin.split("-");
  return {
    banco: POR_ID.has(banco) ? banco : "outro",
    tipo: /^(cartao|credito)$/.test(modalidade) ? "cartao" : "corrente",
    apelido: modalidade === "poupanca" ? "Poupança" : "",
  };
}

/** Banco, tipo e nome da conta de um perfil nativo — o nome nunca vem do texto do catálogo. */
export function contaNativa(builtin: string) {
  const dados = contaDoPerfilNativo(builtin);
  return { banco: dados.banco, tipoConta: dados.tipo, conta: nomeDaConta(dados) };
}

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const BANCO_NO_NOME: [RegExp, string][] = [
  [/\bnubank\b|\bnu pagamentos\b/, "nubank"],
  [/\bc6\b/, "c6"],
  [/\bbb\b|banco do brasil/, "bb"],
  [/\bitau\b/, "itau"],
  [/\bbradesco\b/, "bradesco"],
  [/\bsantander\b/, "santander"],
  [/\bcaixa\b/, "caixa"],
  [/\binter\b/, "inter"],
  [/\bsicoob\b/, "sicoob"],
  [/\bsicredi\b/, "sicredi"],
  [/\bsofisa\b/, "sofisa"],
  [/\bnomad\b/, "nomad"],
];

/**
 * Lê um nome de conta antigo (texto livre): "C6 Crédito", "Nubank Conta", "BB Cartão",
 * "Itaú Poupança", "Sofisa", "Carteira". Também aceita nomes já no formato novo.
 */
export function interpretarNomeAntigo(nome: string, tipoConhecido?: TipoConta): DadosConta {
  const novo = nome.match(/^(.+?) · (Débito|Crédito)(?: · (.+))?$/);
  if (novo) {
    const banco = BANCOS.find((b) => b.nome === novo[1])?.id ?? "outro";
    return { banco, tipo: novo[2] === "Crédito" ? "cartao" : "corrente", apelido: banco === "outro" ? nome : novo[3] ?? "" };
  }
  const outroNovo = nome.match(/^Outro · (.+)$/);
  if (outroNovo) return { banco: "outro", tipo: tipoConhecido ?? "corrente", apelido: outroNovo[1] };

  const n = normalizar(nome);
  const banco = BANCO_NO_NOME.find(([re]) => re.test(n))?.[1] ?? "outro";
  const tipo = tipoConhecido ?? (/cartao|credito|fatura/.test(n) ? "cartao" : "corrente");
  const apelido = banco === "outro" ? nome.trim() : /poupanca/.test(n) ? "Poupança" : "";
  return { banco, tipo, apelido };
}
