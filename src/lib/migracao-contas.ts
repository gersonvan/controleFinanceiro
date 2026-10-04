// Plano da migração para contas por banco (lib/bancos.ts): cada nome antigo de
// conta vira o nome gerado por banco + tipo + apelido. Função pura — o script
// scripts/migrar-contas.ts mostra a prévia e aplica com backup.
import { contaNativa, interpretarNomeAntigo, nomeDaConta, type DadosConta } from "./bancos";
import type { TipoConta } from "./financas";

export interface EstadoContas {
  lancamentosPorConta: Map<string, number>;
  reservas: { id: number; conta: string | null }[];
  perfis: { id: number; builtin: string | null; conta: string }[];
  contas: { nome: string; tipo: string }[]; // registro atual: o tipo pode ter sido escolhido pelo usuário
}

export interface ItemPlano { antigo: string; novo: string; dados: DadosConta; lancamentos: number; reservas: number }
export interface PlanoMigracao {
  itens: ItemPlano[];
  perfis: { id: number; conta: string; banco: string; tipoConta: TipoConta }[];
  contasFinais: (DadosConta & { nome: string })[];
}

export function planejarMigracao(e: EstadoContas): PlanoMigracao {
  const tipoEscolhido = new Map(e.contas.map((c) => [c.nome, (c.tipo === "cartao" ? "cartao" : "corrente") as TipoConta]));
  const nomes = new Set<string>([
    ...e.lancamentosPorConta.keys(),
    ...e.reservas.flatMap((r) => (r.conta ? [r.conta] : [])),
    ...e.perfis.filter((p) => !p.builtin).map((p) => p.conta),
    ...e.contas.map((c) => c.nome),
  ]);
  const itens: ItemPlano[] = [...nomes].map((antigo) => {
    const dados = interpretarNomeAntigo(antigo, tipoEscolhido.get(antigo));
    return {
      antigo, novo: nomeDaConta(dados), dados,
      lancamentos: e.lancamentosPorConta.get(antigo) ?? 0,
      reservas: e.reservas.filter((r) => r.conta === antigo).length,
    };
  }).sort((a, b) => a.novo.localeCompare(b.novo, "pt-BR") || b.lancamentos - a.lancamentos);

  const novoDe = new Map(itens.map((i) => [i.antigo, i]));
  const perfis = e.perfis.map((p) => {
    if (p.builtin) { const n = contaNativa(p.builtin); return { id: p.id, conta: n.conta, banco: n.banco, tipoConta: n.tipoConta }; }
    const i = novoDe.get(p.conta)!;
    return { id: p.id, conta: i.novo, banco: i.dados.banco, tipoConta: i.dados.tipo };
  });

  const finais = new Map<string, DadosConta & { nome: string }>();
  for (const i of itens) finais.set(i.novo, { ...i.dados, nome: i.novo });
  return { itens, perfis, contasFinais: [...finais.values()] };
}
