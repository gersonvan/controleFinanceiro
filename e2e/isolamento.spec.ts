// Autorização e isolamento entre contas, direto nas APIs.
import { expect, request, test } from "@playwright/test";
import { entrar, semente } from "./ajuda";

const ROTAS: [string, string][] = [
  ["GET", "/api/dashboard"], ["GET", "/api/resumo"], ["GET", "/api/matriz"], ["GET", "/api/previsao"],
  ["GET", "/api/lancamentos"], ["POST", "/api/lancamentos"], ["PATCH", "/api/lancamentos"], ["PUT", "/api/lancamentos"], ["DELETE", "/api/lancamentos?id=1"],
  ["GET", "/api/lancamentos/agrupados"], ["GET", "/api/contas"], ["PATCH", "/api/contas"],
  ["GET", "/api/reservas"], ["POST", "/api/reservas"], ["PATCH", "/api/reservas"], ["DELETE", "/api/reservas?id=1"],
  ["GET", "/api/planejamento"], ["PUT", "/api/planejamento"], ["GET", "/api/planejamento/realizado"], ["GET", "/api/planejamento/historico"],
  ["GET", "/api/apelidos"], ["POST", "/api/apelidos"], ["PATCH", "/api/apelidos"], ["DELETE", "/api/apelidos?nome=x"],
  ["GET", "/api/memoria-ia"], ["POST", "/api/memoria-ia"], ["DELETE", "/api/memoria-ia"],
  ["GET", "/api/perfis"], ["POST", "/api/perfis"], ["PATCH", "/api/perfis"], ["DELETE", "/api/perfis"],
  ["GET", "/api/perfil"], ["PATCH", "/api/perfil"], ["PATCH", "/api/onboarding"], ["PATCH", "/api/previsao"],
  ["GET", "/api/reembolsos"], ["PUT", "/api/reembolsos"], ["GET", "/api/reembolsos/candidatos"], ["GET", "/api/reembolsos/parecidos"], ["POST", "/api/reembolsos/aplicar"],
  ["GET", "/api/emprestimos"], ["GET", "/api/financas/meios"], ["GET", "/api/financas/ritmo"], ["GET", "/api/financas/divida"],
  ["POST", "/api/categorizar"], ["POST", "/api/importar"], ["POST", "/api/importar/analisar"], ["POST", "/api/importar/preview"], ["POST", "/api/importar/pdf-preview"],
];

test("sem sessão, nenhuma rota de API entrega ou aceita dados", async ({ baseURL }) => {
  const anonimo = await request.newContext({ baseURL });
  const abertas: string[] = [];
  for (const [metodo, rota] of ROTAS) {
    const r = await anonimo.fetch(rota, { method: metodo, data: metodo === "GET" ? undefined : {}, maxRedirects: 0 });
    const redirecionaLogin = [302, 303, 307].includes(r.status()) && (r.headers()["location"] ?? "").includes("/login");
    if (r.status() !== 401 && !redirecionaLogin) abertas.push(`${metodo} ${rota} → ${r.status()}`);
  }
  expect(abertas).toEqual([]);
  await anonimo.dispose();
});

test("Bruno não lê nem altera os dados da Ana", async ({ page, browser }) => {
  const { ana } = semente();
  const alvo = ana.lancamentoIds[0];
  // total da Ana agora (outros testes podem ter importado lançamentos para ela)
  const contextoAntes = await browser.newContext();
  const paginaAntes = await contextoAntes.newPage();
  await entrar(paginaAntes, "Ana");
  const totalAntes = (await (await paginaAntes.request.get("/api/lancamentos?limit=1")).json()).total;
  await contextoAntes.close();
  await entrar(page, "Bruno");
  const api = page.request;

  const lista = await (await api.get("/api/lancamentos?limit=500")).json();
  expect(lista.lancamentos.filter((l: { id: number }) => ana.lancamentoIds.includes(l.id))).toEqual([]);
  expect((await (await api.get("/api/reservas")).json()).reservas).toEqual([]);
  expect(await (await api.get("/api/contas")).json()).toEqual([]);
  expect(await (await api.get("/api/memoria-ia")).json()).toEqual([]);

  expect(await (await api.patch("/api/lancamentos", { data: { id: alvo, descricao: "ALTERADO PELO BRUNO" } })).json()).toEqual({ count: 0 });
  expect(await (await api.put("/api/lancamentos", { data: { ids: [alvo], categoriaCorreta: "Outras Entradas" } })).json()).toEqual({ corrigidos: 0 });
  await api.delete(`/api/lancamentos?id=${alvo}`);

  // do lado da Ana, nada mudou
  const contextoAna = await browser.newContext();
  const paginaAna = await contextoAna.newPage();
  await entrar(paginaAna, "Ana");
  const daAna = await (await paginaAna.request.get("/api/lancamentos?limit=500")).json();
  const original = daAna.lancamentos.find((l: { id: number }) => l.id === alvo);
  expect(original).toBeTruthy();
  expect(original.descricao).not.toBe("ALTERADO PELO BRUNO");
  expect(original.categoria).not.toBe("Outras Entradas");
  expect(daAna.total).toBe(totalAntes);
  await contextoAna.close();
});
