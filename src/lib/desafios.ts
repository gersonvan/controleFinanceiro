// Desafios: metas curtas para gastar menos e sair do vermelho. As sugestões são
// regras sobre os lançamentos do próprio usuário (sem IA) e a medição é
// automática. Funções puras — /api/desafios só carrega os dados e grava.
//
// Gastos e encargos contam pela data da compra: a fatura chega depois, então o
// resultado fica parcial até os extratos do período serem importados. A sobra
// do mês segue a competência, como o dashboard. O "normal" de cada desafio
// (referência) é a média dos 6 meses fechados antes do aceite, guardada no
// aceite para o resultado não mudar depois.
import { CATEGORIAS_NEUTRAS, CATEGORIAS_SAIDA } from "./categorias";
import { CATEGORIA_INVESTIMENTO, ehEncargo, ehGasto, mesCompetencia, mesesAte, type TipoConta } from "./financas";

export type ModeloId = "zero-encargos" | "sobra" | "teto-categoria" | "semana-sem-delivery";
export type Medida = "gasto" | "encargos" | "sobra";
export type Status = "ativo" | "cumprido" | "nao_cumprido" | "abandonado";
/** Como o desafio aparece: os três primeiros são o status "ativo" visto pela data. */
export type Estado = "agendado" | "andamento" | "aguardando" | Exclude<Status, "ativo">;

export const NIVEIS: Record<number, string> = { 1: "Consciência", 2: "Sair do vermelho", 3: "Ajustes", 4: "Estrutural" };

export const CATEGORIA_DELIVERY = "Delivery e iFood";

export interface Modelo {
  nivel: 2 | 3;
  medida: Medida;
  duracao: "semana" | "mes";
  nome: string;
  descricao: string;
  categoriaFixa?: string;
}

export const MODELOS: Record<ModeloId, Modelo> = {
  "zero-encargos": {
    nivel: 2, medida: "encargos", duracao: "mes", nome: "Mês sem juros",
    descricao: "Nenhum juro, IOF, multa ou encargo em contas e cartões durante o mês.",
  },
  sobra: {
    nivel: 2, medida: "sobra", duracao: "mes", nome: "Gastar menos do que ganha",
    descricao: "Fechar o mês com as entradas maiores que as saídas.",
  },
  "teto-categoria": {
    nivel: 3, medida: "gasto", duracao: "mes", nome: "Teto numa categoria",
    descricao: "Gastar no máximo um valor escolhido numa categoria durante o mês.",
  },
  "semana-sem-delivery": {
    nivel: 3, medida: "gasto", duracao: "semana", nome: "Semana sem delivery",
    descricao: "Sete dias sem pedir delivery.", categoriaFixa: CATEGORIA_DELIVERY,
  },
};
export const MODELOS_IDS = Object.keys(MODELOS) as ModeloId[];

/** Desafios em andamento (ou agendados) ao mesmo tempo. */
export const LIMITE_SIMULTANEOS = 3;
/** Até este dia o desafio do mês vale para o mês corrente; depois, para o seguinte. */
export const DIA_LIMITE_MES_ATUAL = 10;
/** Depois do fim, quantos dias esperar pelos extratos antes de fechar com o que houver. */
export const DIAS_ESPERA_EXTRATO = 45;
/** Contas com lançamentos até tantos dias antes do início precisam de extrato do período. */
const DIAS_CONTA_ATIVA = 60;
/** Sem tantos meses com lançamentos, não há "normal" para comparar. */
export const MESES_MINIMOS = 2;
const DIAS_MES = 365.25 / 12;
const DIA = 86_400_000;

// Onde cortar é escolha do dia a dia: base das sugestões de teto. Fixas
// (aluguel, escola, plano de saúde) e farmácia ficam de fora das sugestões,
// mas o usuário pode escolher qualquer gasto no catálogo (categoriaAceitaTeto).
export const CATEGORIAS_TETO_SUGERIDAS = [
  "Supermercado e Mercearia", "Restaurantes e Lanches", "Delivery e iFood",
  "Transporte por App", "Combustível", "Estacionamento",
  "Compras", "Lazer e Entretenimento", "Viagem", "Cuidados Pessoais", "Presentes",
  "Casa: Manutenção e Móveis",
];
/** Teto sugerido para uma categoria acima da média / na média. */
const CORTE_ACIMA = 0.15;
const CORTE_NORMAL = 0.10;
/** Abaixo disto (por mês) a categoria não vale um desafio. */
const MEDIA_MINIMA_TETO = 100;
/** Pedidos de delivery por mês a partir dos quais vale a semana sem. */
const PEDIDOS_DELIVERY_MINIMO = 4;
const MAX_SUGESTOES = 5;

const NAO_SAO_GASTO = new Set([
  ...CATEGORIAS_NEUTRAS, CATEGORIA_INVESTIMENTO,
  "Empréstimo", "Pagamento de Empréstimos", "Compra e Venda de Bens", "Transferência para Terceiros",
]);
/** Gasto em que dá para pôr teto: nativo de saída que é gasto de verdade, ou uma categoria própria de gasto. */
export function categoriaAceitaTeto(c: string, propriasDeGasto: ReadonlySet<string> = new Set()): boolean {
  return ((CATEGORIAS_SAIDA as readonly string[]).includes(c) && !NAO_SAO_GASTO.has(c)) || propriasDeGasto.has(c);
}

export interface LancamentoDesafio {
  data: Date;
  mesReferencia: Date | null;
  valor: number;            // já líquido de reembolsos
  categoria: string | null;
  descricao: string;
  conta: string;
  tipo: string;             // "Entrada" | "Saída"
  fonte: string | null;     // "Importado …" quando veio de extrato
  createdAt: Date;
}

export interface Desafio {
  id: number;
  modelo: string;
  categoria: string | null;
  meta: number;             // gasto/encargos: máximo; sobra: mínimo
  referencia: number;       // o normal do usuário no período, na data do aceite
  inicio: Date;
  fim: Date;
  status: string;
  resultado: number | null;
  economia: number | null;
  parcial: boolean;         // fechado sem todos os extratos do período
  encerradoEm: Date | null;
}

const arred = (n: number) => Math.round(n * 100) / 100;
const arred10 = (n: number) => Math.round(n / 10) * 10;
const soma = (v: number[]) => v.reduce((a, b) => a + b, 0);
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nomeDoMes = (mes: string) => MESES[Number(mes.slice(5, 7)) - 1];
const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });

export const ehModelo = (m: string): m is ModeloId => m in MODELOS;

/** Data de hoje no Brasil, à meia-noite UTC (como as datas dos lançamentos). */
export function diaDeHoje(agora = new Date()): Date {
  const [a, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

const inicioDoDia = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export function tituloDoDesafio(d: Pick<Desafio, "modelo" | "categoria" | "meta">): string {
  switch (d.modelo) {
    case "zero-encargos": return d.meta > 0 ? `Juros abaixo de ${brl(d.meta)} no mês` : "Mês sem juros";
    case "sobra":
      return d.meta > 0 ? `Sobrar ${brl(d.meta)} no mês`
        : d.meta < 0 ? `Reduzir o vermelho do mês a ${brl(-d.meta)}`
        : "Gastar menos do que ganha";
    case "teto-categoria": return `Até ${brl(d.meta)} em ${d.categoria} no mês`;
    case "semana-sem-delivery": return d.meta > 0 ? `Semana com até ${brl(d.meta)} de delivery` : "Semana sem delivery";
  }
  return d.modelo;
}

/** Semana: hoje e os 6 dias seguintes. Mês: o corrente até o dia 10; depois, o próximo. */
export function periodoDo(modelo: ModeloId, hoje: Date): { inicio: Date; fim: Date } {
  const a = hoje.getUTCFullYear(), m = hoje.getUTCMonth(), d = hoje.getUTCDate();
  if (MODELOS[modelo].duracao === "semana")
    return { inicio: new Date(Date.UTC(a, m, d)), fim: new Date(Date.UTC(a, m, d + 6, 23, 59, 59, 999)) };
  const alvo = d <= DIA_LIMITE_MES_ATUAL ? m : m + 1;
  return { inicio: new Date(Date.UTC(a, alvo, 1)), fim: new Date(Date.UTC(a, alvo + 1, 0, 23, 59, 59, 999)) };
}

// ─── Histórico: o "normal" de cada medida nos 6 meses fechados ──────────────

interface MesBase {
  gastoTotal: number;
  porCategoria: Map<string, number>;
  encargos: number;          // líquido das devoluções
  entradas: number;
  saidas: number;
  pedidosDelivery: number;
}

export interface Base {
  meses: string[];           // os 6 meses fechados antes de hoje, do mais antigo ao mais novo
  porMes: MesBase[];
  mesesComDados: number;     // meses com algum gasto: os vazios não puxam a média para baixo
}

const entraNoSaldo = (l: Pick<LancamentoDesafio, "categoria">) =>
  !CATEGORIAS_NEUTRAS.has(l.categoria ?? "") && l.categoria !== CATEGORIA_INVESTIMENTO;

export function montarBase(lancamentos: LancamentoDesafio[], hoje: Date): Base {
  const anterior = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1));
  const meses = mesesAte(anterior.getUTCFullYear(), anterior.getUTCMonth() + 1, 6);
  const porMes = new Map<string, MesBase>(meses.map((m) => [m, {
    gastoTotal: 0, porCategoria: new Map(), encargos: 0, entradas: 0, saidas: 0, pedidosDelivery: 0,
  }]));
  for (const l of lancamentos) {
    const alvo = porMes.get(mesCompetencia(l));
    if (!alvo) continue;
    if (ehEncargo(l.descricao)) alvo.encargos -= l.valor;
    if (entraNoSaldo(l)) {
      if (l.tipo === "Entrada") alvo.entradas += l.valor;
      else if (l.tipo === "Saída") alvo.saidas -= l.valor;
    }
    if (!ehGasto(l)) continue;
    alvo.gastoTotal -= l.valor;
    if (l.categoria) alvo.porCategoria.set(l.categoria, (alvo.porCategoria.get(l.categoria) ?? 0) - l.valor);
    if (l.categoria === CATEGORIA_DELIVERY) alvo.pedidosDelivery++;
  }
  const lista = meses.map((m) => {
    const b = porMes.get(m)!;
    return { ...b, encargos: Math.max(b.encargos, 0) };
  });
  return { meses, porMes: lista, mesesComDados: lista.filter((b) => b.gastoTotal > 0).length };
}

const divisor = (base: Base) => Math.max(base.mesesComDados, 1);
const serieCategoria = (base: Base, c: string) => base.porMes.map((b) => Math.max(b.porCategoria.get(c) ?? 0, 0));
/** Sobra de cada mês; null quando o mês não tem entradas registradas (só fatura importada, p. ex.). */
const serieSobra = (base: Base) => base.porMes.map((b) => (b.entradas > 0 && b.saidas > 0 ? b.entradas - b.saidas : null));

/** O normal do usuário para o desafio, no tamanho do período (semana = 7/30,4 do mês). */
export function referenciaDo(modelo: ModeloId, categoria: string | null, base: Base): number {
  const m = MODELOS[modelo];
  if (m.medida === "sobra") {
    const sobras = serieSobra(base).filter((v): v is number => v !== null);
    return sobras.length ? arred(soma(sobras) / sobras.length) : 0;
  }
  const mensal = m.medida === "encargos"
    ? soma(base.porMes.map((b) => b.encargos)) / divisor(base)
    : soma(serieCategoria(base, categoria ?? "")) / divisor(base);
  return arred(m.duracao === "semana" ? (mensal * 7) / DIAS_MES : mensal);
}

/** Categoria do desafio: a fixa do modelo ou a escolhida (só para teto). */
export function categoriaDo(modelo: ModeloId, categoria: string | null | undefined): string | null {
  const m = MODELOS[modelo];
  if (m.categoriaFixa) return m.categoriaFixa;
  return m.medida === "gasto" ? categoria ?? null : null;
}

// ─── Sugestões ───────────────────────────────────────────────────────────────

export interface Sugestao {
  modelo: ModeloId;
  categoria: string | null;
  meta: number;
  referencia: number;
  nivel: number;
  titulo: string;
  motivo: string;
  potencial: number;         // economia esperada no período (0 para a sobra, que não soma economia)
  inicio: Date;
  fim: Date;
}

const emAndamento = (d: Pick<Desafio, "status" | "fim">, hoje: Date) => d.status === "ativo" && d.fim >= hoje;
const mesmoAlvo = (d: Pick<Desafio, "modelo" | "categoria">, modelo: string, categoria: string | null) =>
  d.modelo === modelo && (d.categoria ?? null) === (categoria ?? null);

/**
 * O que o app sugere, pelas regras: encargos pagos → mês sem juros; meses no
 * vermelho → gastar menos do que ganha; delivery frequente → semana sem;
 * categorias do dia a dia com gasto relevante → teto 10% abaixo da média (15%
 * quando o último mês passou dela). O básico (nível 2) vem antes; dentro do
 * nível, a maior economia.
 */
export function sugerirDesafios(base: Base, desafios: Desafio[], hoje: Date): Sugestao[] {
  if (base.mesesComDados < MESES_MINIMOS) return [];
  const n = divisor(base);
  const sugestoes: Sugestao[] = [];
  const nova = (modelo: ModeloId, categoria: string | null, meta: number, motivo: string, potencial?: number) => {
    const referencia = referenciaDo(modelo, categoria, base);
    sugestoes.push({
      modelo, categoria, meta, referencia, motivo,
      nivel: MODELOS[modelo].nivel,
      titulo: tituloDoDesafio({ modelo, categoria, meta }),
      potencial: arred(potencial ?? Math.max(referencia - meta, 0)),
      ...periodoDo(modelo, hoje),
    });
  };

  const ultimos3 = base.porMes.slice(-3);
  const encargos3 = soma(ultimos3.map((b) => b.encargos));
  if (encargos3 >= 1) nova("zero-encargos", null, 0, `Você pagou ${brl(encargos3)} em juros e encargos nos últimos 3 meses.`);

  const sobras = serieSobra(base);
  const vermelhos = sobras.slice(-3).map((v, i) => ({ v, mes: base.meses[3 + i] })).filter((s) => s.v !== null && s.v < 0);
  if (vermelhos.length) {
    const motivo = vermelhos.length === 1
      ? `Em ${nomeDoMes(vermelhos[0].mes)} as saídas passaram as entradas em ${brl(-vermelhos[0].v!)}.`
      : `Em ${vermelhos.length} dos últimos 3 meses as saídas passaram as entradas.`;
    nova("sobra", null, 0, motivo, 0);
  }

  const pedidos = soma(base.porMes.map((b) => b.pedidosDelivery)) / n;
  const delivery = pedidos >= PEDIDOS_DELIVERY_MINIMO;
  if (delivery) {
    const mensal = soma(serieCategoria(base, CATEGORIA_DELIVERY)) / n;
    nova("semana-sem-delivery", CATEGORIA_DELIVERY, 0,
      `Você pede delivery umas ${Math.round(pedidos)} vezes por mês (${brl(mensal)} em média).`);
  }

  const tetos = CATEGORIAS_TETO_SUGERIDAS
    .filter((c) => !(delivery && c === CATEGORIA_DELIVERY))
    .map((c) => {
      const serie = serieCategoria(base, c);
      const media = soma(serie) / n;
      const ultimo = serie[serie.length - 1];
      const acima = ultimo > media * 1.05;
      return { c, media, ultimo, acima, meses: serie.filter((v) => v > 0).length };
    })
    .filter((t) => t.media >= MEDIA_MINIMA_TETO && t.meses >= 3)
    .map((t) => ({ ...t, meta: arred10(t.media * (1 - (t.acima ? CORTE_ACIMA : CORTE_NORMAL))) }))
    .sort((a, b) => (b.media - b.meta) - (a.media - a.meta))
    .slice(0, 3);
  for (const t of tetos) {
    const ultimoMes = base.meses[base.meses.length - 1];
    nova("teto-categoria", t.c, t.meta, t.acima
      ? `Em ${nomeDoMes(ultimoMes)} foram ${brl(t.ultimo)}, acima da sua média de ${brl(t.media)}.`
      : `Sua média é de ${brl(t.media)} por mês.`);
  }

  return sugestoes
    .filter((s) => !desafios.some((d) => emAndamento(d, hoje) && mesmoAlvo(d, s.modelo, s.categoria)))
    // dentro do nível 2, sair do vermelho vem antes dos juros: é a causa deles
    .sort((a, b) => a.nivel - b.nivel || Number(b.modelo === "sobra") - Number(a.modelo === "sobra") || b.potencial - a.potencial)
    .slice(0, MAX_SUGESTOES);
}

/** Categorias que o usuário pode escolher no teto, com a média e o teto proposto (10% abaixo).
 *  As próprias entram aqui (escolha do usuário), não nas sugestões automáticas. */
export function opcoesDeTeto(base: Base, propriasDeGasto: ReadonlySet<string> = new Set()): { categoria: string; media: number; meta: number }[] {
  const n = divisor(base);
  const categorias = new Set(base.porMes.flatMap((b) => [...b.porCategoria.keys()]));
  return [...categorias]
    .filter((c) => categoriaAceitaTeto(c, propriasDeGasto))
    .map((c) => {
      const media = soma(serieCategoria(base, c)) / n;
      return { categoria: c, media: arred(media), meta: arred10(media * (1 - CORTE_NORMAL)) };
    })
    .filter((o) => o.media > 0)
    .sort((a, b) => b.media - a.media);
}

// ─── Medição ─────────────────────────────────────────────────────────────────

/** Valor medido: gasto ou encargos no período (pela data da compra) ou a sobra do mês. */
export function medir(d: Pick<Desafio, "modelo" | "categoria" | "inicio" | "fim">, lancamentos: LancamentoDesafio[]): number {
  if (!ehModelo(d.modelo)) return 0;
  const medida = MODELOS[d.modelo].medida;
  if (medida === "sobra") {
    const mes = mesCompetencia({ data: d.inicio, mesReferencia: null });
    let sobra = 0;
    for (const l of lancamentos) {
      if (mesCompetencia(l) !== mes || !entraNoSaldo(l)) continue;
      if (l.tipo === "Entrada" || l.tipo === "Saída") sobra += l.valor;
    }
    return arred(sobra);
  }
  let total = 0;
  for (const l of lancamentos) {
    if (l.data < d.inicio || l.data > d.fim) continue;
    if (medida === "encargos" ? ehEncargo(l.descricao) : l.categoria === d.categoria) total -= l.valor;
  }
  return arred(Math.max(total, 0));
}

export interface ContaPendente { conta: string; ate: Date }

/**
 * Contas usadas perto do período cujo extrato ainda não cobre até o fim dele.
 * Conta corrente: tem lançamento no último dia ou depois, ou um extrato
 * importado depois do fim. Cartão: compra no último dia ou depois, ou a fatura
 * de dois meses à frente (que com certeza fecha depois do fim). Para a sobra,
 * que é por competência, basta a fatura do próprio mês.
 */
export function contasPendentes(
  d: Pick<Desafio, "modelo" | "inicio" | "fim">,
  lancamentos: LancamentoDesafio[],
  tipos: Map<string, TipoConta>,
): ContaPendente[] {
  const desde = d.inicio.getTime() - DIAS_CONTA_ATIVA * DIA;
  const ultimoDia = inicioDoDia(d.fim);
  const contas = new Map<string, { data: Date; ref: Date | null; importado: Date | null; ativa: boolean }>();
  for (const l of lancamentos) {
    const c = contas.get(l.conta) ?? { data: l.data, ref: null, importado: null, ativa: false };
    if (l.data > c.data) c.data = l.data;
    if (l.mesReferencia && (!c.ref || l.mesReferencia > c.ref)) c.ref = l.mesReferencia;
    if (l.fonte?.startsWith("Importado") && (!c.importado || l.createdAt > c.importado)) c.importado = l.createdAt;
    if (l.data.getTime() >= desde && l.data <= d.fim) c.ativa = true;
    contas.set(l.conta, c);
  }
  const porCompetencia = ehModelo(d.modelo) && MODELOS[d.modelo].medida === "sobra";
  const mesFim = Date.UTC(d.fim.getUTCFullYear(), d.fim.getUTCMonth(), 1);
  const faturaQueCobre = porCompetencia ? mesFim : Date.UTC(d.fim.getUTCFullYear(), d.fim.getUTCMonth() + 2, 1);
  const pendentes: ContaPendente[] = [];
  for (const [conta, c] of contas) {
    if (!c.ativa || c.data >= ultimoDia) continue;
    const cartao = (tipos.get(conta) ?? "corrente") === "cartao";
    if (cartao && c.ref && c.ref.getTime() >= faturaQueCobre) continue;
    if (!cartao && c.importado && c.importado > d.fim) continue;
    pendentes.push({ conta, ate: c.data });
  }
  return pendentes.sort((a, b) => a.conta.localeCompare(b.conta));
}

export interface Fechamento { status: "cumprido" | "nao_cumprido"; resultado: number; economia: number | null; parcial: boolean }

/** Cumprido ou não e a economia: o quanto ficou abaixo do normal (a sobra não soma economia — ela já inclui a dos outros desafios). */
export function fechar(d: Pick<Desafio, "modelo" | "meta" | "referencia">, resultado: number, parcial: boolean): Fechamento {
  const sobra = ehModelo(d.modelo) && MODELOS[d.modelo].medida === "sobra";
  const cumprido = sobra ? resultado >= d.meta - 0.005 : resultado <= d.meta + 0.005;
  return {
    status: cumprido ? "cumprido" : "nao_cumprido",
    resultado,
    economia: sobra ? null : arred(Math.max(d.referencia - resultado, 0)),
    parcial,
  };
}

export interface Avaliacao {
  estado: Estado;
  resultado: number | null;
  pendentes: ContaPendente[];
  fechamento: Fechamento | null; // para gravar: o período acabou e os extratos chegaram (ou cansou de esperar)
}

export function avaliar(d: Desafio, lancamentos: LancamentoDesafio[], tipos: Map<string, TipoConta>, hoje: Date, forcar = false): Avaliacao {
  if (d.status !== "ativo") return { estado: d.status as Estado, resultado: d.resultado, pendentes: [], fechamento: null };
  if (hoje < d.inicio) return { estado: "agendado", resultado: null, pendentes: [], fechamento: null };
  const resultado = medir(d, lancamentos);
  if (hoje <= d.fim) return { estado: "andamento", resultado, pendentes: [], fechamento: null };
  const pendentes = contasPendentes(d, lancamentos, tipos);
  const cansou = hoje.getTime() > d.fim.getTime() + DIAS_ESPERA_EXTRATO * DIA;
  if (pendentes.length && !cansou && !forcar) return { estado: "aguardando", resultado, pendentes, fechamento: null };
  const f = fechar(d, resultado, pendentes.length > 0);
  return { estado: f.status, resultado, pendentes, fechamento: f };
}

/** Depois de um "não cumprido": meio caminho entre a meta e o resultado, ainda abaixo do normal. */
export function metaMaisFacil(d: Pick<Desafio, "modelo" | "meta" | "referencia" | "resultado" | "status">): number | null {
  if (d.status !== "nao_cumprido" || d.resultado === null || !ehModelo(d.modelo)) return null;
  const medida = MODELOS[d.modelo].medida;
  let nova = arred10((d.meta + d.resultado) / 2);
  if (medida === "gasto" && d.referencia > 0) nova = Math.min(nova, arred10(d.referencia * 0.95));
  if (medida === "sobra" ? nova >= d.meta : nova <= d.meta) return d.meta; // não há meio-termo: tentar de novo
  return nova;
}

/** Economia somada dos desafios fechados. */
export function economiaAcumulada(desafios: Pick<Desafio, "status" | "economia">[]): number {
  return arred(soma(desafios.filter((d) => d.status === "cumprido" || d.status === "nao_cumprido").map((d) => d.economia ?? 0)));
}

/** Desafios que ocupam vaga: aceitos e ainda não terminados. */
export function ocupamVaga(desafios: Pick<Desafio, "status" | "fim">[], hoje: Date): number {
  return desafios.filter((d) => emAndamento(d, hoje)).length;
}

/** Já existe um desafio igual (mesmo modelo e categoria) cobrindo parte do período? */
export function repetido(
  desafios: Pick<Desafio, "modelo" | "categoria" | "status" | "inicio" | "fim">[],
  novo: { modelo: string; categoria: string | null; inicio: Date; fim: Date },
): boolean {
  return desafios.some((d) =>
    d.status !== "abandonado" && mesmoAlvo(d, novo.modelo, novo.categoria) && d.inicio <= novo.fim && novo.inicio <= d.fim);
}
