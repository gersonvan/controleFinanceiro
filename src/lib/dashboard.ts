// Dashboard (tela inicial): o que é calculado a partir dos lançamentos do período
// e o que vira aviso no "Fique de olho". Funções puras — a rota /api/dashboard e a
// página só buscam e mostram.
import { CATEGORIAS_NEUTRAS } from "./categorias";
import { CATEGORIA_INVESTIMENTO } from "./financas";

export const SEM_CATEGORIA = "Sem categoria";
const arred = (n: number) => Math.round(n * 100) / 100;

export interface LancamentoDashboard {
  data: Date;
  mesReferencia: Date | null;
  valor: number; // já líquido de reembolsos
  tipo: string;
  categoria: string | null;
  conta: string;
}

export interface MesEntradasSaidas { mes: string; entradas: number; saidas: number }

export interface DadosDashboard {
  totalEntradas: number;
  totalSaidas: number;
  saldo: number;
  investido: number;                 // aplicado − resgatado (fora das saídas)
  porCategoria: [string, number][];  // todas as saídas, sem categoria inclusive: a soma é totalSaidas
  porMes: MesEntradasSaidas[];       // ano: jan até o último mês; mês: os 6 meses até ele
  porConta: [string, number][];
}

/** "2026-11": o mês de referência (fatura) quando há, senão o da data. */
export const chaveMes = (l: Pick<LancamentoDashboard, "data" | "mesReferencia">) => {
  const d = l.mesReferencia ?? l.data;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const chaveDe = (ano: number, mes: number) => {
  const d = new Date(Date.UTC(ano, mes - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

/**
 * Os meses do gráfico: no mês, ele e os 5 anteriores; no ano, de janeiro até o
 * mês atual (ano corrente) ou até dezembro.
 */
export function mesesDoGrafico(ano: number, mes: number | undefined, hoje = new Date()): string[] {
  if (mes) return Array.from({ length: 6 }, (_, i) => chaveDe(ano, mes - 5 + i));
  const ate = ano === hoje.getFullYear() ? hoje.getMonth() + 1 : ano < hoje.getFullYear() ? 12 : 0;
  return Array.from({ length: ate }, (_, i) => chaveDe(ano, i + 1));
}

/**
 * Totais do período (um mês ou o ano) e a série de meses do gráfico. Movimentação
 * interna fica de fora; aporte em investimento não é saída, vai para "investido".
 */
export function agregarDashboard(lancamentos: LancamentoDashboard[], ano: number, mes: number | undefined, hoje = new Date()): DadosDashboard {
  const doPeriodo = (k: string) => (mes ? k === chaveDe(ano, mes) : k.startsWith(`${ano}-`));
  const grafico = mesesDoGrafico(ano, mes, hoje);
  const porMes = new Map(grafico.map((k) => [k, { mes: k, entradas: 0, saidas: 0 }]));

  let entradas = 0, saidas = 0, investido = 0;
  const porCategoria = new Map<string, number>();
  const porConta = new Map<string, number>();
  for (const l of lancamentos) {
    const k = chaveMes(l);
    if (CATEGORIAS_NEUTRAS.has(l.categoria ?? "")) continue;
    if (l.categoria === CATEGORIA_INVESTIMENTO) { if (doPeriodo(k)) investido -= l.valor; continue; }
    const m = porMes.get(k);
    if (l.tipo === "Entrada") {
      if (m) m.entradas += l.valor;
      if (doPeriodo(k)) entradas += l.valor;
    } else {
      const v = Math.abs(l.valor);
      if (m) m.saidas += v;
      if (!doPeriodo(k)) continue;
      saidas += v;
      const cat = l.categoria || SEM_CATEGORIA;
      porCategoria.set(cat, (porCategoria.get(cat) ?? 0) + v);
      porConta.set(l.conta, (porConta.get(l.conta) ?? 0) + v);
    }
  }
  const ordenado = (m: Map<string, number>) => [...m].map(([k, v]): [string, number] => [k, arred(v)]).sort((a, b) => b[1] - a[1]);
  const temAlgo = [...porMes.values()].some((m) => m.entradas || m.saidas);
  return {
    totalEntradas: arred(entradas),
    totalSaidas: arred(saidas),
    saldo: arred(entradas - saidas),
    investido: arred(investido),
    porCategoria: ordenado(porCategoria),
    porMes: temAlgo ? [...porMes.values()].map((m) => ({ mes: m.mes, entradas: arred(m.entradas), saidas: arred(m.saidas) })) : [],
    porConta: ordenado(porConta),
  };
}

/**
 * Onde as saídas do mês devem fechar: o que já saiu mais o que a média dos meses
 * anteriores costuma gastar nos dias que faltam (o ritmo mede as saídas das contas;
 * a fatura do cartão já entra inteira no mês dela). Null fora do mês corrente ou sem média.
 */
export function projecaoDasSaidas(realizado: number, ritmo: { projecao: number | null; gastoAteHoje: number; mesesNaMedia: number } | null): number | null {
  if (!ritmo || ritmo.projecao == null || ritmo.mesesNaMedia === 0) return null;
  return arred(realizado + Math.max(ritmo.projecao - ritmo.gastoAteHoje, 0));
}

// ─── Fique de olho ────────────────────────────────────────────────────────────

export type NivelAviso = "alerta" | "atencao" | "info";
export interface Aviso {
  id: "divida" | "reserva" | "sem-fatia" | "desafios";
  nivel: NivelAviso;
  titulo: string;   // em negrito
  texto: string;    // o resto da frase
  href: string;
  acao: string;     // "Revisar", "Ver reserva"…
}

export interface DesafioResumo { titulo: string; estado: string; medida: string; meta: number; resultado: number | null }

const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Como está um desafio em andamento, numa frase. */
export function situacaoDoDesafio(d: DesafioResumo): string {
  const r = d.resultado ?? 0;
  if (d.estado === "agendado") return "começa em breve";
  if (d.estado === "aguardando") return "aguardando extrato";
  if (d.medida === "sobra") return r >= 0 ? `sobra de ${reais(r)} até agora` : `${reais(-r)} no vermelho até agora`;
  if (d.meta > 0) return `${reais(r)} de ${reais(d.meta)}`;
  return r > 0 ? `${reais(r)} até agora` : "nada até agora";
}

export interface EntradaAvisos {
  mesLongo: string | null; // "novembro"; null no ano todo (sem avisos do mês)
  query: string;           // "?ano=2026&mes=11"
  divida: { mes: { total: number }; principal: { origem: string } | null } | null;
  semFatia: number | null;
  reserva: { emConta: number; disponivel: number; bloqueado: number } | null;
  desafios: { economiaAcumulada: number; emCurso: DesafioResumo[]; sugestoes: { titulo: string; motivo: string }[] } | null;
}

/**
 * O que pede atenção, do mais grave ao informativo: custo de dívida no mês,
 * contas no vermelho, gasto sem fatia (sem categoria ou Pix para pessoas), e o
 * acompanhamento da reserva e dos desafios. Nada a dizer: lista vazia (o cartão some).
 */
export function montarAvisos(e: EntradaAvisos): Aviso[] {
  const avisos: Aviso[] = [];
  if (e.mesLongo && e.divida && e.divida.mes.total > 0) {
    avisos.push({
      id: "divida", nivel: "alerta",
      titulo: `${reais(e.divida.mes.total)} em juros, IOF e multas`,
      texto: `em ${e.mesLongo}${e.divida.principal ? ` — a maior parte vem de ${e.divida.principal.origem.toLowerCase()}` : ""}.`,
      href: `/financas/divida${e.query}`, acao: "Ver detalhes",
    });
  }
  if (e.reserva && e.reserva.emConta < 0) {
    avisos.push({
      id: "reserva", nivel: "alerta",
      titulo: `Contas no vermelho: ${reais(e.reserva.emConta)}`,
      texto: `em conta. Aplicado: ${reais(e.reserva.disponivel)}.`,
      href: "/reserva", acao: "Ver reserva",
    });
  }
  if (e.mesLongo && e.semFatia && e.semFatia > 0) {
    avisos.push({
      id: "sem-fatia", nivel: "atencao",
      titulo: `${reais(e.semFatia)} sem categoria ou em Pix para pessoas`,
      texto: "ficaram fora do 50/30/20.",
      href: "/lancamentos/revisar", acao: "Revisar",
    });
  }
  if (e.reserva && e.reserva.emConta >= 0) {
    avisos.push({
      id: "reserva", nivel: "info",
      titulo: `Reserva: ${reais(e.reserva.disponivel)} aplicados`,
      texto: [e.reserva.bloqueado > 0 && `${reais(e.reserva.bloqueado)} bloqueado`, `${reais(e.reserva.emConta)} em conta`].filter(Boolean).join(" · ") + ".",
      href: "/reserva", acao: "Ver reserva",
    });
  }
  const d = e.desafios;
  if (d && (d.emCurso.length > 0 || d.sugestoes.length > 0)) {
    const economia = d.economiaAcumulada > 0 ? ` Economia acumulada: ${reais(d.economiaAcumulada)}.` : "";
    avisos.push(d.emCurso.length > 0 ? {
      id: "desafios", nivel: "info",
      titulo: `Desafios: ${d.emCurso.length} em andamento`,
      texto: `— ${d.emCurso[0].titulo}: ${situacaoDoDesafio(d.emCurso[0])}.${economia}`,
      href: "/desafios", acao: d.emCurso.length === 1 ? "Ver desafio" : "Ver desafios",
    } : {
      id: "desafios", nivel: "info",
      titulo: `Sugestão de desafio: ${d.sugestoes[0].titulo}`,
      texto: `— ${d.sugestoes[0].motivo}${economia}`,
      href: "/desafios", acao: "Ver desafios",
    });
  }
  return avisos;
}
