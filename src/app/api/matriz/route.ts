import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";

export interface MatrizDescricao {
  descricao: string;
  porMes: Record<string, number>;
}

export interface MatrizLinha {
  categoria: string;
  totais: Record<string, number>;
  media: number;
  descricoes: MatrizDescricao[];
}

export interface MatrizData {
  meses: string[];
  linhas: MatrizLinha[];
}

function toMesStr(d: Date): string {
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

// Prefixos que os bancos adicionam antes do nome do fornecedor
const PREFIXOS_BANCARIOS = [
  "Pagamento de boleto efetuado - ",
  "Transferência enviada pelo Pix - ",
  "Pix enviado para ",
];

// Nomes longos → forma canônica curta já usada em outros lançamentos
const CANONICOS: Record<string, string> = {
  "BRISANET SERVICOS DE TELECOMUNICACOES S A": "BRISANET",
  "UNIMED FORTALEZA SOCIEDADE COOPERATIVA MEDICA LTD": "UNIMED FORTALEZA SOCIEDADE COOP",
  "SEFAZ CEARA-DAE-COD": "SEFAZ CE DAE",
  "TIM S A": "TIM SA",
};

function normalizarDescricao(descricao: string): string {
  let d = descricao.trim();

  // Remove prefixo bancário (case-insensitive)
  for (const p of PREFIXOS_BANCARIOS) {
    if (d.toLowerCase().startsWith(p.toLowerCase())) {
      d = d.slice(p.length);
      break;
    }
  }

  // Remove CNPJ e tudo depois (Nubank Pix: "VENDOR - 00.000.000/0000-00 - ...")
  const cnpjIdx = d.search(/ - \d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
  if (cnpjIdx > 0) d = d.slice(0, cnpjIdx);

  d = d.trim().toUpperCase();

  return CANONICOS[d] ?? d;
}

function sortMes(a: string, b: string): number {
  const key = (m: string) => { const [mm, yyyy] = m.split("/"); return `${yyyy}-${mm}`; };
  return key(a).localeCompare(key(b));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tipo       = searchParams.get("tipo") || "";
  const dataInicio = searchParams.get("dataInicio");
  const dataFim    = searchParams.get("dataFim");

  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const where: Record<string, unknown> = { userId, categoria: { not: null } };
  if (tipo) where.tipo = tipo;

  if (dataInicio || dataFim) {
    const dateFilter: Record<string, Date> = {};
    if (dataInicio) dateFilter.gte = new Date(dataInicio);
    if (dataFim)    dateFilter.lte = new Date(dataFim);
    where.OR = [
      { mesReferencia: { not: null, ...dateFilter } },
      { mesReferencia: null, data: dateFilter },
    ];
  }

  const lancamentos = await prisma.lancamento.findMany({
    where,
    select: { categoria: true, descricao: true, valor: true, data: true, mesReferencia: true },
  });

  // categoria → descricao → mes → soma
  const estrutura: Record<string, Record<string, Record<string, number>>> = {};
  const mesesSet = new Set<string>();

  for (const l of lancamentos) {
    if (!l.categoria) continue;
    const ref = l.mesReferencia || l.data;
    const mes = toMesStr(new Date(ref));
    mesesSet.add(mes);

    const desc = normalizarDescricao(l.descricao);
    if (!estrutura[l.categoria]) estrutura[l.categoria] = {};
    if (!estrutura[l.categoria][desc]) estrutura[l.categoria][desc] = {};
    estrutura[l.categoria][desc][mes] =
      (estrutura[l.categoria][desc][mes] || 0) + Math.abs(l.valor);
  }

  const meses = [...mesesSet].sort(sortMes);

  const linhas: MatrizLinha[] = Object.entries(estrutura).map(([categoria, descMap]) => {
    const totais: Record<string, number> = {};
    const descricoes: MatrizDescricao[] = Object.entries(descMap)
      .map(([descricao, porMes]) => ({ descricao, porMes }))
      .sort((a, b) => a.descricao.localeCompare(b.descricao, "pt-BR"));

    for (const { porMes } of descricoes) {
      for (const [mes, v] of Object.entries(porMes)) {
        totais[mes] = (totais[mes] || 0) + v;
      }
    }

    const vals = meses.map((m) => totais[m] || 0).filter((v) => v > 0);
    const media = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;

    return { categoria, totais, media, descricoes };
  });

  linhas.sort((a, b) => a.categoria.localeCompare(b.categoria, "pt-BR"));

  return NextResponse.json({ meses, linhas } satisfies MatrizData);
}
