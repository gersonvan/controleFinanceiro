"use client";
// Desafios: metas curtas para gastar menos e sair do vermelho. O app sugere
// pelas regras de src/lib/desafios.ts, mede nos lançamentos e soma a economia.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDia = (d: string) => new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" });
const numero = (s: string) => { const n = parseFloat(s.replace(/\./g, "").replace(",", ".")); return isNaN(n) ? NaN : n; };
const DIA = 86_400_000;

const NIVEIS: Record<number, string> = { 1: "Consciência", 2: "Sair do vermelho", 3: "Ajustes", 4: "Estrutural" };
const COR_NIVEL: Record<number, string> = { 2: "bg-rose-50 text-rose-700", 3: "bg-amber-50 text-amber-700" };

type Medida = "gasto" | "encargos" | "sobra";
interface DesafioVisto {
  id: number; modelo: string; categoria: string | null; meta: number; referencia: number;
  inicio: string; fim: string; status: string; estado: string; resultado: number | null; economia: number | null;
  parcial: boolean; pendentes: { conta: string; ate: string }[];
  titulo: string; nivel: number; medida: Medida;
  maisFacil: { meta: number; titulo: string } | null;
}
interface Sugestao {
  modelo: string; categoria: string | null; meta: number; referencia: number; nivel: number;
  titulo: string; motivo: string; potencial: number; inicio: string; fim: string;
}
interface ItemCatalogo {
  id: string; nivel: number; medida: Medida; duracao: "semana" | "mes"; nome: string; descricao: string;
  inicio: string; fim: string; referencia: number | null;
}
interface Dados {
  hoje: string; limite: number; vagas: number; economiaAcumulada: number;
  emCurso: DesafioVisto[]; fechados: DesafioVisto[]; sugestoes: Sugestao[];
  catalogo: ItemCatalogo[]; opcoesTeto: { categoria: string; media: number; meta: number }[];
  semHistorico: boolean; semCategoria: number;
}

const periodo = (inicio: string, fim: string) => `${fmtDia(inicio)} a ${fmtDia(fim)}`;

function Nivel({ nivel }: { nivel: number }) {
  return (
    <span className={`badge ${COR_NIVEL[nivel] ?? "bg-slate-100 text-slate-600"}`}>
      Nível {nivel} · {NIVEIS[nivel]}
    </span>
  );
}

function Barra({ fracao, estourou }: { fracao: number; estourou: boolean }) {
  return (
    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-2 rounded-full ${estourou ? "bg-red-500" : "bg-emerald-500"}`}
        style={{ width: `${Math.min(Math.max(fracao, 0), 1) * 100}%` }} />
    </div>
  );
}

/** Andamento: quanto já foi (parcial) contra a meta e contra o tempo que passou. */
function Andamento({ d, hoje }: { d: DesafioVisto; hoje: string }) {
  const r = d.resultado ?? 0;
  if (d.medida === "sobra") {
    return (
      <p className="text-sm text-slate-600">
        Até agora o mês está {r >= 0 ? "com sobra de" : "no vermelho em"}{" "}
        <span className={r >= 0 ? "valor-positivo" : "valor-negativo"}>{fmt(Math.abs(r))}</span>
        {d.meta !== 0 && <> · meta {d.meta > 0 ? `sobrar ${fmt(d.meta)}` : `no máximo ${fmt(-d.meta)} no vermelho`}</>}.
      </p>
    );
  }
  const total = new Date(d.fim).getTime() - new Date(d.inicio).getTime();
  const passou = (new Date(hoje).getTime() + DIA - new Date(d.inicio).getTime()) / total;
  const faltam = Math.max(Math.ceil((new Date(d.fim).getTime() - new Date(hoje).getTime()) / DIA) - 1, 0);
  const estourou = r > d.meta + 0.005;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-slate-600">
          {d.meta > 0 ? <>{fmt(r)} de {fmt(d.meta)}</> : r > 0 ? <>{fmt(r)} até agora</> : <>Nada até agora 👏</>}
        </span>
        <span className="text-slate-400">{faltam === 0 ? "último dia" : `faltam ${faltam} dia${faltam > 1 ? "s" : ""}`}</span>
      </div>
      {d.meta > 0 && <Barra fracao={r / d.meta} estourou={estourou} />}
      <p className="text-xs text-slate-400">
        {d.referencia > 0 && <>Seu normal no período: {fmt(d.referencia)}. </>}
        {Math.round(passou * 100)}% do período. Parcial: compras no cartão entram quando a fatura for importada.
      </p>
    </div>
  );
}

export default function DesafiosPage() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [tetoCategoria, setTetoCategoria] = useState("");
  const [tetoMeta, setTetoMeta] = useState("");

  const carregar = useCallback(async () => {
    const r = await fetch("/api/desafios");
    if (r.ok) setDados(await r.json());
  }, []);

  useEffect(() => {
    let ativo = true;
    fetch("/api/desafios")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Dados | null) => { if (ativo) setDados(d); });
    return () => { ativo = false; };
  }, []);

  const aceitar = async (corpo: { modelo: string; categoria?: string | null; meta?: number }) => {
    setErro(""); setEnviando(true);
    try {
      const r = await fetch("/api/desafios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      if (!r.ok) { setErro((await r.json().catch(() => null))?.error ?? "Não foi possível aceitar o desafio"); return; }
      setTetoCategoria(""); setTetoMeta("");
      await carregar();
    } finally { setEnviando(false); }
  };

  const agir = async (id: number, acao: "desistir" | "encerrar") => {
    if (acao === "desistir" && !confirm("Desistir deste desafio? Ele sai da lista — sem problema, dá para tentar outro.")) return;
    setErro(""); setEnviando(true);
    try {
      const r = await fetch("/api/desafios", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, acao }) });
      if (!r.ok) setErro((await r.json().catch(() => null))?.error ?? "Não foi possível concluir");
      await carregar();
    } finally { setEnviando(false); }
  };

  if (!dados) return <div className="flex justify-center py-20"><div className="spinner" /></div>;

  const semVaga = dados.vagas === 0;
  const fechadosComEconomia = dados.fechados.filter((d) => d.economia !== null).length;
  const porNivel = [2, 3].map((n) => ({ nivel: n, itens: dados.catalogo.filter((c) => c.nivel === n) }));
  const opcaoTeto = dados.opcoesTeto.find((o) => o.categoria === tetoCategoria);
  const metaTeto = numero(tetoMeta);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Desafios</h1>
        <p className="text-sm text-slate-500 mt-1">
          Metas curtas para gastar menos e sair do vermelho, medidas nos seus lançamentos. Até {dados.limite} ao mesmo tempo.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card">
          <div className="text-sm text-slate-500 mb-1">Economia acumulada</div>
          <div className="text-2xl font-bold text-emerald-700">{fmt(dados.economiaAcumulada)}</div>
          <div className="text-xs text-slate-400 mt-0.5">
            {fechadosComEconomia
              ? "quanto os desafios fechados ficaram abaixo do seu normal"
              : "aparece quando o primeiro desafio fechar"}
          </div>
        </div>
        <div className="card">
          <div className="text-sm text-slate-500 mb-1">Em andamento</div>
          <div className="text-2xl font-bold text-slate-800">{dados.limite - dados.vagas} de {dados.limite}</div>
          <div className="text-xs text-slate-400 mt-0.5">{semVaga ? "termine ou desista de um para aceitar outro" : `${dados.vagas} vaga${dados.vagas > 1 ? "s" : ""} livre${dados.vagas > 1 ? "s" : ""}`}</div>
        </div>
      </div>

      {dados.semCategoria > 0 && (
        <div className="card border-amber-200 bg-amber-50 text-sm text-amber-900 flex items-center justify-between gap-3 flex-wrap">
          <span>{dados.semCategoria} lançamento{dados.semCategoria > 1 ? "s" : ""} dos últimos meses sem categoria. Os desafios de categoria medem melhor com tudo categorizado.</span>
          <Link href="/lancamentos/revisar" className="btn btn-secondary text-sm">Revisar categorias</Link>
        </div>
      )}

      {erro && <div className="card border-red-200 bg-red-50 text-sm text-red-700" role="alert">{erro}</div>}

      {dados.emCurso.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-slate-700">Em andamento</h2>
          {dados.emCurso.map((d) => (
            <div key={d.id} className="card space-y-3" data-desafio={d.id}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-semibold text-slate-800">{d.titulo}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{periodo(d.inicio, d.fim)}</div>
                </div>
                <Nivel nivel={d.nivel} />
              </div>
              {d.estado === "agendado" && (
                <p className="text-sm text-slate-600">Começa em {fmtDia(d.inicio)}.</p>
              )}
              {d.estado === "andamento" && <Andamento d={d} hoje={dados.hoje} />}
              {d.estado === "aguardando" && (
                <div className="text-sm text-slate-600 space-y-2">
                  <p>
                    Terminou em {fmtDia(d.fim)}. Parcial: <span className="font-medium">{fmt(d.resultado ?? 0)}</span>{d.medida === "sobra" && " de sobra"}.
                    O resultado sai quando os extratos do período forem importados:
                  </p>
                  <ul className="list-disc pl-5 text-slate-500">
                    {d.pendentes.map((p) => <li key={p.conta}>{p.conta} — lançamentos até {fmtDia(p.ate)}</li>)}
                  </ul>
                  <div className="flex gap-2 flex-wrap">
                    <Link href="/importar" className="btn btn-primary text-sm">Importar extrato</Link>
                    <button className="btn btn-secondary text-sm" disabled={enviando} onClick={() => agir(d.id, "encerrar")}>
                      Encerrar com o que tenho
                    </button>
                  </div>
                </div>
              )}
              {d.estado !== "aguardando" && (
                <div className="flex justify-end">
                  <button className="text-xs text-slate-400 hover:text-red-600" disabled={enviando} onClick={() => agir(d.id, "desistir")}>
                    Desistir
                  </button>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold text-slate-700">Sugestões para você</h2>
        {dados.semHistorico ? (
          <p className="text-sm text-slate-500">
            Com pelo menos dois meses de lançamentos o app sugere desafios pelo seu histórico.{" "}
            <Link href="/importar" className="text-blue-600 hover:underline">Importar extratos</Link>
          </p>
        ) : dados.sugestoes.length === 0 ? (
          <p className="text-sm text-slate-500">Nada a sugerir agora — escolha no catálogo abaixo.</p>
        ) : (
          dados.sugestoes.map((s) => (
            <div key={`${s.modelo}-${s.categoria}`} className="card flex items-start justify-between gap-4 flex-wrap" data-sugestao={s.modelo}>
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-800">{s.titulo}</span>
                  <Nivel nivel={s.nivel} />
                </div>
                <p className="text-sm text-slate-600">{s.motivo}</p>
                <p className="text-xs text-slate-400">
                  {periodo(s.inicio, s.fim)}
                  {s.potencial > 0 && <> · economia esperada de {fmt(s.potencial)}</>}
                </p>
              </div>
              <button className="btn btn-primary text-sm" disabled={semVaga || enviando}
                onClick={() => aceitar({ modelo: s.modelo, categoria: s.categoria, meta: s.meta })}>
                Aceitar
              </button>
            </div>
          ))
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-slate-700">Catálogo</h2>
        {porNivel.map(({ nivel, itens }) => (
          <div key={nivel} className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Nível {nivel} · {NIVEIS[nivel]}</div>
            {itens.map((c) => (
              <div key={c.id} className="card space-y-3" data-catalogo={c.id}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="font-semibold text-slate-800">{c.nome}</div>
                    <p className="text-sm text-slate-600">{c.descricao}</p>
                    <p className="text-xs text-slate-400">
                      {periodo(c.inicio, c.fim)}
                      {c.referencia !== null && c.medida !== "sobra" && c.referencia > 0 && <> · seu normal: {fmt(c.referencia)}</>}
                      {c.referencia !== null && c.medida === "sobra" && c.referencia !== 0 && (
                        <> · seus meses costumam fechar {c.referencia >= 0 ? `com sobra de ${fmt(c.referencia)}` : `no vermelho em ${fmt(-c.referencia)}`}</>
                      )}
                    </p>
                  </div>
                  {c.id !== "teto-categoria" && (
                    <button className="btn btn-secondary text-sm" disabled={semVaga || enviando} onClick={() => aceitar({ modelo: c.id })}>
                      Aceitar
                    </button>
                  )}
                </div>
                {c.id === "teto-categoria" && (
                  <div className="flex items-end gap-2 flex-wrap">
                    <label className="text-sm text-slate-600 space-y-1">
                      <span className="block">Categoria</span>
                      <select value={tetoCategoria} aria-label="Categoria do teto"
                        onChange={(e) => {
                          setTetoCategoria(e.target.value);
                          const o = dados.opcoesTeto.find((x) => x.categoria === e.target.value);
                          setTetoMeta(o ? String(o.meta) : "");
                        }}>
                        <option value="">Escolha…</option>
                        {dados.opcoesTeto.map((o) => (
                          <option key={o.categoria} value={o.categoria}>{o.categoria} (média {fmt(o.media)})</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm text-slate-600 space-y-1">
                      <span className="block">Teto no mês (R$)</span>
                      <input value={tetoMeta} onChange={(e) => setTetoMeta(e.target.value)} inputMode="decimal"
                        aria-label="Teto no mês" className="w-32" placeholder="0" />
                    </label>
                    <button className="btn btn-secondary text-sm"
                      disabled={semVaga || enviando || !tetoCategoria || !(metaTeto >= 0)}
                      onClick={() => aceitar({ modelo: "teto-categoria", categoria: tetoCategoria, meta: metaTeto })}>
                      Aceitar
                    </button>
                    {opcaoTeto && metaTeto >= 0 && metaTeto < opcaoTeto.media && (
                      <span className="text-xs text-slate-400 w-full">
                        {fmt(opcaoTeto.media - metaTeto)} abaixo da sua média, se cumprir.
                      </span>
                    )}
                    {dados.opcoesTeto.length === 0 && (
                      <span className="text-xs text-slate-400 w-full">As categorias aparecem quando houver gastos categorizados.</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
        <p className="text-xs text-slate-400">
          Em breve: desafios de consciência (categorizar tudo, fazer a Fotografia, resumo da semana), desafios criados por você e
          os estruturais (quitar dívidas, renegociar contratos).
        </p>
      </section>

      {dados.fechados.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-slate-700">Resultados</h2>
          {dados.fechados.map((d) => {
            const cumprido = d.status === "cumprido";
            const r = d.resultado ?? 0;
            return (
              <div key={d.id} className="card space-y-2" data-resultado={d.id}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-semibold text-slate-800">{cumprido ? "✅" : "🔁"} {d.titulo}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {periodo(d.inicio, d.fim)}{d.parcial && " · fechado sem todos os extratos"}
                    </div>
                  </div>
                  {d.economia !== null && d.economia > 0 && (
                    <span className="badge bg-emerald-50 text-emerald-700">economia de {fmt(d.economia)}</span>
                  )}
                </div>
                <p className="text-sm text-slate-600">
                  {d.medida === "sobra"
                    ? <>O mês fechou {r >= 0 ? `com sobra de ${fmt(r)}` : `no vermelho em ${fmt(-r)}`}.</>
                    : d.meta > 0
                      ? <>{fmt(r)} de {fmt(d.meta)}{d.referencia > 0 && <> (seu normal: {fmt(d.referencia)})</>}.</>
                      : <>{r > 0 ? `${fmt(r)} no período` : "Nada no período"}{d.referencia > 0 && <> (seu normal: {fmt(d.referencia)})</>}.</>}
                  {cumprido ? " Desafio cumprido!" : " Não foi desta vez — sem problema."}
                </p>
                {!cumprido && d.maisFacil && (
                  <button className="btn btn-secondary text-sm" disabled={semVaga || enviando}
                    onClick={() => aceitar({ modelo: d.modelo, categoria: d.categoria, meta: d.maisFacil!.meta })}>
                    Tentar de novo: {d.maisFacil.titulo}
                  </button>
                )}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
