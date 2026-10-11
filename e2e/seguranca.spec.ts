// Rodada de segurança: acesso a recursos de outra conta pelo id (IDOR), campos
// que o cliente não pode definir, HTML/JS em descrições (XSS), entradas
// malformadas, uploads hostis e redirecionamento do login para fora.
import { expect, request, test, type APIResponse, type Page } from "@playwright/test";
import { entrar } from "./ajuda";

test.describe.configure({ mode: "serial" });

async function contexto(browser: import("@playwright/test").Browser, quem: "Ana" | "Bruno") {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await entrar(page, quem);
  return { ctx, page, api: page.request };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- respostas variadas das APIs, conferidas campo a campo
const corpo = async (r: APIResponse): Promise<any> => r.json();

test("Bruno não altera nem apaga recursos da Ana pelo id", async ({ browser }) => {
  const ana = await contexto(browser, "Ana");
  const bruno = await contexto(browser, "Bruno");

  // recursos da Ana
  const reserva = (await corpo(await ana.api.get("/api/reservas"))).reservas[0];
  const regra = (await corpo(await ana.api.get("/api/memoria-ia")))[0];
  const perfil = (await corpo(await ana.api.get("/api/perfis?todos=true"))).find((p: { ativo: boolean }) => p.ativo);
  const conta = (await corpo(await ana.api.get("/api/contas")))[0];
  expect((await ana.api.post("/api/apelidos", { data: { nome: "Grupo da Ana", descricoes: ["MERCADO FICTICIO"] } })).status()).toBe(201);
  const entradaAna = (await corpo(await ana.api.get("/api/lancamentos?limit=500&tipo=Entrada"))).lancamentos[0];

  // tentativas do Bruno
  expect((await bruno.api.patch("/api/reservas", { data: { id: reserva.id, saldoInformado: 1 } })).status()).toBe(404);
  await bruno.api.delete(`/api/reservas?id=${reserva.id}`);
  await bruno.api.delete(`/api/memoria-ia?id=${regra.id}`);
  await bruno.api.patch("/api/perfis", { data: { id: perfil.id, ativo: false } });
  await bruno.api.patch("/api/contas", { data: { id: conta.id, tipo: conta.tipo === "cartao" ? "corrente" : "cartao" } });
  await bruno.api.delete("/api/apelidos?nome=Grupo%20da%20Ana");
  expect(await corpo(await bruno.api.get(`/api/reembolsos?entradaId=${entradaAna.id}`))).toEqual([]);
  expect((await bruno.api.put("/api/reembolsos", { data: { entradaId: entradaAna.id, saidaIds: [] } })).status()).toBe(404);

  // do lado da Ana, tudo intacto
  const reservaDepois = (await corpo(await ana.api.get("/api/reservas"))).reservas.find((r: { id: number }) => r.id === reserva.id);
  expect(reservaDepois.saldoInformado).toBe(reserva.saldoInformado);
  expect((await corpo(await ana.api.get("/api/memoria-ia"))).some((r: { id: number }) => r.id === regra.id)).toBe(true);
  expect((await corpo(await ana.api.get("/api/perfis?todos=true"))).find((p: { id: number }) => p.id === perfil.id).ativo).toBe(true);
  expect((await corpo(await ana.api.get("/api/contas"))).find((c: { id: number }) => c.id === conta.id).tipo).toBe(conta.tipo);
  expect((await corpo(await ana.api.get("/api/apelidos"))).map((g: { nome: string }) => g.nome)).toContain("Grupo da Ana");

  await ana.ctx.close(); await bruno.ctx.close();
});

test("o cliente não escolhe o dono do lançamento (userId vem da sessão)", async ({ browser }) => {
  const ana = await contexto(browser, "Ana");
  const bruno = await contexto(browser, "Bruno");
  const antes = (await corpo(await ana.api.get("/api/lancamentos?limit=1"))).total;
  const r = await bruno.api.post("/api/lancamentos", { data: {
    data: "2026-10-01", descricao: "TENTATIVA DE GRAVAR NA ANA", valor: -1, tipo: "Saída", conta: "X",
    userId: "ana.teste@example.com", id: 1,
  } });
  expect(r.status()).toBe(201);
  expect((await corpo(await ana.api.get("/api/lancamentos?limit=1"))).total).toBe(antes);
  expect((await corpo(await bruno.api.get("/api/lancamentos?busca=TENTATIVA"))).total).toBe(1);
  await ana.ctx.close(); await bruno.ctx.close();
});

test("HTML/JavaScript numa descrição aparece como texto e não executa", async ({ page }) => {
  await entrar(page, "Ana");
  const cargas = [`<img src=x onerror="window.__xss=1">`, `"><script>window.__xss=2</script>`, `javascript:window.__xss=3`];
  for (const descricao of cargas)
    expect((await page.request.post("/api/lancamentos", { data: { data: "2026-10-01", descricao, valor: -5, tipo: "Saída", conta: "Nubank · Débito", categoria: "Compras" } })).status()).toBe(201);
  let dialogo = false;
  page.on("dialog", (d) => { dialogo = true; void d.dismiss(); });
  const semExecucao = async (p: Page) => expect(await p.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();

  await page.goto("/lancamentos");
  await page.getByPlaceholder("Buscar descrição…").fill("onerror");
  await expect(page.locator("table").getByText(cargas[0])).toBeVisible(); // como texto, na tabela
  await semExecucao(page);

  await page.goto("/matriz");
  await page.getByRole("button", { name: "Abrir todos" }).click();
  await page.locator("tbody tr").filter({ hasText: /^▶?\s*Compras/ }).first().click();
  await expect(page.getByText(/ONERROR=/).first()).toBeVisible(); // a Matriz mostra a descrição em maiúsculas, como texto
  await semExecucao(page);
  expect(dialogo).toBe(false);
});

test("corpo malformado e parâmetros inválidos dão 400, nunca 500", async ({ page }) => {
  await entrar(page, "Ana");
  const comCorpo: [string, string][] = [
    ["POST", "/api/lancamentos"], ["PATCH", "/api/lancamentos"], ["PUT", "/api/lancamentos"],
    ["POST", "/api/reservas"], ["PATCH", "/api/reservas"], ["POST", "/api/memoria-ia"], ["PATCH", "/api/perfis"],
    ["PATCH", "/api/contas"], ["PUT", "/api/planejamento"], ["PUT", "/api/reembolsos"], ["POST", "/api/apelidos"],
    ["PATCH", "/api/apelidos"], ["PATCH", "/api/perfil"], ["PATCH", "/api/previsao"], ["POST", "/api/categorizar"],
    ["POST", "/api/desafios"], ["PATCH", "/api/desafios"], ["PUT", "/api/categorizar"],
  ];
  const ruins: string[] = [];
  for (const [metodo, rota] of comCorpo) {
    for (const bruto of ["{", "null", "[]", JSON.stringify({ id: "1 OR 1=1", valor: "abc", descricao: "x".repeat(20000) })]) {
      const r = await page.request.fetch(rota, { method: metodo, data: bruto, headers: { "content-type": "application/json" } });
      if (r.status() >= 500) ruins.push(`${metodo} ${rota} com ${bruto.slice(0, 12)} → ${r.status()}`);
    }
  }
  for (const rota of ["/api/lancamentos?id=abc", "/api/lancamentos?id=-1", "/api/reservas?id=1e99", "/api/memoria-ia?id=0"]) {
    const r = await page.request.delete(rota);
    if (r.status() !== 400) ruins.push(`DELETE ${rota} → ${r.status()}`);
  }
  for (const rota of ["/api/lancamentos?page=999999999999&limit=abc", "/api/matriz?dataInicio=ontem", "/api/resumo?tipo=<script>"]) {
    const r = await page.request.get(rota);
    if (r.status() >= 500) ruins.push(`GET ${rota} → ${r.status()}`);
  }
  expect(ruins).toEqual([]);
});

test("uploads: grande demais, PDF falso e PDF corrompido são recusados sem erro interno", async ({ page }) => {
  await entrar(page, "Ana");
  const enviar = (nome: string, conteudo: Buffer, tipo = "application/octet-stream") =>
    page.request.post("/api/importar/analisar", { multipart: { file: { name: nome, mimeType: tipo, buffer: conteudo } } });

  const grande = await enviar("extrato.csv", Buffer.alloc(9 * 1024 * 1024, "a"), "text/csv");
  expect(grande.status()).toBe(413); // recusado pelo tamanho declarado, antes de ler o corpo
  expect((await grande.json()).error).toMatch(/limite/);

  const falso = await enviar("fatura.pdf", Buffer.from("isto não é um pdf <script>alert(1)</script>"), "application/pdf");
  expect(falso.status()).toBeLessThan(500);
  expect(JSON.stringify(await falso.json())).not.toMatch(/at \w+ \(|node_modules|stack/i);

  const corrompido = await enviar("fatura.pdf", Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(4096, 0x8f)]), "application/pdf");
  expect(corrompido.status()).toBeLessThan(500);
  expect(JSON.stringify(await corrompido.json())).not.toMatch(/at \w+ \(|node_modules|stack/i);
  // o servidor continua respondendo
  expect((await page.request.get("/api/perfil")).status()).toBe(200);
});

test("login não redireciona para site externo", async ({ baseURL }) => {
  const anon = await request.newContext({ baseURL });
  const { csrfToken } = await (await anon.get("/api/auth/csrf")).json();
  const r = await anon.post("/api/auth/callback/teste", {
    form: { csrfToken, email: "ana.teste@example.com", callbackUrl: "https://site-malicioso.example/roubo" },
    maxRedirects: 0,
  });
  const destino = r.headers()["location"] ?? "";
  expect(destino).not.toContain("site-malicioso.example");
  expect(destino.startsWith("/") || destino.startsWith(baseURL!)).toBe(true);
  await anon.dispose();
});

test("CSP com nonce: cada página tem o seu, os scripts o carregam e nada é bloqueado", async ({ page }) => {
  const violacoes: string[] = [];
  page.on("console", (m) => { if (/Content Security Policy|Refused to (execute|load)/i.test(m.text())) violacoes.push(m.text()); });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => console.error(`Content Security Policy: ${e.violatedDirective} ${e.blockedURI}`));
  });

  const nonces = new Set<string>();
  for (let i = 0; i < 2; i++) {
    const r = await page.request.get("/login");
    const csp = r.headers()["content-security-policy"] ?? "";
    const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src")) ?? "";
    expect(scriptSrc).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
    expect(scriptSrc).not.toContain("unsafe-inline");
    const nonce = scriptSrc.match(/'nonce-([^']+)'/)![1];
    nonces.add(nonce);
    // todo <script> do HTML do servidor carrega o nonce desta resposta (os que o Next
    // insere depois, já em execução, valem pelo 'strict-dynamic')
    const html = await r.text();
    const scripts = html.match(/<script[^>]*>/g) ?? [];
    expect(scripts.length).toBeGreaterThan(0);
    expect(scripts.filter((t) => !t.includes(`nonce="${nonce}"`))).toEqual([]);
  }
  expect(nonces.size).toBe(2); // muda a cada carregamento

  await entrar(page, "Ana");
  for (const caminho of ["/", "/lancamentos", "/matriz"]) {
    await page.goto(caminho);
    await page.waitForLoadState("networkidle");
  }
  expect(violacoes).toEqual([]); // navegação normal: nenhum script legítimo bloqueado

  // XSS como ele chega de verdade: marcação com handler embutido. Com 'unsafe-inline'
  // (política anterior) o onerror rodava; com nonce o navegador bloqueia.
  const executou = await page.evaluate(async () => {
    const div = document.createElement("div");
    div.innerHTML = `<img src="/nao-existe.png" onerror="window.__injetado = true">`;
    document.body.appendChild(div);
    await new Promise((r) => setTimeout(r, 500));
    return (window as unknown as { __injetado?: boolean }).__injetado === true;
  });
  expect(executou).toBe(false);
  expect(violacoes.length).toBeGreaterThan(0); // o navegador registrou o bloqueio da injeção
});
