import { describe, expect, it } from "vitest";
import {
  categoriaLivre, destinosPossiveis, montarCatalogo, podeOcultar, problemaNoNome, resolverCategoria, type LinhaCategoriaUsuario,
} from "./catalogo-categorias";
import { CATEGORIAS, CATEGORIAS_DO_SISTEMA, categorizarComOrigem } from "./categorias";

const oculta = (nome: string, destino: string | null): LinhaCategoriaUsuario => ({ nome, nativa: true, grupo: null, destino });
const sua = (nome: string, grupo: string): LinhaCategoriaUsuario => ({ nome, nativa: false, grupo, destino: null });

describe("catálogo de categorias do usuário", () => {
  it("sem nada salvo, é a lista nativa", () => {
    const c = montarCatalogo([]);
    expect(c.validas.size).toBe(CATEGORIAS.length);
    expect(c.ocultas.size).toBe(0);
  });

  it("tira as nativas ocultas, põe as personalizadas no grupo escolhido e nunca oculta as do sistema", () => {
    const c = montarCatalogo([oculta("Pets", "Cachorro"), oculta("Estorno", null), sua("Cachorro", "Pessoal e Lazer"), sua("Bico", "Entradas")]);
    expect(c.validas.has("Pets")).toBe(false);
    expect(c.validas.has("Estorno")).toBe(true); // do sistema: a linha é ignorada
    expect(c.grupos.find((g) => g.grupo === "Pessoal e Lazer")?.categorias).toContain("Cachorro");
    expect(c.entradas.has("Bico")).toBe(true);
    expect(c.ocultas).toEqual(new Map([["Pets", "Cachorro"]]));
    expect(podeOcultar("Pets")).toBe(true);
    expect([...CATEGORIAS_DO_SISTEMA].some(podeOcultar)).toBe(false);
  });

  it("destino só do mesmo lado (entrada × saída), sem a própria e sem as ocultas", () => {
    const c = montarCatalogo([oculta("Pets", null), sua("Bico", "Entradas")]);
    const deSaida = destinosPossiveis(c, "Farmácia");
    expect(deSaida).toContain("Compras");
    expect(deSaida).not.toContain("Farmácia");
    expect(deSaida).not.toContain("Pets");
    expect(deSaida).not.toContain("Salário");
    expect(destinosPossiveis(c, "Bico")).toContain("Salário");
    expect(destinosPossiveis(c, "Bico")).not.toContain("Compras");
  });

  it("nome novo: não repete nativa (nem sem acento) nem outra sua; oculta pede para mostrar de novo", () => {
    const c = montarCatalogo([oculta("Pets", null), sua("Cachorro", "Pessoal e Lazer")]);
    expect(problemaNoNome("farmacia", c)).toMatch(/do app/);
    expect(problemaNoNome("PETS", c)).toMatch(/oculta/);
    expect(problemaNoNome("cachorro", c)).toMatch(/já tem/);
    expect(problemaNoNome("Cachorro", c, "Cachorro")).toBeNull(); // renomear para o mesmo nome
    expect(problemaNoNome("x", c)).toMatch(/2 a 40/);
    expect(problemaNoNome("Igreja <script>", c)).toMatch(/Use só/);
    expect(problemaNoNome("Escola das crianças", c)).toBeNull();
  });

  it("a Fotografia sempre acha uma categoria: oculta vai para o destino ou para outra do mesmo lado", () => {
    const c = montarCatalogo([oculta("Compras", "Presentes"), oculta("Contas de Consumo", null)]);
    expect(resolverCategoria(c, "Compras")).toBe("Presentes");
    expect(resolverCategoria(c, "Contas de Consumo")).toBeNull();
    expect(categoriaLivre(c, "variavel")).toBe("Presentes");
    expect(c.validas.has(categoriaLivre(c, "fixo"))).toBe(true);
    expect(c.entradas.has(categoriaLivre(c, "fixo"))).toBe(false);
  });

  it("regra que daria uma categoria oculta dá o destino escolhido (ou nenhuma)", () => {
    const fonte = (destino: string | null) => ({ memoria: new Map<string, string>(), ocultas: new Map([["Farmácia", destino]]) });
    expect(categorizarComOrigem("DROGASIL 2460", "", "Saída", fonte("Compras"))).toEqual({ categoria: "Compras", origem: "regra" });
    expect(categorizarComOrigem("DROGASIL 2460", "", "Saída", fonte(null))).toEqual({ categoria: "", origem: null });
    expect(categorizarComOrigem("DROGASIL 2460", "", "Saída", { memoria: new Map() })).toMatchObject({ categoria: "Farmácia" });
  });
});
