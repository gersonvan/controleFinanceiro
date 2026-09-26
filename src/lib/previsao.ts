// Previsão de gastos dos próximos meses. Uma base por vez, sem misturar:
//  - "fotografia": o que o usuário planejou (Fotografia do mês);
//  - "historico": média dos últimos 6 meses fechados de cada categoria ativa.
// Parcelas em andamento entram nas duas (são compromissos certos) e saem das
// médias, para não contar duas vezes. Categorias encerradas valem zero nas duas.
import { CATEGORIAS_NEUTRAS } from "./categorias";
import { CATEGORIA_INVESTIMENTO } from "./financas";
import { numeroParcela, valorMensal, type ItemPlanejado } from "./planejamento";

export type BasePrevisao = "fotografia" | "historico";

export interface LancamentoPrevisao {
  descricao: string;
  categoria: string | null;
  valor: number;              // já líquido de reembolsos
  data: Date;
  mesReferencia: Date | null;
}

export interface HistoricoLancamento { descricao: string; valor: number }
export interface HistoricoItem { mes: string; valor: number; lancamentos?: HistoricoLancamento[] }

export interface ItemPrevisao {
  mes: string;                // "MM/AAAA"
  descricao: string;
  categoria: string;
  valor: number;
  tipoPrevisao: "Planejado" | "Histórico" | "Parcelamento";
  detalhe: string;
  historico?: HistoricoItem[];
  referencia: { planejado: number | null; historico: number | null }; // mensais da categoria, para comparar
}

export const MESES_HISTORICO = 6;
export const MESES_ATIVIDADE = 3;   // sem gasto nos últimos 3 meses fechados = categoria parada
const REGEX_PARCELA = /\((\d+)\/(\d+)\)|parcela (\d+)\/(\d+)/i;

const arred = (n: number) => Math.round(n * 100) / 100;
const indiceMes = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth();
const rotulo = (indice: number) => `${String((indice % 12) + 1).padStart(2, "0")}/${Math.floor(indice / 12)}`;
const competencia = (l: LancamentoPrevisao) => indiceMes(l.mesReferencia ?? l.data);

export function parcelaDe(descricao: string): { atual: number; total: number; base: string } | null {
  const m = descricao.match(REGEX_PARCELA);
  if (!m) return null;
  const atual = parseInt(m[1] ?? m[3]), total = parseInt(m[2] ?? m[4]);
  if (!atual || !total || atual > total) return null;
  const base = descricao.replace(REGEX_PARCELA, "").replace(/\s*-\s*$/, "").replace(/\s+/g, " ").trim();
  return { atual, total, base };
}

const ehGastoPrevisivel = (l: LancamentoPrevisao) =>
  l.valor < 0 && !!l.categoria && !CATEGORIAS_NEUTRAS.has(l.categoria) && l.categoria !== CATEGORIA_INVESTIMENTO;

export function calcularPrevisao(opts: {
  lancamentos: LancamentoPrevisao[];
  planejados: ItemPlanejado[];
  encerradas: Set<string>;
  base: BasePrevisao;
  hoje: Date;                  // mês corrente (a previsão começa no seguinte)
  meses?: number;
}) {
  const { lancamentos, planejados, encerradas, hoje } = opts;
  const horizonte = opts.meses ?? 12;
  const atual = indiceMes(hoje);
  const temFotografia = planejados.some((p) => p.grupo !== "entrada");
  const base: BasePrevisao = opts.base === "fotografia" && !temFotografia ? "historico" : opts.base;
  const futuros = Array.from({ length: horizonte }, (_, i) => atual + 1 + i);

  // ── Parcelas em andamento (do histórico): a ocorrência mais recente de cada compra ──
  const ultimaParcela = new Map<string, { base: string; categoria: string; valor: number; atual: number; total: number; mes: number }>();
  for (const l of lancamentos) {
    if (!ehGastoPrevisivel(l)) continue;
    const p = parcelaDe(l.descricao);
    if (!p) continue;
    const valor = -l.valor;
    const chave = `${p.base.toLowerCase()}|${p.total}|${Math.round(valor)}`;
    const mes = competencia(l);
    const antes = ultimaParcela.get(chave);
    if (!antes || mes > antes.mes || (mes === antes.mes && p.atual > antes.atual)) {
      ultimaParcela.set(chave, { base: p.base, categoria: l.categoria!, valor, atual: p.atual, total: p.total, mes });
    }
  }

  // ── Histórico por categoria: últimos 6 meses fechados, sem as parcelas ──
  const inicioHist = atual - MESES_HISTORICO;
  const porCategoria = new Map<string, Map<number, { soma: number; itens: HistoricoLancamento[] }>>();
  for (const l of lancamentos) {
    if (!ehGastoPrevisivel(l) || parcelaDe(l.descricao)) continue;
    const mes = competencia(l);
    if (mes < inicioHist || mes >= atual) continue;
    const cat = porCategoria.get(l.categoria!) ?? new Map();
    const m = cat.get(mes) ?? { soma: 0, itens: [] };
    m.soma += -l.valor;
    m.itens.push({ descricao: l.descricao, valor: arred(-l.valor) });
    cat.set(mes, m);
    porCategoria.set(l.categoria!, cat);
  }
  const historicoMensal = new Map<string, { media: number; historico: HistoricoItem[] }>();
  for (const [categoria, meses] of porCategoria) {
    if (encerradas.has(categoria)) continue;
    const ativa = [...meses.keys()].some((m) => m >= atual - MESES_ATIVIDADE);
    if (!ativa) continue;
    const soma = [...meses.values()].reduce((a, m) => a + m.soma, 0);
    const historico = Array.from({ length: MESES_HISTORICO }, (_, i) => inicioHist + i).map((m) => ({
      mes: rotulo(m), valor: arred(meses.get(m)?.soma ?? 0), lancamentos: meses.get(m)?.itens,
    }));
    historicoMensal.set(categoria, { media: arred(soma / MESES_HISTORICO), historico });
  }

  // ── Fotografia: valor mensal por categoria (sem entradas e sem parcelas) ──
  const planejadoMensal = new Map<string, number>();
  for (const item of planejados) {
    if (item.grupo === "entrada" || item.grupo === "parcela" || encerradas.has(item.categoria)) continue;
    planejadoMensal.set(item.categoria, arred((planejadoMensal.get(item.categoria) ?? 0) + valorMensal(item, 1)));
  }
  const referencia = (categoria: string) => ({
    planejado: planejadoMensal.get(categoria) ?? null,
    historico: historicoMensal.get(categoria)?.media ?? null,
  });

  const itens: ItemPrevisao[] = [];
  for (const [i, mes] of futuros.entries()) {
    const m = rotulo(mes);

    // parcelas do histórico
    for (const p of ultimaParcela.values()) {
      if (encerradas.has(p.categoria)) continue;
      const n = p.atual + (mes - p.mes);
      if (mes <= p.mes || n > p.total) continue;
      itens.push({
        mes: m, descricao: p.base, categoria: p.categoria, valor: arred(p.valor),
        tipoPrevisao: "Parcelamento", detalhe: `Parcela ${n}/${p.total}`, referencia: referencia(p.categoria),
      });
    }
    // parcelas da fotografia que não aparecem nos lançamentos
    const basesVistas = [...ultimaParcela.values()].map((p) => p.base.toLowerCase());
    for (const item of planejados) {
      if (item.grupo !== "parcela" || encerradas.has(item.categoria)) continue;
      const desc = item.descricao.toLowerCase();
      if (basesVistas.some((b) => b.includes(desc) || desc.includes(b))) continue;
      const n = numeroParcela(item, i + 1);
      if (n === null) continue;
      itens.push({
        mes: m, descricao: item.descricao, categoria: item.categoria, valor: item.valor,
        tipoPrevisao: "Parcelamento", detalhe: `Parcela ${n}/${item.parcelaTotal} (fotografia)`, referencia: referencia(item.categoria),
      });
    }

    if (base === "fotografia") {
      for (const item of planejados) {
        if (item.grupo === "entrada" || item.grupo === "parcela" || encerradas.has(item.categoria)) continue;
        const valor = valorMensal(item, i + 1);
        if (valor <= 0) continue;
        itens.push({
          mes: m, descricao: item.descricao, categoria: item.categoria, valor: arred(valor),
          tipoPrevisao: "Planejado",
          detalhe: item.periodicidade === "anual" ? "Anual ÷ 12" : item.periodicidade === "semanal" ? "Semanal × 4,33" : "Fotografia do mês",
          referencia: referencia(item.categoria),
        });
      }
    } else {
      for (const [categoria, h] of historicoMensal) {
        if (h.media <= 0) continue;
        itens.push({
          mes: m, descricao: categoria, categoria, valor: h.media,
          tipoPrevisao: "Histórico", detalhe: `Média de ${MESES_HISTORICO} meses`, historico: h.historico,
          referencia: referencia(categoria),
        });
      }
    }
  }

  // Com base na fotografia: o que tem gasto recente mas não está no plano (informativo, não soma)
  const foraDaFotografia = base === "fotografia"
    ? [...historicoMensal.entries()]
        .filter(([cat, h]) => !planejadoMensal.has(cat) && h.media > 0)
        .map(([categoria, h]) => ({ categoria, historico: h.media }))
        .sort((a, b) => b.historico - a.historico)
    : [];

  itens.sort((a, b) => {
    const k = (s: string) => { const [mm, aaaa] = s.split("/"); return `${aaaa}-${mm}`; };
    return k(a.mes).localeCompare(k(b.mes)) || b.valor - a.valor;
  });
  return { base, temFotografia, itens, foraDaFotografia };
}
