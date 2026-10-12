"use client";
import { useCategorias } from "@/components/Categorias";

/**
 * <optgroup>s com as categorias do usuário por tema — usado em todos os seletores de
 * categoria. `atual`: valor já gravado que saiu da lista (oculta ou antiga) continua
 * aparecendo, para o seletor não fingir que está vazio.
 */
export default function OpcoesCategorias({ atual }: { atual?: string | null }) {
  const { grupos, validas } = useCategorias();
  return (
    <>
      {atual && !validas.has(atual) && <option value={atual}>{atual} (fora da sua lista)</option>}
      {grupos.map(({ grupo, categorias }) => (
        <optgroup key={grupo} label={grupo}>
          {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
        </optgroup>
      ))}
    </>
  );
}
