// O titular do documento não bate com o nome do usuário (lib/importacao/titular.ts).
export default function AvisoOutraPessoa({ nome, compacto = false }: { nome: string | null; compacto?: boolean }) {
  return (
    <div className={`rounded-lg border border-amber-300 bg-amber-50 text-amber-900 ${compacto ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm"}`}
      role="alert" data-outra-pessoa>
      ⚠️ {nome ? <>Este documento parece ser de <strong>{nome}</strong>.</> : "Não achamos o seu nome neste documento."}{" "}
      Se não for seu, troque o arquivo — o que for importado entra na sua conta.
    </div>
  );
}
