import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { CATEGORIAS_FIXAS } from "@/lib/categorias";

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
  const hoje = new Date();
  hoje.setDate(1);
  hoje.setHours(0, 0, 0, 0);

  const lancamentos = await prisma.lancamento.findMany({
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

  // --- 2. Gastos Fixos (média) ---
  const gastosFixos: Record<string, {
    soma: number;
    contagem: number;
    registros: HistoricoItem[];
  }> = {};

  for (const l of lancamentos) {
    if (l.tipo === "Saída" && l.categoria && CATEGORIAS_FIXAS.includes(l.categoria)) {
      if (!gastosFixos[l.categoria]) gastosFixos[l.categoria] = { soma: 0, contagem: 0, registros: [] };
      const valor = Math.abs(l.valor);
      const ref = l.mesReferencia || l.data;
      gastosFixos[l.categoria].soma += valor;
      gastosFixos[l.categoria].contagem++;
      gastosFixos[l.categoria].registros.push({ mes: toMesStr(ref), valor });
    }
  }

  // Ordena registros por mês desc e mantém só os últimos 12
  for (const dados of Object.values(gastosFixos)) {
    dados.registros.sort((a, b) => b.mes.localeCompare(a.mes));
    dados.registros = dados.registros.slice(0, 12);
  }

  for (let i = 1; i <= 12; i++) {
    const dataPrevista = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
    const mes = `${String(dataPrevista.getMonth() + 1).padStart(2, "0")}/${dataPrevista.getFullYear()}`;

    for (const [cat, dados] of Object.entries(gastosFixos)) {
      const media = dados.soma / dados.contagem;
      previsoes.push({
        mes,
        descricao: cat,
        categoria: cat,
        valor: parseFloat(media.toFixed(2)),
        tipoPrevisao: "Fixo",
        detalhe: `Média de ${dados.contagem} lançamento${dados.contagem !== 1 ? "s" : ""}`,
        historico: dados.registros,
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
