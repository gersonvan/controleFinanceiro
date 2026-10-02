// Validação de entrada das APIs com zod.
//
// Toda rota que recebe dados do cliente (corpo JSON, query string ou upload)
// passa por um schema explícito: campos desconhecidos são descartados (evita
// mass assignment) e tipos errados viram 400 em vez de exceção do Prisma.
import { NextResponse } from "next/server";
import { z } from "zod";
import { CATEGORIAS } from "./categorias";

z.config(z.locales.pt());

export const TAMANHO_MAX_UPLOAD = 8 * 1024 * 1024; // 8 MB

// ─── Primitivos reutilizados pelas rotas ─────────────────────────────────────

export const idSchema = z.coerce.number().int().positive();
export const textoCurto = z.string().trim().min(1).max(200);
export const textoLongo = z.string().trim().min(1).max(500);
export const categoriaSchema = z.enum(CATEGORIAS);
export const tipoSchema = z.enum(["Entrada", "Saída"]);

/** Query strings chegam como "" quando o campo está vazio: trata como ausente. */
export function opcional<T extends z.ZodType>(schema: T) {
  return z.preprocess((v) => (v === "" || v === null ? undefined : v), schema.optional());
}

// ─── Helpers de leitura ──────────────────────────────────────────────────────

export type Validacao<T> =
  | { ok: true; dados: T }
  | { ok: false; resposta: NextResponse };

export function validar<T>(schema: z.ZodType<T>, entrada: unknown): Validacao<T> {
  const resultado = schema.safeParse(entrada);
  if (resultado.success) return { ok: true, dados: resultado.data };

  const detalhes = resultado.error.issues.map((i) =>
    i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message
  );
  return { ok: false, resposta: erro400("Dados inválidos", detalhes) };
}

/** Corpo JSON; malformado vira `undefined` para o schema rejeitar com 400. */
export async function lerCorpo(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

export function lerQuery(req: Request): Record<string, string> {
  return Object.fromEntries(new URL(req.url).searchParams);
}

/**
 * Recusa pelo tamanho declarado, antes de ler o corpo: um upload enorme não chega
 * a ocupar a memória (na Vercel a plataforma já corta acima de 4,5 MB; localmente não).
 */
export function corpoGrandeDemais(req: Request): NextResponse | null {
  const declarado = Number(req.headers.get("content-length") ?? 0);
  if (declarado <= TAMANHO_MAX_UPLOAD + 64 * 1024) return null; // folga para os campos do formulário
  return NextResponse.json({ error: `Arquivo excede o limite de ${TAMANHO_MAX_UPLOAD / 1024 / 1024} MB` }, { status: 413 });
}

export function lerArquivo(formData: FormData, campo = "file"): Validacao<File> {
  const arquivo = formData.get(campo);
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { ok: false, resposta: erro400("Arquivo obrigatório") };
  }
  if (arquivo.size > TAMANHO_MAX_UPLOAD) {
    return {
      ok: false,
      resposta: erro400(`Arquivo excede o limite de ${TAMANHO_MAX_UPLOAD / 1024 / 1024} MB`),
    };
  }
  return { ok: true, dados: arquivo };
}

export function erro400(error: string, detalhes?: string[]) {
  return NextResponse.json(detalhes ? { error, detalhes } : { error }, { status: 400 });
}
