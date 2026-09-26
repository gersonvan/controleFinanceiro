import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { comValorLiquido } from "@/lib/reembolso";
import { CATEGORIAS_FIXAS } from "@/lib/categorias";
import { getSessionUserId } from "@/lib/session";
import { escopoDoUsuario } from "@/lib/tenant";
import { numeroParcela, valorMensal, type ItemPlanejado } from "@/lib/planejamento";

const REGEX_PARCELA = /\((\d+)\/(\d+)\)/;

export interface HistoricoLancamento {
  descricao: string;
  valor: number;
}

export interface HistoricoItem {
  mes: string;
  valor: number;
  lancamentos?: HistoricoLancamento[];
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

  const [lancamentos, planejados] = await Promise.all([
    prisma.lancamento.findMany({
      where: escopoDoUsuario(userId),
      select: {
        descricao: true,
        categoria: true,
        valor: true,
        tipo: true,
        data: true,
        mesReferencia: true,
        valorReembolsado: true,
      },
    }).then((ls) => ls.map(comValorLiquido)),
    prisma.planejamentoItem.findMany({ where: escopoDoUsuario(userId) }) as Promise<ItemPlanejado[]>,
  ]);

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
  // categoria → mes → { soma, lancamentos[] }
  const porCategoriaMes: Record<string, Record<string, { soma: number; items: HistoricoLancamento[] }>> = {};

  for (const l of lancamentos) {
    if (l.tipo === "Saída" && l.categoria && CATEGORIAS_FIXAS.includes(l.categoria)) {
      const ref = l.mesReferencia || l.data;
      const mes = toMesStr(ref);
      if (!porCategoriaMes[l.categoria]) porCategoriaMes[l.categoria] = {};
      if (!porCategoriaMes[l.categoria][mes]) porCategoriaMes[l.categoria][mes] = { soma: 0, items: [] };
      porCategoriaMes[l.categoria][mes].soma += Math.abs(l.valor);
      porCategoriaMes[l.categoria][mes].items.push({ descricao: l.descricao, valor: Math.abs(l.valor) });
    }
  }

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
        .slice(0, 12);

      const soma  = meses.reduce((acc, [, d]) => acc + d.soma, 0);
      const media = soma / meses.length;

      previsoes.push({
        mes,
        descricao: cat,
        categoria: cat,
        valor: parseFloat(media.toFixed(2)),
        tipoPrevisao: "Fixo",
        detalhe: `Média de ${meses.length} ${meses.length !== 1 ? "meses" : "mês"}`,
        historico: meses.map(([m, d]) => ({
          mes: m,
          valor: parseFloat(d.soma.toFixed(2)),
          lancamentos: d.items,
        })),
      });
    }
  }

  // --- 3. Fotografia do mês (base para quem ainda não tem histórico) ---
  // Categorias que já têm média por histórico prevalecem; parcelas já vistas
  // nos lançamentos (mesma descrição) não entram de novo.
  const descricoesParceladas = [...parcelasProcessadas].map((c) => c.split("|")[0].toLowerCase());
  for (let i = 1; i <= 12; i++) {
    const dataPrevista = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
    const mes = `${String(dataPrevista.getMonth() + 1).padStart(2, "0")}/${dataPrevista.getFullYear()}`;

    for (const item of planejados) {
      if (item.grupo === "entrada") continue;
      if (item.grupo === "parcela") {
        const desc = item.descricao.toLowerCase();
        if (descricoesParceladas.some((d) => d.includes(desc) || desc.includes(d))) continue;
        const n = numeroParcela(item, i);
        if (n === null) continue;
        previsoes.push({
          mes, descricao: item.descricao, categoria: item.categoria, valor: item.valor,
          tipoPrevisao: "Parcelamento", detalhe: `Parcela ${n}/${item.parcelaTotal} (fotografia)`,
        });
        continue;
      }
      if (porCategoriaMes[item.categoria]) continue; // histórico manda
      const valor = valorMensal(item, i);
      if (valor <= 0) continue;
      previsoes.push({
        mes, descricao: item.descricao, categoria: item.categoria,
        valor: parseFloat(valor.toFixed(2)),
        tipoPrevisao: "Planejado",
        detalhe: item.periodicidade === "anual" ? "Anual ÷ 12 (fotografia)"
          : item.periodicidade === "semanal" ? "Semanal × 4,33 (fotografia)" : "Fotografia do mês",
      });
    }
  }

  // "MM/AAAA": ordenar como texto põe 01/2027 antes de 10/2026
  const chaveMes = (m: string) => { const [mm, aaaa] = m.split("/"); return `${aaaa}-${mm}`; };
  previsoes.sort((a, b) => chaveMes(a.mes).localeCompare(chaveMes(b.mes)));

  return NextResponse.json(previsoes);
}

function toMesStr(date: Date | string): string {
  const d = new Date(date);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
