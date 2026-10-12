"use client";
// O que foi lido de um PDF, para o usuário conferir e revisar antes de importar: as
// linhas, a soma e — quando a fatura traz um resumo conhecido — se a soma bate com
// ele (lib/importacao/conferencia.ts). Leitor nenhum fica à prova de mudança de
// layout: aqui o usuário corrige, exclui ou inclui linhas (lib/importacao/ajustes.ts)
// e a conferência acompanha.
import { useState } from "react";
import { Pencil, Trash2, Undo2 } from "lucide-react";
import { reconferir, type ConferenciaFatura } from "@/lib/importacao/conferencia";
import { aplicarAjustes, semAjustes, temAjustes, type AjustesLeitura, type LinhaEditada } from "@/lib/importacao/ajustes";
import { parseValor } from "@/lib/importacao/tipos";

/** data "AAAA-MM-DD"; valor < 0 = gasto */
export type LinhaLida = LinhaEditada;

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (iso: string) => iso.split("-").reverse().join("/");
const MOSTRAR = 10;

/** As linhas como vão ser importadas, depois da revisão. */
export const linhasRevisadas = (linhas: LinhaLida[], ajustes: AjustesLeitura | null | undefined) =>
  ajustes ? aplicarAjustes(linhas, ajustes, (_, l) => l) : linhas;

export function AvisoConferencia({ conferencia, compacto = false }: { conferencia: ConferenciaFatura; compacto?: boolean }) {
  const { rotulo, esperado, lido, confere } = conferencia;
  const tamanho = compacto ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm";
  if (confere) {
    return (
      <div className={`rounded-lg border border-green-200 bg-green-50 text-green-800 ${tamanho}`} role="status" data-conferencia="confere">
        ✓ A soma confere com a fatura: {fmt(esperado)} em “{rotulo}”.
      </div>
    );
  }
  const diferenca = Math.abs(esperado - lido);
  return (
    <div className={`rounded-lg border border-amber-300 bg-amber-50 text-amber-900 ${tamanho}`} role="alert" data-conferencia="diferente">
      ⚠️ A soma lida ({fmt(lido)}) não bate com a fatura ({fmt(esperado)} em “{rotulo}”):{" "}
      {lido < esperado ? `faltam ${fmt(diferenca)}` : `sobram ${fmt(diferenca)}`}. O layout da fatura pode ter mudado —
      confira as linhas e corrija, exclua ou inclua o que for preciso antes de importar.
    </div>
  );
}

type Estado = "lida" | "corrigida" | "excluida" | "incluida";
interface LinhaTela { chave: string; linha: LinhaLida; estado: Estado }
interface Formulario { data: string; descricao: string; valor: string; credito: boolean }

const paraFormulario = (l: LinhaLida): Formulario => ({
  data: l.data, descricao: l.descricao, credito: l.valor > 0,
  valor: l.valor ? Math.abs(l.valor).toFixed(2).replace(".", ",") : "",
});

interface Props {
  linhas: LinhaLida[];
  conferencia: ConferenciaFatura | null;  // da leitura; é refeita com as correções
  total?: number;                         // linhas lidas no servidor (a prévia pode ter vindo cortada)
  ajustes?: AjustesLeitura | null;
  onAjustes?: (ajustes: AjustesLeitura) => void; // sem ele, só leitura
}

export default function LeituraPDF({ linhas, conferencia, total = linhas.length, ajustes, onAjustes }: Props) {
  const aj = ajustes ?? semAjustes(total);
  const revisavel = !!onAjustes && total === linhas.length;
  const finais = linhasRevisadas(linhas, aj);
  const conferenciaAtual = conferencia && reconferir(conferencia, finais);
  const [todas, setTodas] = useState(() => !!conferencia && !conferencia.confere);
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState<Formulario | null>(null);
  const [erro, setErro] = useState("");

  const excluir = new Set(aj.excluir);
  const corrigir = new Map(aj.alterar.map((a) => [a.i, a]));
  const telas: LinhaTela[] = [
    ...linhas.map((l, i): LinhaTela => excluir.has(i) ? { chave: `o${i}`, linha: l, estado: "excluida" }
      : corrigir.has(i) ? { chave: `o${i}`, linha: corrigir.get(i)!, estado: "corrigida" }
      : { chave: `o${i}`, linha: l, estado: "lida" }),
    ...aj.incluir.map((l, k): LinhaTela => ({ chave: `n${k}`, linha: l, estado: "incluida" })),
  ];
  // recolhida: as primeiras linhas e o que o usuário incluiu
  const visiveis = todas ? telas : telas.filter((t, idx) => idx < MOSTRAR || t.estado === "incluida");
  const gastos = -finais.filter((l) => l.valor < 0).reduce((a, l) => a + l.valor, 0);
  const creditos = finais.filter((l) => l.valor > 0).reduce((a, l) => a + l.valor, 0);
  const plural = (n: number, s: string) => `${n} ${s}${n !== 1 ? "s" : ""}`;

  const mudar = (novo: Partial<AjustesLeitura>) => onAjustes?.({ ...aj, ...novo });
  const indice = (chave: string) => parseInt(chave.slice(1));

  const abrir = (chave: string, linha: LinhaLida) => { setEditando(chave); setForm(paraFormulario(linha)); setErro(""); };
  const fechar = () => { setEditando(null); setForm(null); setErro(""); };

  const salvar = () => {
    if (!form || !editando) return;
    const valor = parseValor(form.valor);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.data)) return setErro("Informe a data.");
    if (!form.descricao.trim()) return setErro("Informe a descrição.");
    if (!Number.isFinite(valor) || valor < 0.01) return setErro("Informe um valor maior que zero.");
    const linha: LinhaEditada = { data: form.data, descricao: form.descricao.trim().slice(0, 200), valor: form.credito ? valor : -valor };
    if (editando === "nova") mudar({ incluir: [...aj.incluir, linha] });
    else if (editando.startsWith("n")) mudar({ incluir: aj.incluir.map((l, k) => (k === indice(editando) ? linha : l)) });
    else {
      const i = indice(editando);
      const original = linhas[i];
      const igual = original.data === linha.data && original.descricao === linha.descricao && Math.abs(original.valor - linha.valor) < 0.005;
      mudar({ alterar: [...aj.alterar.filter((a) => a.i !== i), ...(igual ? [] : [{ ...linha, i }])] });
    }
    fechar();
  };

  const remover = (t: LinhaTela) => {
    if (t.chave.startsWith("n")) mudar({ incluir: aj.incluir.filter((_, k) => k !== indice(t.chave)) });
    else mudar({ excluir: [...aj.excluir, indice(t.chave)] });
  };
  const desfazer = (t: LinhaTela) => {
    const i = indice(t.chave);
    if (t.estado === "excluida") mudar({ excluir: aj.excluir.filter((x) => x !== i) });
    else mudar({ alterar: aj.alterar.filter((a) => a.i !== i) });
  };

  const formulario = form && (
    <div className="space-y-2" data-editando-linha>
      {/* celular: data e valor lado a lado, descrição embaixo; tela larga: tudo numa linha */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[9.5rem_1fr_7rem]">
        <input type="date" aria-label="Data" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })}
          className="text-sm min-w-0 sm:order-1" />
        <input aria-label="Descrição" value={form.descricao} maxLength={200} onChange={(e) => setForm({ ...form, descricao: e.target.value })}
          className="text-sm min-w-0 col-span-2 order-last sm:order-2 sm:col-span-1" placeholder="Descrição" />
        <input aria-label="Valor" inputMode="decimal" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })}
          className="text-sm min-w-0 sm:order-3" placeholder="0,00" />
      </div>
      {erro && <p className="text-xs text-red-600" role="alert">{erro}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <select aria-label="Tipo" value={form.credito ? "credito" : "gasto"} onChange={(e) => setForm({ ...form, credito: e.target.value === "credito" })}
          className="text-sm">
          <option value="gasto">Saída (gasto)</option>
          <option value="credito">Entrada (crédito)</option>
        </select>
        <div className="flex gap-2 ml-auto">
          <button type="button" className="btn btn-secondary text-xs py-1 whitespace-nowrap" onClick={fechar}>Cancelar</button>
          <button type="button" className="btn btn-primary text-xs py-1 whitespace-nowrap" onClick={salvar}>Salvar linha</button>
        </div>
      </div>
    </div>
  );

  const resumoAjustes = [
    aj.alterar.length && plural(aj.alterar.length, "corrigida"),
    aj.excluir.length && plural(aj.excluir.length, "excluída"),
    aj.incluir.length && plural(aj.incluir.length, "incluída"),
  ].filter(Boolean).join(", ");

  return (
    <div className="space-y-2" data-leitura-pdf>
      <div className="text-xs text-slate-500">
        <span className="font-medium text-slate-700">{plural(finais.length, "lançamento")}</span>
        {" "}· {fmt(gastos)} em gastos{creditos > 0 && ` · ${fmt(creditos)} em créditos`}
        {temAjustes(aj) && <span className="text-blue-700"> · revisado: {resumoAjustes}</span>}
      </div>
      {conferenciaAtual && <AvisoConferencia conferencia={conferenciaAtual} />}
      {/* lista, não tabela: no celular a tabela global rola de lado e o valor some da tela */}
      <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
        <ul className="divide-y divide-slate-100">
          {visiveis.map((t) => (
            <li key={t.chave} className={`px-3 py-1.5 ${t.estado === "excluida" ? "bg-slate-50" : ""}`} data-linha={t.estado}>
              {editando === t.chave ? formulario : (
                <div className="flex items-start justify-between gap-3">
                  <div className={`min-w-0 sm:flex sm:gap-3 ${t.estado === "excluida" ? "line-through text-slate-400" : ""}`}>
                    <span className="block shrink-0 text-slate-400 whitespace-nowrap sm:w-20">{fmtData(t.linha.data)}</span>
                    <span className={`break-words ${t.estado === "excluida" ? "" : "text-slate-700"}`}>
                      {t.linha.descricao}
                      {t.estado === "corrigida" && <span className="ml-1.5 badge bg-blue-50 text-blue-700">corrigida</span>}
                      {t.estado === "incluida" && <span className="ml-1.5 badge bg-green-50 text-green-700">incluída</span>}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`whitespace-nowrap font-medium ${t.estado === "excluida" ? "line-through text-slate-400" : t.linha.valor < 0 ? "text-red-600" : "text-green-600"}`}>
                      {fmt(t.linha.valor)}
                    </span>
                    {revisavel && (t.estado === "excluida" || t.estado === "corrigida") && (
                      <button type="button" onClick={() => desfazer(t)} aria-label="Desfazer" title="Desfazer" className="text-slate-400 hover:text-blue-700">
                        <Undo2 size={14} />
                      </button>
                    )}
                    {revisavel && t.estado !== "excluida" && (
                      <>
                        <button type="button" onClick={() => abrir(t.chave, t.linha)} aria-label="Corrigir linha" title="Corrigir" className="text-slate-400 hover:text-blue-700">
                          <Pencil size={14} />
                        </button>
                        <button type="button" onClick={() => remover(t)} aria-label="Excluir linha" title="Excluir" className="text-slate-400 hover:text-red-600">
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
          {editando === "nova" && <li className="px-3 py-2">{formulario}</li>}
        </ul>
        {(linhas.length > MOSTRAR || revisavel) && (
          <div className="flex justify-between gap-3 flex-wrap px-3 py-1.5 bg-slate-50">
            {linhas.length > MOSTRAR ? (
              <button type="button" onClick={() => setTodas((v) => !v)} className="text-blue-700 hover:text-blue-900">
                {todas ? "Mostrar só as primeiras" : `Ver todas as ${telas.length} linhas`}
              </button>
            ) : <span />}
            {revisavel && editando !== "nova" && (
              <button type="button" className="text-blue-700 hover:text-blue-900"
                onClick={() => abrir("nova", { data: linhas.at(-1)?.data ?? new Date().toISOString().slice(0, 10), descricao: "", valor: 0 })}>
                + Incluir lançamento que faltou
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
