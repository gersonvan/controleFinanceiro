import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { CATEGORIAS_FIXAS } from "@/lib/categorias";
import { getSessionUserId } from "@/lib/session";

const REGEX_PARCELA = /\((\d+)\/(\d+)\)/;

export interface HistoricoItem {
  mes: string;
  valor: number;
}

export interface PrevisaoItem {
  mes: string;
  descricao: string;
  categoria: string;
  valor: number;
  tipoPrevisao: string;
  detalhe: string;
  historico?: HistoricoItem[];
}

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const hoje = new Date();
  hoje.setDate(1);
  hoje.setHours(0, 0, 0, 0);

  const lancamentos = await prisma.lancamento.findMany({
    where: { userId },
    select: {
      descricao: true,
      categoria: true,
      valor: true,
      tipo: true,
      data: true,
      mesReferencia: true,
    },
  });

  const previsoes: PrevisaoItem[] = [];

  // --- 1. Parcelamentos ---
  const parcelasProcessadas = new Set<string>();

  for (const l of lancamentos) {
    const match = l.descricao.match(REGEX_PARCELA);
    if (!match || !l.mesReferencia) continue;

    const mesRef = new Date(l.mesReferencia);
    mesRef.setDate(1);
    mesRef.setHours(0, 0, 0, 0);
    if (mesRef > hoje) continue;

    const parcelaAtual = parseInt(match[1]);
    const parcelaTotal = parseInt(match[2]);
    const valor = Math.abs(l.valor);
    const baseDescricao = l.descricao.replace(REGEX_PARCELA, "").trim();
    const chave = `${baseDescricao}|${parcelaTotal}|${Math.round(valor)}`;

    if (parcelasProcessadas.has(chave)) continue;
    parcelasProcessadas.add(chave);

    const diffMeses =
      (hoje.getFullYear() - mesRef.getFullYear()) * 12 +
      (hoje.getMonth() - mesRef.getMonth());
    const parcelasAPrever = parcelaTotal - parcelaAtual - diffMeses;

    if (parcelasAPrever > 0) {
      for (let i = 1; i <= parcelasAPrever; i++) {
        const dataPrevista = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
        const mes = `${String(dataPrevista.getMonth() + 1).padStart(2, "0")}/${dataPrevista.getFullYear()}`;
        const proximaParcela = parcelaAtual + diffMeses + i;
        previsoes.push({
          mes,
          descricao: baseDescricao,
          categoria: l.categoria || "Compras",
          valor,
          tipoPrevisao: "Parcelamento",
          detalhe: `Parcela ${proximaParcela}/${parcelaTotal}`,
          historico: [{ mes: toMesStr(l.mesReferencia!), valor }],
        });
      }
    }
  }

  // --- 2. Gastos Fixos (média por mês) ---
  // Agrupa por categoria → mês → soma, para depois tirar média dos meses
  const porCategoriaMes: Record<string, Record<string, number>> = {};

  for (const l of lancamentos) {
    if (l.tipo === "Saída" && l.categoria && CATEGORIAS_FIXAS.includes(l.categoria)) {
      const ref = l.mesReferencia || l.data;
      const mes = toMesStr(ref);
      if (!porCategoriaMes[l.categoria]) porCategoriaMes[l.categoria] = {};
      porCategoriaMes[l.categoria][mes] = (porCategoriaMes[l.categoria][mes] || 0) + Math.abs(l.valor);
    }
  }

  // Ordena MM/YYYY corretamente (por YYYY-MM) e limita aos últimos 12 meses
  const sortMes = (a: string, b: string) => {
    const toKey = (m: string) => { const [mm, yyyy] = m.split("/"); return `${yyyy}-${mm}`; };
    return toKey(b).localeCompare(toKey(a)); // desc
  };

  for (let i = 1; i <= 12; i++) {
    const dataPrevista = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
    const mes = `${String(dataPrevista.getMonth() + 1).padStart(2, "0")}/${dataPrevista.getFullYear()}`;

    for (const [cat, mesesMap] of Object.entries(porCategoriaMes)) {
      const meses = Object.entries(mesesMap)
        .sort(([a], [b]) => sortMes(a, b))
        .slice(0, 12); // últimos 12 meses com dados

      const soma  = meses.reduce((acc, [, v]) => acc + v, 0);
      const media = soma / meses.length;

      previsoes.push({
        mes,
        descricao: cat,
        categoria: cat,
        valor: parseFloat(media.toFixed(2)),
        tipoPrevisao: "Fixo",
        detalhe: `Média de ${meses.length} ${meses.length !== 1 ? "meses" : "mês"}`,
        historico: meses.map(([m, v]) => ({ mes: m, valor: parseFloat(v.toFixed(2)) })),
      });
    }
  }

  previsoes.sort((a, b) => a.mes.localeCompare(b.mes));

  return NextResponse.json(previsoes);
}

function toMesStr(date: Date | string): string {
  const d = new Date(date);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
