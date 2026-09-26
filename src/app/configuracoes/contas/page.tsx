import ContasTipo from "@/components/ContasTipo";

export default function ContasPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Contas</h1>
        <p className="text-sm text-slate-500 mt-1">
          O tipo de cada conta separa crédito de débito nos painéis e decide em que mês os gastos entram.
        </p>
      </div>
      <ContasTipo />
    </div>
  );
}
