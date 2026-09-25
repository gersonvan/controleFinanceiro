import { GRUPOS_CATEGORIAS } from "@/lib/categorias";

/** <optgroup>s com as categorias por tema — usado em todos os seletores de categoria. */
export default function OpcoesCategorias() {
  return (
    <>
      {GRUPOS_CATEGORIAS.map(({ grupo, categorias }) => (
        <optgroup key={grupo} label={grupo}>
          {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
        </optgroup>
      ))}
    </>
  );
}
