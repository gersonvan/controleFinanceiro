// Plano da família: pessoas, rendas e contas com quem paga, resumo por pessoa e
// por filho, cenário comparado ao principal, validação; trazer a própria
// Fotografia do mês (e o aviso quando ela muda); e o plano compartilhado: a Ana
// convida o Bruno, ele aceita e edita, a renda dele fica privada (nem chega à
// Ana) e as edições simultâneas se juntam.
// O Bruno age pela API: a conta dele continua sem onboarding para os outros testes.
import { expect, test, type APIRequestContext, type Browser, type Locator, type Page } from "@playwright/test";
import { entrar, vigiarErros } from "./ajuda";

test.describe.configure({ mode: "serial" });

const BRUNO = "bruno.teste@example.com";
const txt = (s: string) => s.replace(/\u00a0/g, " ");

interface Resposta {
  planos: { id: number; souCriador: boolean }[];
  convites: { plano: number }[];
  plano: null | { id: number; versao: number; dados: { pessoas: { chave: string; nome: string }[]; cenarios: { itens: Record<string, unknown>[] }[] }; membros: { id: number; email: string; pessoa: string | null; aceito: boolean }[] };
}
const ler = async (api: APIRequestContext, plano?: number): Promise<Resposta> =>
  (await api.get(`/api/familia${plano ? `?plano=${plano}` : ""}`)).json();

/** Começa do zero: exclui os planos que criou, sai dos outros e recusa os convites. */
async function limpar(api: APIRequestContext) {
  const r = await ler(api);
  for (const p of r.planos) {
    if (p.souCriador) await api.delete(`/api/familia?plano=${p.id}`);
    else await api.patch("/api/familia", { data: { plano: p.id, acao: "sair" } });
  }
  for (const c of r.convites) await api.patch("/api/familia", { data: { plano: c.plano, acao: "recusar" } });
}
async function criar(api: APIRequestContext, nome = "Plano da família"): Promise<number> {
  const r = await api.post("/api/familia", { data: { nome } });
  expect(r.status()).toBe(201);
  return (await r.json()).id;
}
async function logar(browser: Browser, quem: "Ana" | "Bruno") {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await entrar(page, quem);
  return { api: page.request, fechar: () => ctx.close() };
}

async function novaLinha(page: Page, secao: "rendas" | "contas"): Promise<Locator> {
  const s = page.locator(`[data-secao="${secao}"]`);
  await s.getByRole("button", { name: secao === "rendas" ? "Adicionar renda" : "Adicionar conta" }).click();
  return s.locator("[data-item]").last();
}
async function preencher(linha: Locator, rotulo: string, descricao: string, valor: string) {
  await linha.getByLabel(`Descrição da ${rotulo}`).fill(descricao);
  const campo = linha.getByLabel(`Valor da ${rotulo}`);
  await campo.fill(valor);
  await campo.blur();
}
const aviso = (page: Page) => page.locator("[data-aviso-plano]");
async function salvar(page: Page) {
  await page.locator("[data-cenarios]").getByRole("button", { name: "Salvar" }).click();
}
async function adicionarPessoa(page: Page, nome: string, tipo: string) {
  const pessoas = page.locator('[data-secao="pessoas"]');
  await pessoas.getByLabel("Nome da pessoa").fill(nome);
  await pessoas.getByLabel("Tipo de pessoa").selectOption(tipo);
  await pessoas.getByRole("button", { name: "Adicionar" }).click();
}

test.beforeEach(async ({ page }) => {
  await entrar(page, "Ana");
  await limpar(page.request);
});

test("cria o plano, monta, salva, compara um cenário e recusa dados inválidos", async ({ page }) => {
  const erros = vigiarErros(page);
  await page.goto("/planejamento?aba=familia");
  await page.locator("[data-sem-plano]").getByRole("button", { name: "Criar plano" }).click();

  // quem cria já é uma pessoa adulta do plano
  const pessoas = page.locator('[data-secao="pessoas"]');
  await expect(pessoas.locator('[data-pessoa="Ana"]')).toContainText("você");
  for (const [nome, tipo] of [["Bruno", "adulto"], ["Léo", "dependente"], ["Apartamento", "outro"]]) await adicionarPessoa(page, nome, tipo);
  await expect(pessoas.locator("[data-pessoa]")).toHaveCount(4);

  await preencher(await novaLinha(page, "rendas"), "renda", "Salário", "10000");
  const rendaBruno = await novaLinha(page, "rendas");
  await rendaBruno.getByLabel("De quem").selectOption({ label: "Bruno" });
  await preencher(rendaBruno, "renda", "Salário", "8000");

  const aluguel = await novaLinha(page, "contas");
  await preencher(aluguel, "conta", "Aluguel", "3000");
  await aluguel.getByRole("combobox").nth(3).selectOption("Aluguel"); // categoria
  const escola = await novaLinha(page, "contas");
  await preencher(escola, "conta", "Escola Léo", "1600");
  await escola.getByLabel("Quem paga").selectOption({ label: "Bruno" });
  await escola.getByLabel("Para quem").selectOption({ label: "Léo" });
  const ipva = await novaLinha(page, "contas");
  await preencher(ipva, "conta", "IPVA", "3600");
  await ipva.getByLabel("Periodicidade").selectOption("anual");
  await ipva.getByLabel("Quem paga").selectOption({ label: "Bruno" });
  await ipva.getByLabel("Agrupar em").fill("Carro");

  await salvar(page);
  await expect(aviso(page)).toContainText("Plano salvo");

  // resumo: por pessoa, por filho e da casa (IPVA 3600/ano = 300/mês)
  const conferirResumo = async () => {
    expect(txt(await page.locator('[data-pessoa-resumo="Ana"]').innerText())).toContain("sobra R$ 7.000,00");
    expect(txt(await page.locator('[data-pessoa-resumo="Bruno"]').innerText())).toContain("sobra R$ 6.100,00");
    expect(txt(await page.locator("[data-por-dependente]").innerText())).toContain("R$ 1.600,00");
    expect(txt(await page.locator("[data-sobra]").innerText())).toContain("R$ 13.100,00");
  };
  await conferirResumo();
  await page.reload(); // gravado de verdade
  await conferirResumo();
  await expect(page.locator("[data-ultimo]")).toContainText("salvo por você");

  // cenário: cópia do principal com a escola mais barata
  await page.getByRole("button", { name: "+ Novo cenário" }).click();
  await page.getByLabel("Nome do cenário").fill("Escola um turno");
  await page.getByRole("button", { name: "OK" }).click();
  await expect(page.getByLabel("Cenário")).toHaveValue(/.+/);
  const escolaCenario = page.locator('[data-secao="contas"] [data-item="Escola Léo"]');
  await escolaCenario.getByLabel("Valor da conta").fill("1000");
  await escolaCenario.getByLabel("Valor da conta").blur();
  const comp = page.locator("[data-comparacao]");
  expect(txt(await comp.innerText())).toContain("Escola Léo R$ 1.600,00 → R$ 1.000,00");
  expect(txt(await comp.innerText())).toMatch(/Contas fixas\s+−R\$ 600,00/); // só a diferença, uma vez
  expect(txt(await comp.locator('[data-delta-pessoa="Bruno"]').innerText())).toMatch(/\+R\$ 600,00/);
  await salvar(page);
  await expect(aviso(page)).toContainText("Plano salvo");

  // pela API: versão velha devolve o plano atual (para juntar); dependente com renda é recusado
  const { plano } = await ler(page.request);
  expect(plano!.dados.cenarios).toHaveLength(2);
  const velha = await page.request.put("/api/familia", { data: { plano: plano!.id, dados: plano!.dados, versao: plano!.versao - 1 } });
  expect(velha.status()).toBe(409);
  expect((await velha.json()).versao).toBe(plano!.versao);
  const leo = plano!.dados.pessoas.find((p) => p.nome === "Léo")!.chave;
  plano!.dados.cenarios[0].itens.push({ chave: "mesada", tipo: "renda", descricao: "Mesada", valor: 50, periodicidade: "mensal", pessoa: leo, para: null, categoria: null, grupo: null, origem: null });
  expect((await page.request.put("/api/familia", { data: { plano: plano!.id, dados: plano!.dados, versao: plano!.versao } })).status()).toBe(400);
  expect(erros).toEqual([]);
});

test("linha em branco é descartada e a incompleta vira mensagem clara, sem texto técnico", async ({ page }) => {
  await criar(page.request);
  await page.goto("/planejamento?aba=familia");

  await novaLinha(page, "rendas");
  await salvar(page);
  await expect(aviso(page)).toContainText("Plano salvo");
  await expect(page.locator('[data-secao="rendas"] [data-item]')).toHaveCount(0);

  const conta = await novaLinha(page, "contas");
  await conta.getByLabel("Descrição da conta").fill("Aluguel");
  await salvar(page);
  const problemas = page.locator("[data-problemas]");
  await expect(problemas).toContainText("“Aluguel”: falta o valor");
  await expect(problemas).not.toContainText("dados.");
  await expect(conta).toHaveClass(/ring-red-300/);

  await conta.getByLabel("Valor da conta").fill("1500");
  await conta.getByLabel("Valor da conta").blur();
  await expect(problemas).toHaveCount(0);
  await salvar(page);
  await expect(aviso(page)).toContainText("Plano salvo");
});

test("traz a própria Fotografia do mês e avisa só quando ela muda", async ({ page }) => {
  const erros = vigiarErros(page);
  const id = await criar(page.request);
  await page.goto("/planejamento?aba=familia");

  // a Fotografia da Ana (semente) tem salário, aluguel e mercado (variável): convite em destaque
  const primeira = page.locator('[data-novidade="primeira"]');
  await expect(primeira).toContainText("1 renda e 1 conta ainda não estão no plano");
  await primeira.getByRole("button", { name: "Ver e trazer" }).click();
  const painel = page.locator("[data-trazer-fotografia][data-painel]");
  await expect(painel).toContainText("1 gasto variável (o dia a dia, não é conta fixa)");
  await painel.getByRole("button", { name: "Trazer" }).click();
  await expect(aviso(page)).toContainText("2 itens trazidos");
  await salvar(page);
  await expect(aviso(page)).toContainText("Plano salvo");

  const { plano } = await ler(page.request, id);
  const ana = plano!.membros[0].pessoa;
  expect(plano!.dados.cenarios[0].itens.map((i) => [i.tipo, i.descricao, i.valor, i.pessoa, i.por, i.fonte])).toEqual([
    ["renda", "Salário", 6000, ana, "Ana", "fotografia"], ["conta", "Aluguel", 1800, ana, "Ana", "fotografia"],
  ]);

  // trazido e salvo: nada de aviso; o link mostra que não há nada novo
  await page.reload();
  await expect(page.locator("[data-novidade]")).toHaveCount(0);
  await page.getByRole("button", { name: "📸 Trazer da minha Fotografia do mês" }).click();
  await expect(painel).toContainText("Nada novo para trazer");

  // o aluguel do plano ficou diferente da Fotografia e o que foi visto é antigo: aviso de mudança
  plano!.dados.cenarios[0].itens[1].valor = 1500;
  expect((await page.request.put("/api/familia", { data: { plano: id, dados: plano!.dados, versao: plano!.versao, vistos: [] } })).status()).toBe(200);
  await page.reload();
  const mudou = page.locator('[data-novidade="mudou"]');
  await expect(mudou).toContainText("1 valor está diferente do plano");
  await mudou.getByRole("button", { name: "Agora não" }).click();
  await expect(mudou).toHaveCount(0);
  await page.reload();
  await expect(page.locator("[data-novidade]")).toHaveCount(0); // dispensado fica dispensado
  expect(erros).toEqual([]);
});

test.describe("plano compartilhado", () => {
  let bruno: Awaited<ReturnType<typeof logar>>;
  test.beforeAll(async ({ browser }) => { bruno = await logar(browser, "Bruno"); await limpar(bruno.api); });
  test.afterAll(async () => { await limpar(bruno.api); await bruno.fechar(); });

  test("a Ana convida o Bruno; ele aceita, diz quem é e edita; edições ao mesmo tempo se juntam", async ({ page }) => {
    const erros = vigiarErros(page);
    const id = await criar(page.request, "Nossa casa");
    await page.goto("/planejamento?aba=familia");
    await adicionarPessoa(page, "Bruno", "adulto");
    const aluguel = await novaLinha(page, "contas");
    await preencher(aluguel, "conta", "Aluguel", "3000");
    await salvar(page);
    await expect(aviso(page)).toContainText("Plano salvo");

    // antes de aceitar, o Bruno não vê o plano nem grava nele
    const participantes = page.locator('[data-secao="participantes"]');
    await participantes.getByLabel("E-mail para convidar").fill(BRUNO);
    await participantes.getByRole("button", { name: "Convidar" }).click();
    await expect(participantes.locator(`[data-membro="${BRUNO}"]`)).toContainText("convite pendente");
    let doBruno = await ler(bruno.api, id);
    expect(doBruno.plano).toBeNull();
    expect(doBruno.convites.map((c) => c.plano)).toEqual([id]);
    expect((await bruno.api.put("/api/familia", { data: { plano: id, dados: { pessoas: [], cenarios: [{ chave: "principal", nome: "x", principal: true, itens: [] }] }, versao: 1 } })).status()).toBe(404);

    // aceita, diz que é o Bruno da casa e inclui a própria renda (privada por padrão) e uma conta da casa
    expect((await bruno.api.patch("/api/familia", { data: { plano: id, acao: "aceitar" } })).ok()).toBe(true);
    const chaveBruno = (await ler(bruno.api, id)).plano!.dados.pessoas.find((p) => p.nome === "Bruno")!.chave;
    expect((await bruno.api.patch("/api/familia", { data: { plano: id, acao: "pessoa", pessoa: chaveBruno } })).ok()).toBe(true);
    doBruno = await ler(bruno.api, id);
    const dadosBruno = structuredClone(doBruno.plano!.dados);
    const novo = (chave: string, tipo: string, descricao: string, valor: number) =>
      ({ chave, tipo, descricao, valor, periodicidade: "mensal", pessoa: chaveBruno, para: null, categoria: null, grupo: null, origem: null });
    dadosBruno.cenarios[0].itens.push(novo("rendabruno", "renda", "Salário", 8000), novo("luz", "conta", "Luz", 200));
    expect((await bruno.api.put("/api/familia", { data: { plano: id, dados: dadosBruno, versao: doBruno.plano!.versao } })).status()).toBe(200);

    // a Ana, com a tela de antes, muda o aluguel e inclui uma conta: as alterações se juntam
    await aluguel.getByLabel("Valor da conta").fill("3200");
    await aluguel.getByLabel("Valor da conta").blur();
    await preencher(await novaLinha(page, "contas"), "conta", "Internet", "120");
    await salvar(page);
    await expect(aviso(page)).toContainText("juntadas com as que bruno.teste salvou");
    const descricoes = async (api: APIRequestContext) => (await ler(api, id)).plano!.dados.cenarios[0].itens.map((i) => `${i.descricao} ${i.valor}`);
    // a renda do Bruno é privada: nem chega à Ana, e continua no plano para ele
    expect(await descricoes(page.request)).toEqual(["Aluguel 3200", "Luz 200", "Internet 120"]);
    expect(await descricoes(bruno.api)).toEqual(["Aluguel 3200", "Salário 8000", "Luz 200", "Internet 120"]);
    await expect(page.locator('[data-secao="contas"] [data-item="Luz"] [data-autor]')).toContainText("incluído por bruno.teste");
    await page.reload();
    const membroBruno = participantes.locator(`[data-membro="${BRUNO}"]`);
    await expect(membroBruno).toContainText("é Bruno na casa");
    await expect(membroBruno).toContainText("renda e contas pessoais privadas");
    const resumoBruno = page.locator('[data-pessoa-resumo="Bruno"]');
    await expect(resumoBruno).toContainText("renda privada");
    await expect(resumoBruno).toContainText("sobra privada");
    await expect(page.locator("[data-sobra]")).toContainText("A sobra da casa não aparece");
    await expect(page.locator("[data-fatias-familia]")).toHaveCount(0);

    // a Ana não inclui renda no nome do Bruno
    let atual = (await ler(page.request, id)).plano!;
    const comRenda = structuredClone(atual.dados);
    comRenda.cenarios[0].itens.push({ ...novo("bonus", "renda", "Bônus", 500) });
    const recusa = await page.request.put("/api/familia", { data: { plano: id, dados: comRenda, versao: atual.versao } });
    expect(recusa.status()).toBe(400);
    expect((await recusa.json()).detalhes).toEqual(["“Bônus”: a renda de Bruno é privada — só Bruno inclui a própria"]);

    // o Bruno mostra a renda: a Ana passa a ver; depois volta a esconder
    const privacidade = (mostrarRenda: boolean) => bruno.api.patch("/api/familia", { data: { plano: id, acao: "privacidade", mostrarRenda, mostrarPessoais: false } });
    expect((await privacidade(true)).ok()).toBe(true);
    await page.reload();
    await expect(page.locator('[data-secao="rendas"] [data-item="Salário"]')).toBeVisible();
    await expect(resumoBruno).toContainText("renda R$ 8.000,00");
    expect((await privacidade(false)).ok()).toBe(true);
    await page.reload();
    await expect(page.locator('[data-secao="rendas"] [data-item="Salário"]')).toHaveCount(0);

    // os dois mudam o aluguel: fica o do Bruno (salvou antes) e a Ana é avisada
    const doBrunoAgora = (await ler(bruno.api, id)).plano!;
    const outra = structuredClone(doBrunoAgora.dados);
    outra.cenarios[0].itens.find((i) => i.descricao === "Aluguel")!.valor = 2000;
    expect((await bruno.api.put("/api/familia", { data: { plano: id, dados: outra, versao: doBrunoAgora.versao } })).status()).toBe(200);
    const aluguelAna = page.locator('[data-secao="contas"] [data-item="Aluguel"]');
    await aluguelAna.getByLabel("Valor da conta").fill("2500");
    await aluguelAna.getByLabel("Valor da conta").blur();
    await salvar(page);
    await expect(aviso(page)).toContainText("vocês dois mexeram no mesmo ponto");
    await expect(aviso(page)).toContainText("“Aluguel”");
    await expect(aluguelAna.getByLabel("Valor da conta")).toHaveValue("2000,00");
    await salvar(page); // conferiu: salva o que ficou
    await expect(aviso(page)).toContainText("Plano salvo");
    expect(await descricoes(bruno.api)).toEqual(["Aluguel 2000", "Salário 8000", "Luz 200", "Internet 120"]); // a renda dele ficou

    // só quem criou convida e exclui; quem criou não sai; o Bruno sai, leva a renda privada e deixa de ver
    expect((await bruno.api.patch("/api/familia", { data: { plano: id, acao: "convidar", email: "outra@example.com" } })).status()).toBe(403);
    expect((await bruno.api.delete(`/api/familia?plano=${id}`)).status()).toBe(403);
    expect((await page.request.patch("/api/familia", { data: { plano: id, acao: "sair" } })).status()).toBe(400);
    expect((await bruno.api.patch("/api/familia", { data: { plano: id, acao: "sair" } })).ok()).toBe(true);
    expect((await ler(bruno.api, id)).plano).toBeNull();
    atual = (await ler(page.request, id)).plano!;
    expect(atual.membros.map((m) => m.email)).toEqual(["ana.teste@example.com"]);
    expect(await descricoes(page.request)).toEqual(["Aluguel 2000", "Luz 200", "Internet 120"]);
    // o 409 é o caminho esperado (o app junta as edições); o navegador só o registra no console
    expect(erros.filter((e) => !e.includes("status of 409"))).toEqual([]);
  });
});
