"use client";
// Cabeçalho das páginas de /financas: voltar ao Dashboard e trocar de mês.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { mesLongo } from "./comum";

/** ano/mes da URL; padrão = mês corrente. */
export function usePeriodoDaUrl() {
  const params = useSearchParams();
  const hoje = new Date();
  const ano = Number(params.get("ano")) || hoje.getFullYear();
  const mesUrl = Number(params.get("mes"));
  const mes = mesUrl >= 1 && mesUrl <= 12 ? mesUrl : hoje.getMonth() + 1;
  return { ano, mes };
}

export default function NavegadorMes({ ano, mes, titulo, descricao }: { ano: number; mes: number; titulo: string; descricao: string }) {
  const router = useRouter();
  const ir = (delta: number) => {
    const d = new Date(Date.UTC(ano, mes - 1 + delta, 1));
    router.replace(`?ano=${d.getUTCFullYear()}&mes=${d.getUTCMonth() + 1}`, { scroll: false });
  };
  const hoje = new Date();
  const ehAtual = ano === hoje.getFullYear() && mes === hoje.getMonth() + 1;
  const chave = `${ano}-${String(mes).padStart(2, "0")}`;

  return (
    <div className="space-y-2">
      <Link href="/" className="text-sm text-blue-600 hover:underline">← Dashboard</Link>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-slate-800">{titulo}</h1>
        <div className="flex items-center gap-1">
          <button type="button" className="btn btn-secondary px-3" onClick={() => ir(-1)} aria-label="Mês anterior">‹</button>
          <span className="text-sm font-medium text-slate-700 w-32 text-center capitalize">{mesLongo(chave)} {ano}</span>
          <button type="button" className="btn btn-secondary px-3" onClick={() => ir(1)} disabled={ehAtual} aria-label="Próximo mês">›</button>
        </div>
      </div>
      <p className="text-sm text-slate-500 max-w-3xl">{descricao}</p>
    </div>
  );
}
