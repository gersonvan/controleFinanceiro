// Saldo final do extrato de conta corrente, quando o arquivo traz: C6 ("Saldo do
// Dia(R$)"), Bradesco ("Saldo (R$)") e BB (linhas "Saldo do dia"/"S A L D O").
// Serve para a Reserva mostrar quanto há em cada conta sem digitar.
import { parseCSV } from "./tipos";

export interface SaldoExtrato { saldo: number; data: Date }

const DATA = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const paraData = (s: string): Date | null => {
  const m = s.trim().match(DATA);
  return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])) : null;
};
/** "1.845,25" / "-301.91" / "0,00" → número (vírgula decimal ou ponto decimal). */
const paraNumero = (s: string): number | null => {
  const t = s.trim().replace(/\s/g, "");
  if (!t || !/\d/.test(t)) return null;
  const n = t.includes(",") ? parseFloat(t.replace(/\./g, "").replace(",", ".")) : parseFloat(t);
  return Number.isFinite(n) ? n : null;
};
const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function extrairSaldoFinal(texto: string): SaldoExtrato | null {
  const linhas = texto.replace(/^﻿/, "").split(/\r?\n/);
  const cabecalho = linhas.findIndex((l) => /saldo/i.test(l) && /data/i.test(l));

  // C6: "Data Lançamento,Data Contábil,Título,Descrição,Entrada(R$),Saída(R$),Saldo do Dia(R$)"
  if (cabecalho >= 0 && /saldo do dia/i.test(linhas[cabecalho]) && /t[ií]tulo/i.test(linhas[cabecalho])) {
    const rows = parseCSV(linhas.slice(cabecalho + 1).join("\n"), ",");
    let ultimo: SaldoExtrato | null = null;
    for (const r of rows) {
      const data = paraData(r[0] ?? ""), saldo = paraNumero(r[6] ?? "");
      if (data && saldo !== null && (!ultimo || data >= ultimo.data)) ultimo = { saldo, data };
    }
    return ultimo;
  }

  // Bradesco: "Data;Histórico;Docto.;Crédito (R$);Débito (R$);Saldo (R$)" — vale a última linha com data e saldo
  if (cabecalho >= 0 && linhas[cabecalho].includes(";") && /saldo \(r\$\)/i.test(linhas[cabecalho])) {
    let ultimo: SaldoExtrato | null = null;
    for (const l of linhas) {
      const c = l.split(";");
      const data = paraData(c[0] ?? ""), saldo = paraNumero(c[5] ?? "");
      if (data && saldo !== null && (!ultimo || data >= ultimo.data)) ultimo = { saldo, data };
    }
    return ultimo;
  }

  // BB: linhas "Saldo do dia" / "S A L D O" (o último é o saldo mais recente)
  if (linhas.some((l) => /"saldo do dia"|"s a l d o"/i.test(l))) {
    const rows = parseCSV(texto.replace(/^﻿/, ""), ",");
    let ultimo: SaldoExtrato | null = null;
    for (const r of rows) {
      const desc = normalizar(r[1] ?? "").replace(/\s/g, "");
      if (desc !== "saldododia" && desc !== "saldo") continue;
      const data = paraData(r[0] ?? ""), saldo = paraNumero(r[4] ?? "");
      if (data && saldo !== null && (!ultimo || data >= ultimo.data)) ultimo = { saldo, data };
    }
    return ultimo;
  }
  return null;
}
