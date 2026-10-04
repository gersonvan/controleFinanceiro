import ContasPorBanco from "@/components/ContasPorBanco";

export default function ContasPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Contas</h1>
        <p className="text-sm text-slate-500 mt-1">
          Cada conta é um banco + Débito ou Crédito. Extratos e faturas de qualquer formato (OFX, PDF, CSV) caem sempre
          na conta certa. Crédito conta no mês da fatura; no Débito, cada saída vira Pix, boleto, débito ou encargos.
        </p>
      </div>
      <ContasPorBanco />
    </div>
  );
}
