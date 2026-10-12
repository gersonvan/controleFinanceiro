"use client";
// As categorias das finanças abertas (lib/catalogo-categorias.ts), carregadas no
// layout: os seletores mostram as nativas que o usuário não ocultou e as que ele
// criou. Fora do layout (onboarding), vale a lista nativa.
import { createContext, useContext, useMemo } from "react";
import { CATALOGO_PADRAO, montarCatalogo, type Catalogo, type LinhaCategoriaUsuario } from "@/lib/catalogo-categorias";

const CategoriasContexto = createContext<Catalogo>(CATALOGO_PADRAO);
export const useCategorias = () => useContext(CategoriasContexto);

export function CategoriasProvider({ linhas, children }: { linhas: LinhaCategoriaUsuario[]; children: React.ReactNode }) {
  const catalogo = useMemo(() => montarCatalogo(linhas), [linhas]);
  return <CategoriasContexto.Provider value={catalogo}>{children}</CategoriasContexto.Provider>;
}
