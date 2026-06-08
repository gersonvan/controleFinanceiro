import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export interface ResumoPessoa {
  pessoa: string;
  totalEmprestado: number;
  totalRecebido: number;
  saldo: number;
  status: "aberto" | "parcial" | "quitado";
  lancamentos: {
    id: number;
    data: string;
    descricao: string;
    valor: number;
    categoria: string;
    conta: string;
  }[];
}

export async function GET() {
  const lancamentos = await prisma.lancamento.findMany({
    where: {
      categoria: { in: ["Empréstimo", "Recebimento de Empréstimo"] },
    },
    orderBy: { data: "desc" },
  });

  // Agrupa por pessoa (usa pessoa se preenchida, senão tenta extrair da descrição)
  const porPessoa = new Map<string, typeof lancamentos>();

  for (const l of lancamentos) {
    const chave = (l.pessoa?.trim() || "Pessoa não identificada").toLowerCase()
      .split(" ")
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ");

    if (!porPessoa.has(chave)) porPessoa.set(chave, []);
    porPessoa.get(chave)!.push(l);
  }

  const resumo: ResumoPessoa[] = [];

  for (const [pessoa, items] of porPessoa.entries()) {
    const totalEmprestado = items
      .filter((l) => l.categoria === "Empréstimo")
      .reduce((acc, l) => acc + Math.abs(l.valor), 0);

    const totalRecebido = items
      .filter((l) => l.categoria === "Recebimento de Empréstimo")
      .reduce((acc, l) => acc + Math.abs(l.valor), 0);

    const saldo = totalEmprestado - totalRecebido;

    let status: ResumoPessoa["status"] = "aberto";
    if (saldo <= 0) status = "quitado";
    else if (totalRecebido > 0) status = "parcial";

    resumo.push({
      pessoa,
      totalEmprestado,
      totalRecebido,
      saldo,
      status,
      lancamentos: items.map((l) => ({
        id: l.id,
        data: l.data.toISOString(),
        descricao: l.descricao,
        valor: l.valor,
        categoria: l.categoria ?? "",
        conta: l.conta,
      })),
    });
  }

  // Ordenação: abertos primeiro, depois parcial, depois quitados; dentro de cada grupo, maior saldo primeiro
  const ordem = { aberto: 0, parcial: 1, quitado: 2 };
  resumo.sort((a, b) =>
    ordem[a.status] !== ordem[b.status]
      ? ordem[a.status] - ordem[b.status]
      : b.saldo - a.saldo
  );

  return NextResponse.json(resumo);
}
