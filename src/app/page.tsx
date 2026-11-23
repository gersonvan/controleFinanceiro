"use client";
// Dashboard: começa pelo mês corrente. De cima para baixo: o resumo do período
// (saldo, entradas, saídas, guardado; no mês, as saídas contra o plano e onde o mês
// deve fechar), "Fique de olho" (só o que pede atenção), para onde foi o dinheiro,
// 50/30/20 e como você pagou (só no mês: são cálculos mensais) e o mês a mês.
import { useEffect, useState } from "react";
import Link from "next/link";
import { montarAvisos, projecaoDasSaidas, type DadosDashboard, type DesafioResumo } from "@/lib/dashboard";
import { buscar, mesLongo, type RespostaDivida, type RespostaMeios, type RespostaRitmo } from "@/components/financas/comum";
import { ComoVocePagou, RitmoDoMes } from "@/components/financas/CartoesDoMes";
import DivisaoDoMes, { type RespostaFatias } from "@/components/financas/DivisaoDoMes";
import ResumoDoPeriodo from "@/components/dashboard/ResumoDoPeriodo";
import FiqueDeOlho from "@/components/dashboard/FiqueDeOlho";
import ParaOndeFoi from "@/components/dashboard/ParaOndeFoi";
import UltimosMeses from "@/components/dashboard/UltimosMeses";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// guardados com o período a que pertencem: trocar de mês não mostra os do mês anterior
interface DoMes {
  periodo: string;
  meios: RespostaMeios | null;
  ritmo: RespostaRitmo | null;
  divida: RespostaDivida | null;
  fatias: RespostaFatias | null;
}
interface Desafios { economiaAcumulada: number; emCurso: DesafioResumo[]; sugestoes: { titulo: string; motivo: string }[] }
interface Plano { periodo: string; saidas: { planejado: number; realizado: number }; totalLancamentos: number; temFotografia: boolean }

async function json<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url);
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

export default function Dashboard() {
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth() + 1;
  const [ano, setAno] = useState(anoAtual);
  const [mes, setMes] = useState<number | "">(mesAtual);
  const [data, setData] = useState<DadosDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [doMesCarregado, setDoMes] = useState<DoMes | null>(null);
  const [planoCarregado, setPlano] = useState<Plano | null>(null);
  const [verRitmo, setVerRitmo] = useState(false);
  // null = ainda não sabemos; false = fotografia pendente; true = concluída
  const [fotografiaFeita, setFotografiaFeita] = useState<boolean | null>(null);
  const [reserva, setReserva] = useState<{ emConta: number; disponivel: number; bloqueado: number } | null>(null);
  const [desafios, setDesafios] = useState<Desafios | null>(null);

  // o que não depende do período
  useEffect(() => {
    let ativo = true;
    void json<{ fotografiaConcluidaEm: string | null }>("/api/planejamento").then((j) => { if (ativo && j) setFotografiaFeita(!!j.fotografiaConcluidaEm); });
    void json<{ reservas: unknown[]; totais: { emConta: number; disponivel: number; bloqueado: number } }>("/api/reservas")
      .then((j) => { if (ativo && j?.reservas?.length) setReserva(j.totais); });
    void json<Desafios>("/api/desafios").then((j) => { if (ativo && j) setDesafios(j); });
    return () => { ativo = false; };
  }, []);

  useEffect(() => {
    let ativo = true;
    const params = new URLSearchParams({ ano: String(ano) });
    if (mes !== "") params.set("mes", String(mes));
    void json<DadosDashboard>(`/api/dashboard?${params}`).then((j) => {
      if (!ativo) return;
      setData(j);
      setLoading(false);
    });
    return () => { ativo = false; };
  }, [ano, mes]);

  // cálculos mensais: só com um mês escolhido
  useEffect(() => {
    let ativo = true;
    if (mes === "") return;
    void Promise.all([
      buscar<RespostaMeios>("/api/financas/meios", ano, mes),
      buscar<RespostaRitmo>("/api/financas/ritmo", ano, mes),
      buscar<RespostaDivida>("/api/financas/divida", ano, mes),
      buscar<RespostaFatias>("/api/financas/fatias", ano, mes),
    ]).then(([meios, ritmo, divida, fatias]) => { if (ativo) setDoMes({ periodo: `${ano}-${mes}`, meios, ritmo, divida, fatias }); });
    return () => { ativo = false; };
  }, [ano, mes]);

  useEffect(() => {
    let ativo = true;
    if (mes === "" || fotografiaFeita !== true) return;
    void json<Plano>(`/api/planejamento/realizado?ano=${ano}&mes=${mes}`).then((j) => { if (ativo && j?.temFotografia) setPlano({ ...j, periodo: `${ano}-${mes}` }); });
    return () => { ativo = false; };
  }, [ano, mes, fotografiaFeita]);

  const periodo = `${ano}-${mes}`;
  const doMes = doMesCarregado?.periodo === periodo ? doMesCarregado : null;
  const plano = planoCarregado?.periodo === periodo ? planoCarregado : null;
  const anos = Array.from({ length: 5 }, (_, i) => anoAtual - i);
  const mesAberto = mes !== "";
  const mesCorrente = mesAberto && ano === anoAtual && mes === mesAtual;
  const chave = mesAberto ? `${ano}-${String(mes).padStart(2, "0")}` : null;
  const query = mesAberto ? `?ano=${ano}&mes=${mes}` : `?ano=${ano}`;
  const diasNoMes = mesAberto ? new Date(ano, mes, 0).getDate() : 0;
  const nomeMes = chave ? mesLongo(chave) : "";

  const subtitulo = !mesAberto ? `${ano}, o ano todo` : `${MESES[mes - 1]} de ${ano}${mesCorrente ? ` · hoje é dia ${hoje.getDate()} de ${diasNoMes}` : ""}`;
  const avisos = montarAvisos({
    mesLongo: mesAberto ? nomeMes : null, query,
    divida: doMes?.divida ?? null, semFatia: doMes?.fatias?.semFatia.valor ?? null,
    reserva, desafios,
  });
  const vazio = data && data.porCategoria.length === 0 && data.totalEntradas === 0 && data.totalSaidas === 0;
  const ritmo = doMes?.ritmo ?? null;

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5" data-periodo>{subtitulo}</p>
        </div>
        <div className="flex gap-2">
          <select aria-label="Mês" value={mes} onChange={(e) => { setMes(e.target.value === "" ? "" : parseInt(e.target.value)); setVerRitmo(false); }}>
            {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            <option value="">Ano todo</option>
          </select>
          <select aria-label="Ano" value={ano} onChange={(e) => { setAno(parseInt(e.target.value)); setVerRitmo(false); }}>
            {anos.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="spinner" /></div>
      ) : !data ? (
        <p className="card text-sm text-red-700 bg-red-50 border-red-200" role="alert">Não foi possível carregar o Dashboard. Recarregue a página.</p>
      ) : vazio ? (
        <>
          <FiqueDeOlho avisos={avisos} />
          <div className="card text-center py-14 space-y-4">
            <div className="text-4xl" aria-hidden>📂</div>
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Nenhum lançamento em {mesAberto ? `${nomeMes} de ${ano}` : ano}</h2>
              <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                O Dashboard ganha vida com seus lançamentos. Importe o extrato do banco ou comece registrando à mão.
              </p>
            </div>
            <div className="flex justify-center gap-3 flex-wrap">
              <Link href="/importar" className="btn btn-primary">Importar extrato</Link>
              <Link href="/lancamentos?novo=1" className="btn btn-secondary">Lançar à mão</Link>
            </div>
          </div>
        </>
      ) : (
        <>
          <ResumoDoPeriodo
            titulo={mesAberto ? `${nomeMes}${mesCorrente ? " até agora" : ""}` : String(ano)}
            dados={data} mesAberto={mesAberto}
            progressoDoMes={mesCorrente ? hoje.getDate() / diasNoMes : null}
            diaDeHoje={mesCorrente ? `dia ${hoje.getDate()}` : null}
            plano={plano ? { ...plano.saidas, totalLancamentos: plano.totalLancamentos } : null}
            fotografiaFeita={fotografiaFeita}
            projecao={plano && mesCorrente ? projecaoDasSaidas(plano.saidas.realizado, ritmo) : null}
            ritmoAberto={verRitmo}
            onRitmo={ritmo && chave ? () => setVerRitmo((v) => !v) : null} />
          {verRitmo && ritmo && chave && <RitmoDoMes dados={ritmo} chave={chave} />}

          <FiqueDeOlho avisos={avisos} />

          <div className={`grid grid-cols-1 ${mesAberto ? "lg:grid-cols-2" : ""} gap-5 items-start`}>
            <ParaOndeFoi periodo={mesAberto ? nomeMes : String(ano)} porCategoria={data.porCategoria} porConta={data.porConta} total={data.totalSaidas} />
            {mesAberto && (
              <div className="flex flex-col gap-5">
                {doMes?.fatias && <DivisaoDoMes dados={doMes.fatias} />}
                {doMes?.meios && <ComoVocePagou dados={doMes.meios} divida={doMes.divida} query={query} />}
              </div>
            )}
          </div>

          <UltimosMeses titulo={mesAberto ? "Últimos 6 meses" : `Mês a mês em ${ano}`} meses={data.porMes}
            emAndamento={ano === anoAtual ? `${anoAtual}-${String(mesAtual).padStart(2, "0")}` : null} />
        </>
      )}
    </div>
  );
}
