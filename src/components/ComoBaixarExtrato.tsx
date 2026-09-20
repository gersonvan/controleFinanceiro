// Instruções curtas de onde tirar os arquivos que o importador aceita.
// Usado no onboarding (passo dos bancos) e na tela de importação.
export default function ComoBaixarExtrato() {
  return (
    <details className="text-sm text-slate-600 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <summary className="cursor-pointer font-medium text-slate-700">Como baixar o extrato do meu banco?</summary>
      <div className="mt-3 space-y-3">
        <div>
          <div className="font-medium text-slate-700">Conta corrente → arquivo OFX</div>
          <p className="mt-0.5">
            No internet banking (site do banco), abra o extrato, escolha o período e procure
            <span className="font-medium"> Exportar</span>, <span className="font-medium">Salvar como</span> ou
            <span className="font-medium"> Baixar</span> → formato <span className="font-medium">OFX</span>
            (às vezes aparece como &quot;Money&quot; ou &quot;Quicken&quot;). No app do Nubank:
            Extrato → Exportar → OFX.
          </p>
        </div>
        <div>
          <div className="font-medium text-slate-700">Cartão de crédito → fatura em PDF</div>
          <p className="mt-0.5">
            No app do cartão, abra a fatura do mês e use <span className="font-medium">Baixar PDF</span> ou
            <span className="font-medium"> Compartilhar</span>. Precisa ser o PDF original do banco, não uma foto ou digitalização.
          </p>
        </div>
        <div>
          <div className="font-medium text-slate-700">Planilha (CSV)</div>
          <p className="mt-0.5">
            Se o banco só oferece CSV ou Excel, tudo bem: na importação você indica qual coluna é a data, a descrição e o valor.
          </p>
        </div>
        <p className="text-slate-500">
          Sem arquivo à mão? Dá para começar lançando à mão em <span className="font-medium">Lançamentos → Novo</span>.
        </p>
      </div>
    </details>
  );
}
