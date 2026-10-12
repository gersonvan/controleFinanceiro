"use client";
// O que foi lido de um PDF, para o usuário conferir antes de importar: as linhas,
// a soma e — quando a fatura traz um resumo conhecido — se a soma bate com ele
// (lib/importacao/conferencia.ts). Leitor nenhum fica à prova de mudança de layout;
// é aqui que o usuário percebe quando o do banco mudou.
import { useState } from "react";
import type { ConferenciaFatura } from "@/lib/importacao/conferencia";

export interface LinhaLida { data: string; descricao: string; valor: number }

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const MOSTRAR = 10;

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
      confira as linhas antes de importar. O que faltar dá para lançar à mão em Lançamentos.
    </div>
  );
}

export default function LeituraPDF({ linhas, conferencia }: { linhas: LinhaLida[]; conferencia: ConferenciaFatura | null }) {
  const [todas, setTodas] = useState(false);
  const gastos = -linhas.filter((l) => l.valor < 0).reduce((a, l) => a + l.valor, 0);
  const creditos = linhas.filter((l) => l.valor > 0).reduce((a, l) => a + l.valor, 0);
  const visiveis = todas ? linhas : linhas.slice(0, MOSTRAR);

  return (
    <div className="space-y-2" data-leitura-pdf>
      <div className="text-xs text-slate-500">
        <span className="font-medium text-slate-700">{linhas.length} lançamento{linhas.length !== 1 ? "s" : ""}</span>
        {" "}· {fmt(gastos)} em gastos{creditos > 0 && ` · ${fmt(creditos)} em créditos`}
      </div>
      {conferencia && <AvisoConferencia conferencia={conferencia} />}
      {/* lista, não tabela: no celular a tabela global rola de lado e o valor some da tela */}
      <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
        <ul className="divide-y divide-slate-100">
          {visiveis.map((t, i) => (
            <li key={i} className="flex items-start justify-between gap-3 px-3 py-1.5">
              <div className="min-w-0 sm:flex sm:gap-3">
                <span className="block shrink-0 text-slate-400 whitespace-nowrap sm:w-20">{t.data}</span>
                <span className="text-slate-700 break-words">{t.descricao}</span>
              </div>
              <span className={`whitespace-nowrap font-medium ${t.valor < 0 ? "text-red-600" : "text-green-600"}`}>{fmt(t.valor)}</span>
            </li>
          ))}
        </ul>
        {linhas.length > MOSTRAR && (
          <button type="button" onClick={() => setTodas((v) => !v)}
            className="w-full px-3 py-1.5 text-left text-blue-700 hover:text-blue-900 bg-slate-50">
            {todas ? "Mostrar só as primeiras" : `Ver todas as ${linhas.length} linhas`}
          </button>
        )}
      </div>
    </div>
  );
}
