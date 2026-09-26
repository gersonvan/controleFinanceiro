import { describe, expect, it } from "vitest";
import { saldoEstimado, totaisReserva } from "./reserva";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const l = (data: string, valor: number, conta = "Sofisa", descricao = "Resgate Antecipado - CDB DIRETO DI", categoria = "Investimentos (Aportes)") =>
  ({ data: d(data), valor, conta, descricao, categoria });

describe("reserva", () => {
  const cdb = { saldoInformado: 37000, dataSaldo: d("2026-08-14"), conta: "Sofisa", filtroDescricao: null };

  it("soma aplicações e subtrai resgates só depois da data do saldo informado", () => {
    const r = saldoEstimado(cdb, [
      l("2026-08-14", 3000.94),                       // no dia do saldo: já está nele
      l("2026-09-10", 5000.5),                        // resgate depois
      l("2026-09-20", -2000, "Sofisa", "Aplicação - CDB DIRETO DI"),
      l("2026-09-21", 999, "C6 Débito"),              // outra conta
      l("2026-09-22", 50, "Sofisa", "Pix", "Transferência entre Contas"), // não é investimento
    ]);
    expect(r).toEqual({ saldo: 33999.5, aplicado: 2000, resgatado: 5000.5 });
  });

  it("filtro de descrição separa produtos na mesma conta (RDB no Nubank)", () => {
    const rdb = { saldoInformado: 68000, dataSaldo: d("2026-09-06"), conta: "Nubank Débito", filtroDescricao: "rdb" };
    const r = saldoEstimado(rdb, [
      l("2026-09-10", -1000, "Nubank Débito", "Aplicação RDB"),
      l("2026-09-11", -500, "Nubank Débito", "Compra de ações"),
    ]);
    expect(r.saldo).toBe(69000);
  });

  it("reserva sem conta (previdência) fica no saldo informado", () => {
    expect(saldoEstimado({ saldoInformado: 100554.17, dataSaldo: d("2026-08-31"), conta: null, filtroDescricao: null }, [l("2026-09-10", 10)]).saldo).toBe(100554.17);
  });

  it("conta corrente: todos os lançamentos da conta depois do saldo, entradas e saídas", () => {
    const c6 = { tipo: "conta", saldoInformado: -301.91, dataSaldo: d("2026-09-25"), conta: "C6 Débito", filtroDescricao: null };
    const r = saldoEstimado(c6, [
      l("2026-09-25", -28.37, "C6 Débito", "PADARIA", "Supermercado e Mercearia"), // já no saldo do dia
      l("2026-09-26", 12000, "C6 Débito", "Pix recebido", "Transferência Recebida"),
      l("2026-09-27", -3553.12, "C6 Débito", "HIS EMP IMOBILIARIOS", "Aluguel"),
      l("2026-09-27", -100, "Nubank Débito", "Outra conta", "Compras"),
    ]);
    expect(r).toEqual({ saldo: 8144.97, aplicado: 12000, resgatado: 3553.12 });
  });

  it("totais separam conta, disponível e bloqueado", () => {
    expect(totaisReserva([{ saldo: 68000, bloqueada: false }, { saldo: 37206.79, bloqueada: false }, { saldo: 100554.17, bloqueada: true },
      { saldo: -301.91, bloqueada: false, tipo: "conta" }, { saldo: 1845.25, bloqueada: false, tipo: "conta" }]))
      .toEqual({ emConta: 1543.34, disponivel: 105206.79, bloqueado: 100554.17, total: 205760.96, geral: 207304.3 });
  });
});
