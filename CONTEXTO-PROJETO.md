# Contexto do Projeto — financeiro-web

> Documento de handoff para trabalhar com qualquer assistente de IA.
> Última atualização: 2026-09-20.

---

## 1. O que é o projeto

**financeiro-web** é uma aplicação web de controle financeiro pessoal, multi-usuário (modelo SaaS com isolamento por usuário). Cada usuário importa extratos bancários e faturas de cartão (CSV, OFX, PDF), categoriza os lançamentos (manual, por regras, ou via IA Gemini) e analisa os dados em dashboards, matriz de gastos, previsão de despesas e controle de empréstimos.

- **Dono**: Gerson (gersonvan@gmail.com), usa contas C6 e Nubank, prefere serviços free tier.
- **Origem**: substituiu um sistema anterior em Google Apps Script + Planilhas (pasta irmã `ScriptImportacaoFinanceira`). Houve migração de dados via script.
- **Localização**: `controleFinanceiro/financeiro-web` (dentro de OneDrive).
- **Git**: o repositório está em `financeiro-web` (a pasta pai não é repo). Deploy conectado à Vercel; push na main dispara deploy.

## 2. Stack (versões resolvidas do lockfile)

| Tecnologia | Versão | Observação |
|---|---|---|
| Next.js | 16.3.5 | App Router + Turbopack. **Atenção: Next 16 tem breaking changes** — consultar `node_modules/next/dist/docs/` antes de codar (instrução do AGENTS.md) |
| React | 19.2.4 | |
| TypeScript | 5.9.3 | Path alias `@/` → `src/` |
| Prisma | 7.10.0 | Com `@prisma/adapter-pg` + driver `pg` 8.21.0 |
| Banco | Neon PostgreSQL (serverless) | Via `DATABASE_URL` |
| NextAuth | 5.0.0-beta.32 | Google OAuth, sessão JWT (stateless, 7 dias) |
| Tailwind CSS | 4.3.0 | |
| recharts | 3.8.1 | Gráficos do dashboard |
| papaparse 5.5.3 / pdf-parse 2.4.5 | | Parsers de importação |
| zod | 4.x | Validação de toda entrada das APIs (`src/lib/validacao.ts`) |
| Gemini | gemini-2.0-flash-lite | REST direto via fetch, `GEMINI_API_KEY` no header `x-goog-api-key` |

`next.config.ts` tem `serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pdf-parse"]` — obrigatório, não remover. Também define os cabeçalhos de segurança (CSP, `frame-ancestors 'none'`, nosniff, Referrer-Policy, HSTS) via `headers()`; ao adicionar origem externa (fonte, imagem, API chamada do navegador), incluir na CSP.

## 3. Modelo de dados (prisma/schema.prisma)

5 entidades, todas com discriminador `userId` (= e-mail Google do usuário):

- **Lancamento** — id, userId, data, descricao, valor (float, negativo = saída), tipo ("Entrada"/"Saída"), conta, categoria (nullable), pessoa (nullable, p/ empréstimos), mesReferencia (nullable, competência de fatura de cartão).
- **UserProfile** — userId (PK, e-mail), nome, onboardingCompleto (bool), createdAt, margemPercentual (default 20), fotografiaConcluidaEm (null = dashboard lembra de fazer a fotografia).
- **PlanejamentoItem** — a *Fotografia do mês*: grupo ("entrada"|"fixo"|"variavel"|"sazonal"|"parcela"), descricao, categoria (sempre de `CATEGORIAS`), valor (positivo), periodicidade ("mensal"|"semanal"|"anual"), parcelaAtual/parcelaTotal (só parcelas), ordem. Mensalização em `src/lib/planejamento.ts` (`valorMensal`: semanal × 52/12, anual ÷ 12, parcela pesa até a última).
- **Conta** — tipo de cada conta do usuário: nome (= `Lancamento.conta`), tipo ("corrente"|"cartao"); `@@unique([userId, nome])`. Criada sob demanda por `garantirContas` (`src/lib/contas.ts`) a partir das contas usadas nos lançamentos, com tipo sugerido pelo nome ("Crédito"/"Cartão" → cartão). Migração `20260926150000_conta`.
- **Reembolso** (26/09) — "Dividir": vínculo entre um Pix recebido (entradaId, categoria "Reembolso") e os gastos que ele devolve (saidaId), com a parte do Pix em cada um (`valor`); cascade nos dois lados. `Lancamento.valorReembolsado` guarda a soma por gasto (e, no Pix, quanto ele abateu) (recalculado em `src/lib/reembolso-dados.ts` a cada mudança e ao excluir o Pix). Migração `20260926200000_reembolso`.
- **Reserva** (27/09) — onde está o dinheiro guardado: nome, tipo (investimento/previdência/conta), bloqueada, saldoInformado + dataSaldo, conta e filtroDescricao opcionais. Saldo estimado = informado + aplicações − resgates (lançamentos de Investimentos (Aportes) da conta, depois da data). Tipo "conta" (conta corrente, 27/09): todos os lançamentos da conta depois da data movimentam o saldo; a importação grava o saldo final do extrato quando o arquivo traz (C6 "Saldo do Dia", Bradesco "Saldo (R$)", BB "Saldo do dia"/"S A L D O" — `src/lib/importacao/saldo.ts`, `atualizarSaldoConta`). Totais: em conta, aplicado disponível, bloqueado e geral. `src/lib/reserva.ts`, `/api/reservas`, página `/reserva`, cartão no dashboard. Migração `20260927000000_reserva`.
- **MemoriaIA** — regras descrição→categoria por usuário; `@@unique([descricao, userId])`.
- **PerfilImportacao** — configuração de importação por banco: nome, conta, formato ("csv"|"ofx"|"pdf"), mapeamento de colunas (colData, colDescricao, colParcela, colValor, colEntrada, colSaida), delimitador, linhasPular, formatoData, modoValor ("unica"|"separadas"), inverterSinal, usaMesReferencia, builtin (chave string p/ perfis nativos, null p/ personalizados), ativo (bool). `@@unique([userId, builtin])` garante um perfil nativo por usuário (migração `20260920120000_perfil_builtin_unique`).

**Regra de período importante**: quando `mesReferencia` está preenchido, ele é usado no lugar de `data` para todos os filtros de período. Padrão repetido em várias APIs:
```ts
OR: [
  { mesReferencia: { not: null, ...dateFilter } },
  { mesReferencia: null, data: dateFilter },
]
```

## 4. Arquitetura e decisões-chave

- **Camadas**: páginas/rotas em `src/app/`, APIs em `src/app/api/*/route.ts`, domínio em `src/lib/`, componentes em `src/components/`.
- **Auth split (crítico)**: `src/auth.config.ts` é a config mínima Edge-compatible (sem Prisma) usada só pelo `src/proxy.ts`; `src/auth.ts` é a config completa (Google provider + callbacks com Prisma) usada no resto. **Nunca importar Prisma (direta ou indiretamente) no proxy** — já causou falha de deploy na Vercel (Edge Runtime não suporta módulos nativos). Corrigido no commit `25896ef`.
- **Proxy, não middleware**: o Next 16 renomeou a convenção `middleware.ts` → `proxy.ts`, e com pasta `src/` o arquivo precisa ficar em `src/proxy.ts`. Em 2026-09-20 verificou-se que o `middleware.ts` na raiz era compilado mas **não executava no dev server** (produção funcionava); as APIs continuaram protegidas porque cada rota revalida a sessão. Não voltar para `middleware.ts`.
- **Validação de entrada**: toda rota que recebe corpo, query ou upload valida com zod via `validar()`/`lerCorpo()`/`lerQuery()`/`lerArquivo()` de `src/lib/validacao.ts`. Campos desconhecidos são descartados (sem mass assignment), `categoria` é restrita a `CATEGORIAS`, uploads têm teto de 8 MB e PDFs são checados pelo magic byte. Filtros de período compartilhados em `src/lib/filtros.ts`. Ao criar rota nova, seguir o padrão.
- **Multi-tenancy**: linha por tenant com `userId` em todo `where` de todas as queries. Não há Row-Level Security nem middleware Prisma — o isolamento depende de disciplina de código. `getSessionUserId()` (`src/lib/session.ts`) retorna o e-mail da sessão; toda API começa com esse check e responde 401 se null.
- **Autorização de acesso**: lista `ALLOWED_EMAILS` (env var, default `gersonvan@gmail.com`, comparação case-insensitive) checada no `signIn` (que também exige `email_verified` do Google) **e** revalidada a cada requisição no callback `jwt` — remover um e-mail da lista encerra a sessão existente. `session.maxAge` = 7 dias.
- **Onboarding**: `onboardingCompleto` vive no JWT (setado no callback `jwt` no login; atualizado via `update()` do next-auth/react quando o wizard termina). O middleware redireciona para `/onboarding` se `=== false` (check estrito: `undefined` de sessões antigas passa). Auto-graduação: usuário sem UserProfile mas com Lancamentos ganha `onboardingCompleto: true` no primeiro login.
- **Categorias**: lista estática de 39 categorias em `src/lib/categorias.ts` (const `CATEGORIAS`), organizadas em `GRUPOS_CATEGORIAS` (Entradas, Moradia, Alimentação, Transporte, Saúde, Educação, Pessoal e Lazer, Financeiro, Transferências, Empresa) — todos os seletores usam `OpcoesCategorias`; teste garante que toda categoria está em exatamente um grupo. **Empresa (PJ)** (25/09) fica em `CATEGORIAS_NEUTRAS`: gastos da empresa pagos da conta pessoal não entram nos totais pessoais. "Pagamento de Empréstimo" foi removida (nunca usada). Adicionar categoria = mudança de código (e o `categoriaSchema` da validação passa a aceitá-la). Subconjuntos: `CATEGORIAS_FIXAS` (previsão), `CATEGORIAS_EMPRESTIMO`, `CATEGORIAS_NEUTRAS` (movimentação interna, excluída dos totais do dashboard, resumo e Planejado × Realizado). Em 20/09 entraram Plano de Saúde, Pets, Cuidados Pessoais, Presentes e Impostos e Tributos, com regras genéricas em `mapearCategoria`.
- **Fotografia do mês** (`/planejamento`): pré-configuração opcional e sugerida no onboarding — entradas, fixos, variáveis (mês/semana), sazonais (ano ÷ 12), parcelas e margem (% das entradas) → "sobra/falta". Alimenta o Planejado × Realizado (`/api/planejamento/realizado`) e a Previsão (categorias sem histórico ganham `tipoPrevisao: "Planejado"`; parcelas da fotografia não repetem parcelas já vistas nos lançamentos). Sugestões (chips) em `src/lib/planejamento-sugestoes.ts`. **Sugestões pelo histórico** (26/09, `src/lib/planejamento-historico.ts` + `GET /api/planejamento/historico`): com ≥ 2 meses de lançamentos, cada chip de categoria exclusiva mostra "~R$ X" e entra já preenchido (fixo = mediana dos 6 meses fechados, variável/entrada = média, sazonal = total de 12 meses); categorias compartilhadas (Energia/Água/Internet = Contas de Consumo) só mostram referência com os maiores estabelecimentos; bloco "Encontrado no seu histórico" lista categorias frequentes ainda fora da fotografia. Ficam de fora neutras, o coringa, Taxas e Anuidades (juros), Transferência Recebida, estornos e empréstimos. Sem histórico, cada etapa mostra uma dica de que a funcionalidade existe. Inspirada na planilha de consultoria da irmã do Gerson — ideia, não cópia.

- **Painéis de finanças** (26/09, `src/lib/financas.ts`, funções puras testadas): *Como você pagou* — gasto do mês por meio (cartão pelo mês da fatura; nas contas correntes a descrição decide Pix / débito / juros-IOF-multa / resto = "Boletos e contas"), com aportes em "Guardado" separado; *Ritmo do mês* — acumulado diário só das contas correntes × média dos 5 meses anteriores, projeção = gasto até hoje + o que a média gasta nos dias que faltam; *Custo de dívida* — juros, IOF e multas em 12 meses, devoluções descontadas, IOF de compra no exterior fora, agrupado por origem (`origemEncargo`: cheque especial / atraso de fatura / rotativo). "Gasto" = saída fora de `CATEGORIAS_NEUTRAS` e de Investimentos (Aportes).

- **Reembolso / Dividir** (26/09, `src/lib/reembolso.ts`): conta dividida ou racha — o Pix recebido vira "Reembolso" e abate os gastos vinculados no mês de cada gasto; **só a sobra** (Pix maior que os gastos, ex.: diária do SENAC R$ 980 menos R$ 565,19 de gastos) conta como entrada. No Pix, `valorReembolsado` = quanto dele abateu gastos (migração `20260926230000_reembolso_sobra` preencheu os existentes); Reembolso sem vínculo conta inteiro como entrada. Todas as somas usam `valorLiquido()`/`comValorLiquido()` logo após ler do banco (dashboard, resumo, matriz, previsão, Planejado × Realizado, `carregarLancamentos` dos painéis e do histórico). Um Pix para vários gastos é distribuído em proporção ao que falta reembolsar de cada um, sem passar do valor do gasto (`distribuirReembolso`). Excluir um gasto devolve a parte dele à sobra do Pix (`recalcularPixes`). **Padrão mensal** (26/09, `src/lib/reembolso-padroes.ts`): cada Pix dividido com um único gasto ensina "contraparte do Pix → contraparte do gasto" (`chaveContraparte` ignora o texto do banco e sufixos S.A./LTDA: "PIX RECEBIDO · JANAINA" = "Pix recebido de JANAINA"; "TIM SA" = "Pix enviado para TIM S A"). Um Pix novo do mesmo pagador com valor ±10% da mediana é ligado ao gasto daquela contraparte mais próximo na data (45 dias antes a 15 depois) com saldo a reembolsar — automaticamente na importação (`aplicarPadroes`, resposta `reembolsosVinculados`), pré-marcado no painel e, logo depois de dividir, oferecido para os Pix antigos parecidos ("Dividir os N").

- **Previsão** (27/09, `src/lib/previsao.ts`): uma base por vez — "fotografia" (itens planejados) ou "historico" (média dos 6 meses fechados de toda categoria de gasto com gasto nos últimos 3 meses). Parcelas em andamento ("(n/m)" ou "Parcela n/m", ocorrência mais recente) entram nas duas e saem das médias. Cada linha traz planejado × histórico da categoria; na base fotografia, as categorias com gasto recente fora do plano aparecem à parte (não somam). Categorias encerradas (`UserProfile.previsaoEncerradas`, migração `20260927010000_previsao_encerradas`, PATCH `/api/previsao`) valem zero nas duas bases.

## 5. Motor de importação (src/lib/importacao/)

`engine.ts:importar()` decide o parser:
1. `perfil.builtin` legado ("c6-credito", "c6-debito", "nubank-credito", "nubank-debito") → parsers fixos em `src/lib/parsers.ts` (caminho legado mantido por compatibilidade).
2. formato "ofx" → `ofx.ts:parseOFX()`.
3. formato "pdf" → `pdf.ts:parsePDF()`.
4. formato "csv" → `csv.ts:parseCSVGenerico()` com mapeamento de colunas do perfil.

`detectar.ts`: detecção automática de formato (extensão + magic bytes/cabeçalho), de banco OFX via FID BACEN (Itaú 0341, Bradesco 0237, Santander 0033, BB 0001, Caixa 0104, Inter 0077, Sicoob 0756, Sicredi 0748) ou ORG (Nubank), e do layout CSV de fatura C6. Também `sugerirPapeis()` — heurística p/ pré-preencher colunas de CSV desconhecido.

Perfis nativos são criados automaticamente por usuário no primeiro GET `/api/perfis` (`ensureBuiltinPerfis`): 10 OFX de conta corrente, 5 PDF de fatura de cartão (Nubank, C6, Itaú, Bradesco, Inter) e o CSV de fatura C6. O CSV C6 predefine as colunas, inverte o sinal, exige mês de referência e incorpora a parcela à descrição (`Compra (N/M)`). Perfis builtin não podem ser excluídos (DELETE filtra `builtin: null`); podem ser ativados/desativados (campo `ativo`, PATCH).

**Sofisa (26/09)**: perfil nativo `sofisa-extrato-pdf` (conta "Sofisa", extrato de conta em PDF, sem mês de referência — `parseSofisa` em `pdf.ts`; linhas "Saldo em" ignoradas). É onde fica a reserva (CDB DIRETO DI): aplicação vira Investimentos (−) e resgate vira Investimentos (+), então o "Guardado" é líquido (aplicado − resgatado) e mês negativo aparece como "Resgatado da reserva" no dashboard e em Como você pagou. O Sofisa mascara o nome ("GERSON XXXXXX XXXXXXXXXXX NETO") — regra de transferência entre contas cobre. **pdf-parse v2**: `extrairTextoPDF` usa a classe `PDFParse` (a chamada como função da v1 quebrava toda leitura de PDF desde a atualização); os leitores de fatura em PDF foram escritos para o texto da v1 e não foram revalidados.

**Itaú em PDF (26/09)**: `detectarBancoPDF` testa o Itaú antes do Nubank — o extrato da conta cita "PAG BOLETO NU PAGAMENTOS SA" e era lido como fatura Nubank (0 lançamentos). Novo perfil `itau-extrato-pdf` (conta "Itaú Corrente", a mesma do OFX; sem mês de referência; linhas "SALDO DO DIA" ignoradas). `parseItau` (fatura) reescrito para o texto da v2: ignora o bloco "Pagamentos efetuados" (quitação da fatura anterior, que entrava como renda) e "Compras parceladas - próximas faturas"; mantém a parcela na descrição ("LOJA (05/06)", a Previsão usa); sem mês informado usa o vencimento. A soma bate com "Total desta fatura". Regras novas dos termos do extrato Itaú: FATURA PAGA/FATURA ITAU → Pagamento de Cartão; REMUNERACAO/SALARIO e PAGTO SALARIO → Salário; REND PAGO APLIC → Rendimento; PIX TRANSF → Transferência Recebida/para Terceiros (PIX QRS é compra); SEG VIDA → Seguros; GPS → Impostos; CANCELAMENTO DE COMPRA/DEV PIX → Estorno.

**Nome do usuário nas regras (26/09)**: nada de nome de pessoa no código (o produto é multiusuário). `UserProfile.nomeCompleto` (preenchido no login com o nome da conta Google, editável em Configurações › Importação, `/api/perfil`) alimenta `ehNomeProprio` (`src/lib/nome-proprio.ts`), que reconhece as grafias dos bancos — "NOME SOBRENOME", corte ("SOB"), iniciais, "NT" = Neto, nomes do meio mascarados — e marca Transferência entre Contas. Exige o primeiro nome + o último sobrenome ou duas partes; só primeiro + um do meio não basta (cobrança em nome do usuário). Sai a lista fixa `NOMES_PROPRIOS`, a agência fixa e a imobiliária específica (virou "imobiliaria" genérico em entradas).

**Fatura em OFX para todos os bancos (01/10)**: só o Nubank tinha perfil de fatura em OFX; os demais caíam em "ainda não tem perfil". `detectarBancoOFX` acha o banco pelo FID numérico ("1", "001" e "0001" = BB) ou pelo ORG e devolve `<banco>-corrente-ofx` ou `<banco>-cartao-ofx` (CREDITCARDMSGSRSV1). Perfis novos de fatura OFX para BB, Itaú, Bradesco, Santander, Caixa, Inter, Sicoob e Sicredi (conta "<Banco> Cartão", a mesma da fatura em PDF quando existe). Na fatura em OFX, crédito não é renda: "PGTO/PAGAMENTO" → Pagamento de Cartão; o resto → Estorno (antes caíam em Outras Entradas). Onboarding agrupa os bancos por conta × fatura (usaMesReferencia), com o formato no nome, e inclui os CSV. Validado com faturas reais do BB (Ourocard): a soma sem o pagamento bate com o BALAMT da fatura. Parcelas do BB ("PARC 02/12", "LOJA 05/05 CIDADE") viram "(02/12)" na fatura em OFX (`marcarParcela`), para a Previsão. Regras do extrato BB: "Pagto cartão crédito" → Pagamento de Cartão (sem isso a fatura contava duas vezes), "Juros Saldo Devedor" → Taxas, "Pagto conta telefone/luz/água" → Contas de Consumo.

**Ambiente de testes (01/10)**: Postgres 17 local em Docker (`docker-compose.test.yml`, porta 54329, sem volume) e servidor na porta 3100 com `.env.test` (versionado: só valores locais/fictícios; toda chave do `.env` tem par lá, inclusive `GEMINI_API_KEY` vazia). `scripts/teste/com-env-teste.mjs` carrega o `.env.test` **sobrescrevendo** o ambiente (`node --env-file` não serve: o Next repassa as opções aos filhos; `process.loadEnvFile` não sobrescreve). Login de teste (`src/lib/login-teste.ts`, provider Credentials "teste"): Ana (6 meses de dados) e Bruno (conta nova), só com NODE_ENV ≠ production **e** `AUTH_TEST_LOGIN=1` **e** banco em localhost. Comandos: `npm run db:teste:up`, `npm run db:teste:preparar` (zera, `prisma db push`, semeia — recusa banco não local), `npm run dev:teste`, `npm run test:e2e` (Playwright; o globalSetup prepara o banco). Suítes em `e2e/`: onboarding de conta nova (pega o defeito de 01/10 — conferido reintroduzindo-o), as 14 páginas do menu sem erro de JS/console/5xx, nenhuma API responde sem sessão, e uma conta não lê/altera dados de outra. **Achado**: as migrações não recriam o banco do zero — a `20260723120000_lancamento_tenant_indexes` indexa `Lancamento.userId`, que (como `UserProfile`, `PerfilImportacao`…) entrou em produção fora das migrações; por isso o banco de testes usa `db push`. Corrigir exige uma migração de alinhamento idempotente, com cuidado em produção.

**Combustível e Estacionamento (01/10)**: categorias novas no grupo Transporte (antes tudo ia para Automóvel). Regras: postos (Vibra, Petrobras/"PETROBRASPREM", Premmia, "PETRÓLEO" na razão social, Ipiranga, Shell, "posto" no início de palavra — não pega "imposto"/"postagem") → Combustível; PARKFOR, Repark, Estapar, Zona Azul, app ZUL, Big Park, BestPark, "estacio…" → Estacionamento; tag de pedágio, pneus, baterias, autopeças, oficina, mecânica, lava-jato, locadora, concessionária → Automóvel. Fotografia: sugestões "Combustível" e "Estacionamento (mensal)".

**Mesmo pagamento, descrições diferentes (01/10)**: o BB grava o mesmo boleto como "Pagamento de Boleto - X", "… X LTDA - Data balanc", "… X - Data balanc.: 04", e o Pix como "Pix - Enviado - 04/09 12:18 X". `src/lib/estabelecimento.ts`: `semRuido` (chaves: tira boleto, "Data balanc.", LTDA/S.A., data/hora do Pix BB e o converte em "Pix enviado para X" — **mantém a direção**, senão uma regra de Pix enviado valeria para o recebido) e `nomeDoEstabelecimento` (Matriz: também sem o meio de pagamento). `chaveMemoria` usa `semRuido`; o texto gravado não muda (a detecção de duplicados usa a descrição original). Revisar agrupa por chave (`S|`/`E|` + chave, nunca mistura entrada e saída), aplica pelos ids do grupo e ensina a Memória uma vez por chave. **Mesmo pagamento** (tabela `Apelido`, migração `20261001200000_apelido`): o usuário junta nomes diferentes do mesmo compromisso (AYMORE → SANTANDER, Pix + boleto da escola) — Lançamentos › selecionar › "Mesmo pagamento…" (nome novo ou existente); Configurações › Mesmo pagamento renomeia/desfaz. `chaveAgrupada` (categorias.ts) usa o nome comum no histórico (a categoria de um vira sugestão para o outro), na Matriz (uma linha) e na Revisão (um grupo, "🔗 nome"). API `/api/apelidos` (GET/POST/PATCH/DELETE, escopo do usuário).

**Contas por banco — etapa 1 (04/10)**: estrutura Banco → Conta (banco + Débito/Crédito + apelido) → perfis de importação. `src/lib/bancos.ts`: catálogo `BANCOS`, `nomeDaConta` ("Nubank · Débito", "Nubank · Crédito · final 1234", "Outro · Carteira" — o nome nunca é digitado), `contaNativa(builtin)` (perfil nativo → banco/tipo pela chave) e `interpretarNomeAntigo` (migração: "Nubank Conta"/"Nubank Débito" → Nubank · Débito, "Itaú Poupança" → Itaú · Débito · Poupança, desconhecido → Outro). Internamente o tipo segue "corrente" | "cartao". `Conta` ganhou `banco` e `apelido`; `PerfilImportacao` ganhou `banco` e `tipoConta` (migração `20261004120000_contas_por_banco`). O lançamento continua guardando o nome (texto), mas ele sai sempre do cadastro — renomear apelido atualiza todos; referência por id fica para depois. Perfis nativos e leitores antigos de CSV usam o nome gerado; o filtro de contas de Lançamentos deixou de ser uma lista fixa. `scripts/migrar-contas.ts` (prévia por padrão; `--aplicar <pasta>` com backup e transação, conferindo o total de lançamentos) usa `planejarMigracao` (`src/lib/migracao-contas.ts`, puro e testado), respeitando o tipo que o usuário escolheu em Configurações › Contas. Próximas etapas: importação resolve conta por banco+tipo (perguntando se houver apelidos), telas por banco, e trava de unicidade (userId, banco, tipo, apelido).

**Contas por banco — etapa 2 (04/10)**: a importação decide a conta pelo banco + tipo do perfil (`bancoTipoDoPerfil`, `destinoDaImportacao`, `resolverConta` em `src/lib/contas.ts`): nenhuma conta desse banco/tipo → a padrão ("Nubank · Crédito", registrada quando os lançamentos chegam); uma → ela; mais de uma (apelidos) → `/api/importar` devolve 409 com as opções até receber `conta`. `GET /api/contas/destino?perfilId=` alimenta `DestinoConta` ("Vai para a conta X" ou "Em qual conta?") nas telas de confirmação de arquivo único e em cada item do lote (o lote espera a escolha como espera o mês da fatura). `POST /api/contas` cria conta com apelido (banco do catálogo, "Outro" exige nome). Nome que ainda chega digitado (perfil personalizado, lançamento manual) é padronizado por `padronizarConta` ("Carteira" → "Outro · Carteira"; nome já no registro é mantido).

**Regras e chaves no formato do BB (04/10)**: as regras de categoria tentam a descrição como veio e, se nada casar (em entradas, "Outras Entradas" conta como nada), a descrição limpa por `semRuido` — o BB escreve "Pix - Enviado - 04/09 12:36 FULANO" e "Pagamento de Boleto - X". A chave do estabelecimento tira a cidade das compras de cartão em qualquer banco quando vem separada por 2+ espaços e termina em "BR"/"BRA" (BB), além da largura fixa do C6; `marcarParcela` deixou de juntar espaços para não apagar essa separação. Vale para todo cliente do BB, não para um usuário. e2e: `expect.timeout` 15 s (servidor de teste em dev compila a rota na 1ª chamada); se a suíte ficar lenta, procure um `next-server` antigo preso na porta 3100 — o Playwright o reaproveita.

**Contas por banco — etapa 3 (04/10)**: telas sem nome de conta digitado. `SeletorConta` (banco + Débito/Crédito + apelido; "Outro" pede nome) substitui o campo "Conta" na criação de perfil personalizado (OFX, PDF, CSV), na edição de perfil (Configurações › Importação) e no lançamento manual (lista das contas, das mais usadas para as menos, + "Outra conta…"). Configurações › Contas (`ContasPorBanco`, substitui `ContasTipo`): um cartão por banco, Débito/Crédito com contagem e formatos ativos, apelido, troca de tipo, criar e excluir. `PATCH /api/contas` aceita apelido/tipo e renomeia em cascata (lançamentos, reservas, perfis) numa transação; `DELETE` só exclui conta vazia.

**Contas por banco — etapa 4 (04/10)**: trava no banco `@@unique([userId, banco, tipo, apelido])` em `Conta` (migração `20261004150000_conta_unica_por_banco`, conferida antes em produção: nenhuma combinação repetida); `POST`/`PATCH /api/contas` tratam a recusa (P2002) como 409. Limpeza do nome livre: o catálogo de perfis nativos não tem mais nome de conta (sai de `contaNativa`), os leitores antigos de CSV do C6/Nubank recebem a conta do perfil (sem nomes fixos), e `tipoSugerido` (finanças) usa a mesma leitura de `lib/bancos.ts`. Continuam: `PerfilImportacao.conta` (cópia do nome, usada na tela de perfis) e `scripts/migrar-contas.ts` (idempotente; útil se aparecer nome fora do formato).

## 6. Categorização (POST /api/categorizar e também na importação)

Ordem em `categorizarComOrigem()` (`src/lib/categorias.ts`), com Memória + histórico carregados por `carregarMemoriaCategorizacao()` (`src/lib/memoria.ts`):

1. **Memória Local**: regras salvas (MemoriaIA), comparadas pela `chaveMemoria()` — sem data/hora/parcela, sem cidade+BRA do extrato C6 (largura fixa 22+13), sem "Pix no Crédito - ", "Compra no débito - " e " - NuPay" do Nubank. Assim `DROGASIL 2460 FORTALEZA BRA`, `DROGASIL 2460 (2/2)` e parcelas diferentes caem na mesma chave.
2. **Delivery** (qualquer "delivery", "ifood", "ifd*", "rappi"; exceto iFood Club): vence o histórico por decisão do Gerson (26/09) — delivery separado de Restaurantes.
3. **Histórico** (26/09): o que o próprio usuário já categorizou, por `tipo|chave`; vale quando a mesma chave teve a mesma categoria em ≥ 75% das vezes. O coringa "Transferência para Terceiros" nunca é sugerido pelo histórico. Antes disso só a Memória (65 regras) era consultada e os 3 mil lançamentos categorizados eram ignorados.
4. **Regras**: cascata de padrões em `regras()` (nomes próprios, fornecedores locais, e genéricos: pizza/restaurante/churrascaria, drogaria/Drogasil, atacadões, Mercado Livre/Amazon, prefeitura, estacionamentos conhecidos, "POP 13AGO 17H41MIN" = 99 na fatura C6, Pix com mensagem "Emprestimo").
5. **Gemini** (só se `usarGemini: true`): REST p/ `gemini-2.0-flash-lite`, JSON schema com `categoria_sugerida`, temperature 0, sleep 1100ms entre chamadas (rate limit), erros ignorados silenciosamente. Sem `GEMINI_API_KEY`, a fase é pulada.

**Prestação de Imóvel** (26/09): categoria de Moradia e fixa, para o financiamento do apartamento do Passaré (pago por Pix para a conta da Janaina na Caixa — regra na Memória — e pelo débito `GCI CAIXA - HABITACAO`, coberto por regra). Na Fotografia, a sugestão "Aluguel / financiamento" virou "Aluguel" e "Prestação do imóvel". **Compra e Venda de Bens** (26/09, substituiu "Compra de Imóvel"): categoria genérica e **neutra** (em `CATEGORIAS_NEUTRAS`) para patrimônio mudando de forma — venda/compra de imóvel, carro — junto com os custos da operação (comissão, ITBI, cartório, vistoria), como na contabilidade (a comissão reduz o valor da venda). Usada na venda do apto do Passaré: sinal R$ 5.000 (20/07) + R$ 94.300 (01/09), comissões R$ 19.000 (02/09) e vistoria da Caixa R$ 750. Regras: ITBI, "registro de imóveis", "CAIXA ECONOMICA FEDERAL - ENGENHARIA", "sinal CV", "comissão apartamento". **Pagamento de Empréstimos** (26/09): quitação de dívida própria (empréstimo na previdência Inovaprev, financiamento Santander, consignado, crédito pessoal) — conta como gasto; ≠ "Empréstimo" (dinheiro emprestado a alguém). Regra: "SOC. CRED. FINANC.", consignado, empréstimo/crédito pessoal. Pix parcelado no cartão (C6): o crédito "Crédito Pix parcelado no cartão" e o Pix pago com ele são movimentação interna; o gasto real é a cobrança na fatura (com juros). **Aportes fora dos gastos** (26/09): dashboard e Planejado × Realizado não somam Investimentos (Aportes) nas saídas; o dashboard mostra o cartão "Guardado" (`investido`).

## 7. Catálogo de APIs (todas exigem sessão; 401 caso contrário)

| Rota | Métodos | Função |
|---|---|---|
| `/api/lancamentos/agrupados` | GET (categoria, descricao?) | Grupos por descrição exata para o Revisar; com `descricao`, os itens do grupo |
| `/api/lancamentos` | GET (filtros+paginação), POST, PATCH, PUT (recategorização em lote por ids/descricaoContem/categoriaErrada), DELETE | CRUD de lançamentos |
| `/api/resumo` | GET | Totais + breakdown por categoria com mesmos filtros dos lançamentos |
| `/api/dashboard` | GET (ano, mes?) | Totais, top 15 categorias, série mensal, por conta |
| `/api/matriz` | GET | Matriz categoria × mês com drill-down por descrição normalizada (`normalizarDescricao` remove prefixos bancários/CNPJ e aplica nomes canônicos) |
| `/api/previsao` | GET | 12 meses futuros: parcelamentos (regex `(N/M)` na descrição) + média de categorias fixas |
| `/api/emprestimos` | GET | Agrupamento por pessoa; status aberto/parcial/quitado |
| `/api/memoria-ia` | GET, POST (upsert), DELETE | Regras da memória |
| `/api/categorizar` | POST | Categorização 3 fases |
| `/api/perfis` | GET (`?todos=true` inclui inativos), POST, PATCH (ativo), DELETE | Perfis de importação |
| `/api/lancamentos/agrupados` | GET (`categoria` = `__sem__` ou nome) | Agrupa lançamentos pela descrição exata (quantidade, total, última data, contas) — base de `/lancamentos/revisar`; PUT `/api/lancamentos` aceita `descricaoExata` + `somenteSemCategoria` para aplicar ao grupo |
| `/api/importar/analisar` | POST (arquivo) | Análise sem gravar: formato, banco, perfil nativo do usuário, total/novos/duplicados, período e mês de referência sugerido (faturas). Base da importação em lote |
| `/api/onboarding` | PATCH | Marca onboarding completo + salva nome |
| `/api/planejamento` | GET, PUT | Fotografia do mês: itens + margem + totais; PUT substitui o conjunto inteiro numa transação (`concluir: true` grava `fotografiaConcluidaEm`) |
| `/api/contas` | GET, PATCH | Contas do usuário com tipo e nº de lançamentos (cria as que faltam); PATCH `{id, tipo}` |
| `/api/financas/meios` | GET (ano, mes) | Gasto por meio de pagamento no mês e nos 5 anteriores + média |
| `/api/financas/ritmo` | GET (ano, mes) | Acumulado diário × média, projeção de fim de mês e cartão do mês |
| `/api/financas/divida` | GET (ano, mes) | Juros/IOF/multas nos 12 meses até o mês, maiores lançamentos, por origem e principal |
| `/api/reembolsos` | GET (entradaId), PUT | Gastos que um Pix reembolsa; PUT `{entradaId, saidaIds}` define os vínculos (vazio = desfazer), marca/desmarca "Reembolso" e recalcula os gastos |
| `/api/reembolsos/candidatos` | GET (entradaId, busca) | `{gastos, sugerido}`: gastos para vincular (perto da data do Pix, ou pela descrição) e o que o padrão aprendido sugere |
| `/api/reembolsos/parecidos` | GET (entradaId) | Outros Pix do mesmo pagador ainda sem divisão e o gasto sugerido para cada um (não grava) |
| `/api/reembolsos/aplicar` | POST `{entradaIds}` | Divide pelos padrões os Pix confirmados; os pares são recalculados no servidor |
| `/api/reservas` | GET, POST, PATCH, DELETE | Reservas com saldo estimado e movimentos desde o saldo informado; totais disponível/bloqueado |
| `/api/planejamento/historico` | GET | Por categoria, nos 12 meses fechados: grupo provável, mediana/média dos 6 últimos, total anual e maiores estabelecimentos — sugestões da Fotografia |
| `/api/planejamento/realizado` | GET (ano, mes) | Planejado (mensalizado para o mês) × realizado por categoria, entradas, saídas, margem e gastos não planejados |

## 8. Páginas (frontend)

`/` dashboard (lembrete/card da fotografia, estado vazio com CTAs; cartões Como você pagou, Ritmo do mês e Custo de dívida do mês escolhido — em "Ano todo", o mês corrente) · `/financas/meios` (6 meses por meio de pagamento, barras empilhadas + tabela) · `/financas/divida` (12 meses de juros/IOF/multas, de onde vem, o que fazer) · `/planejamento` (abas Fotografia do mês e Planejado × Realizado; `?aba=comparacao`) · `/lancamentos/revisar` ("Revisar categorias": sem categoria e o coringa "Transferência para Terceiros" agrupados por descrição; aplica ao grupo e ensina a Memória Local; **"Ver os N"** abre o grupo e aplica só aos marcados — sem ensinar a Memória; Pix para pessoas não viram regra por padrão; Empréstimo pede a pessoa, já preenchida pelo nome do extrato) · `/lancamentos` (botão **+ Novo** = lançamento manual via `LancamentoForm`; `?novo=1` abre direto; **Dividir** nas entradas abre `DividirPainel` — busca com filtro ao digitar e seleção múltipla de gastos; escolher "Reembolso" no seletor também abre o painel; gastos mostram "−R$ X reembolsado") · `/matriz` · `/importar` (com `ComoBaixarExtrato`; aceita vários arquivos de uma vez → fila `ImportacaoLote` com análise por arquivo, mês da fatura sugerido e editável, importação sequencial, "Configurar" para os não reconhecidos e "Categorizar agora" ao final; um arquivo só segue o fluxo guiado de antes) · `/previsao` · `/emprestimos` · `/configuracoes/contas` (corrente/cartão) · `/configuracoes/importacao` (perfis de banco) · `/configuracoes/memoria` (Memória Local; `/memoria-ia` e `/configuracoes` redirecionam) · `/onboarding` (wizard 4 etapas: nome → fotografia do mês (opcional, "Fazer depois") → bancos → checklist de próximos passos) · `/login`.

Layout raiz (`src/app/layout.tsx`, Server Component): sem sessão ou onboarding incompleto → body sem Nav; caso contrário SessionProvider + Nav (9 links). Dados carregados client-side via fetch às APIs; sem Server Actions; sem estado global.

**Menu** (27/09, `src/components/Nav.tsx`): Dashboard · Planejamento · Importar Lançamentos · Lançamentos (└ Revisar categorias) · Ferramentas (Matriz, Previsão, Reserva, Empréstimos) · Configurações (Contas, Importação, Memória Local). Grupos abrem/fecham; o da página atual vem aberto.

## 9. Variáveis de ambiente

| Var | Obrigatória | Uso |
|---|---|---|
| `DATABASE_URL` | sim | Neon, com `?sslmode=require` |
| `AUTH_SECRET` | sim | Assinatura JWT NextAuth |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | sim | OAuth Google |
| `GEMINI_API_KEY` | não | Fase 3 da categorização |
| `ALLOWED_EMAILS` | não | Lista de e-mails, vírgula; default gersonvan@gmail.com |

Migrações: `npx prisma migrate dev` (dev) / `npx prisma migrate deploy` (prod), manual, não roda no boot. `prisma.config.ts` carrega dotenv.

## 10. Andamento atual (o que está pronto)

- ✅ CRUD completo de lançamentos com filtros e paginação
- ✅ Motor de importação genérico (CSV/OFX/PDF) + perfis nativos de 10+ bancos + detecção automática
- ✅ Parsers legados C6/Nubank preservados
- ✅ Categorização em 3 fases (memória, regras, Gemini)
- ✅ Dashboard, matriz, previsão, empréstimos, memória IA, configurações
- ✅ Autenticação Google + lista de e-mails permitidos
- ✅ Multi-tenancy por userId em todas as tabelas e APIs
- ✅ Onboarding de novos usuários (3 etapas) com auto-graduação de usuários existentes
- ✅ Fix do deploy Vercel (split auth.config.ts/auth.ts para Edge Runtime) — commit `25896ef`
- ✅ Documentação PADTec L2 completa em `docs/` (16 arquivos: 01–11, auth, banco-de-dados, integracoes-externas, multi-tenancy, 13-glossario) — gerada em 2026-07-23
- ✅ Framework PADTec copiado para `padtec/` no projeto (templates L1/L2/L3, prompts, checklist)
- ✅ Edição de perfis de importação personalizados e coluna de parcela no CSV (`colParcela`) — commits `681e084`, `1b9b92e` (06/08)
- ✅ Limpeza de dados (25/09): desfeito lote OFX do C6 que duplicou meses já importados via CSV (374; backup em scratchpad da sessão), removidos 6 lançamentos Nubank com datas 2008–2016 (perfil com formato de data errado — corrigido), 1 linha "Saldo do dia" do BB e 1 Pix duplicado; contas do C6 unificadas em "C6 Débito"/"C6 Crédito". Importador passou a descartar saldo/valor zero/datas impossíveis e a análise avisa "mesmo extrato em outro formato"
- ✅ Importação de vários extratos de uma vez (25/09): análise por arquivo no servidor, fila com status, mês de referência sugerido (vencimento do PDF ou compra mais recente + 10 dias — acerta as 12 últimas faturas C6), deduplicação entre arquivos por importação sequencial
- ✅ Layout para celular (24/09): menu superior no celular, grids empilhados, lançamentos em cartões
- ✅ Fotografia do mês + nova jornada de entrada (20/09): wizard no onboarding e em `/planejamento`, Planejado × Realizado, Previsão com base na fotografia, lançamento manual, estados vazios e ajuda de download de extrato — pensado para a irmã do Gerson como primeira usuária externa
- ✅ Fase 1 dos painéis (26/09): tipo de conta (corrente/cartão) em Configurações, cartões do dashboard Como você pagou / Ritmo do mês / Custo de dívida e páginas `/financas/meios` e `/financas/divida`. Protótipo de referência: artifact "FinanceiroWeb — Fase 1". Próximas fases das ideias de gráficos (categoria × média/previsão etc.) ainda não priorizadas
- ✅ Revisão de segurança (20/09): upgrade Next 16.3.5 / next-auth beta.32 / Prisma 7.10 (CVEs críticos), validação zod em todas as APIs, cabeçalhos de segurança + CSP, sessão de 7 dias com allowlist por requisição, migração `middleware.ts` → `src/proxy.ts`, chave Gemini no header e teto de 50 chamadas/requisição, unique em perfis nativos

## 11. Backlog / próximos passos e dívidas conhecidas

Itens identificados como carência na documentação ou pendências naturais (nenhum foi explicitamente priorizado pelo Gerson ainda — confirmar antes de atacar):

**Dívidas técnicas / riscos**
- Cobertura automatizada: Vitest com 26 testes (helpers de tenant, CRUD e validação de lançamentos, categorização, importadores). Ainda faltam testes de perfis, memória, onboarding e interface.
- **Histórico de migrações incompleto**: `UserProfile` e `PerfilImportacao` existem em produção mas nenhuma migração as cria (foram levadas por `db push`). A migração `20260920150000_planejamento` usa `IF NOT EXISTS` para conviver com isso; um banco novo a partir de `migrate deploy` ainda ficaria sem `PerfilImportacao`. Vale criar uma migração-baseline.
- **Fuso horário**: `mesReferencia` e datas importadas são gravados à meia-noite UTC. Limites de mês devem usar `Date.UTC` (dashboard e Planejado × Realizado já usam; corrigido em 24/09 — com servidor fora de UTC o dashboard local mostrava o mês errado). Previsão e importadores ainda usam `new Date(ano, mes, dia)` local — corretos na Vercel (UTC), frágeis fora dela.
- **Dev local e auth**: `.env` precisa de `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` (cliente OAuth "FinanceiroWeb" no projeto `x-object-496819-e3` da conta gersonvan.com.br; redirect `http://localhost:3000/api/auth/callback/google` já cadastrado). `auth.config.ts` referencia `process.env.AUTH_SECRET` explicitamente porque o bundle do proxy não resolve a leitura feita dentro do next-auth.
- **C6 conta corrente — qual perfil usar**: o perfil personalizado "C6 Débito" (id 21) lê só a coluna Título, e compras no débito viram "DEBITO DE CARTAO" sem a loja; o legado "C6 Bank — Extrato Débito" (`c6-debito`, `parseExtratoC6`) usa o detalhe nesses casos. Preferir o legado. O OFX do C6 traz descrições genéricas ("TRANSF ENVIADA PIX OB", "Boleto"), mas é o único que carrega a mensagem digitada no Pix (ex.: "Contador Jun_26"). Não misturar formatos na mesma conta: a deduplicação é por data+descrição+valor.
- `CONTAS` do filtro de `/lancamentos` é lista fixa das contas do Gerson; para outros usuários deveria vir dos perfis (o formulário manual já faz isso).
- `npm audit` ainda acusa 4 itens *high* dentro do CLI do Prisma (`@prisma/config`, `deepmerge-ts`, `mysql2`): ferramenta de dev, não vão para o bundle; o "fix" sugerido é downgrade para Prisma 6 — ignorar até o Prisma 7 corrigir.
- Sem rate limiting nas APIs e sem checagem de `Origin` (CSRF depende do cookie `SameSite=Lax` do Auth.js).
- Isolamento multi-tenant possui helpers de aplicação (`escopoDoUsuario`, `dadosDoUsuario`, `dadosAtualizaveisDoUsuario`), mas continua sem RLS no Postgres ou interceptor Prisma; uma query nova que ignore os helpers ainda poderia vazar dados.
- Categorização usa transações para cada lote local (Memória IA e regras). A fase Gemini continua individual para não manter transação aberta durante chamadas externas e rate limit.
- Parsers legados C6/Nubank duplicam lógica do motor genérico (considerar migrar para perfis genéricos e aposentar `parsers.ts`).
- Regras de categorização em `mapearCategoria()` são hardcoded e pessoais do Gerson (nomes próprios, fornecedores) — para SaaS real, precisariam virar dados por usuário.
- `NOMES_PROPRIOS` hardcoded em `src/lib/categorias.ts` — mesmo problema.
- Sem CI/CD além do deploy automático Vercel; sem monitoramento/health check; sem trilha de auditoria de login.
- Sem gestão de ciclo de vida de tenant (suspensão/remoção de dados de um usuário).

**Funcional (fora de escopo atual, candidatos futuros)**
- Interface de administração de usuários (hoje `ALLOWED_EMAILS` é env var).
- Orçamento/metas por categoria.
- Notificações.
- Open Banking para importação automática.
- Cobrança por assinatura (o Gerson mencionou que a estrutura multi-tenant é pensada para "sistemas com cobrança de uso por assinatura").

## 12. Convenções de trabalho (importante para qualquer IA)

- Idioma do projeto e do usuário: **português (BR)** — código com nomes em português (descricao, lancamento, etc.).
- `AGENTS.md` do projeto avisa: Next.js 16 difere do conhecimento de treino; ler docs em `node_modules/next/dist/docs/` antes de codar.
- Antes de comandos destrutivos de git: `git status` + stash/commit do que estiver pendente.
- Commits: mensagens descritivas; deploy é automático no push.
- O usuário tem experiência com Apps Script; explicações técnicas podem ser diretas mas sem assumir profundidade em Next/React.
- Documentação viva em `docs/` segue o framework PADTec (evidência `arquivo:linha`, marcador `// CARÊNCIA:` quando não há evidência no código). Ao alterar o sistema, atualizar os docs correspondentes.

## 13. Mapa de arquivos-chave

```
financeiro-web/
├── next.config.ts             # serverExternalPackages (não remover) + cabeçalhos de segurança/CSP
├── prisma/schema.prisma       # 6 models
├── src/
│   ├── proxy.ts               # Gate de sessão + redirect onboarding (NUNCA importar Prisma aqui)
│   ├── auth.ts                # NextAuth completo (Node, Prisma, callbacks JWT, allowlist por requisição)
│   ├── auth.config.ts         # NextAuth mínimo (Edge)
│   ├── types/next-auth.d.ts   # Augment de Session/JWT com onboardingCompleto
│   ├── lib/
│   │   ├── db.ts              # Prisma singleton + PrismaPg + pg.Pool
│   │   ├── session.ts         # getSessionUserId()
│   │   ├── tenant.ts          # escopoDoUsuario / dadosDoUsuario (isolamento)
│   │   ├── validacao.ts       # zod: validar(), lerCorpo(), lerQuery(), lerArquivo()
│   │   ├── planejamento.ts    # Fotografia do mês: mensalização, totais, planejado por categoria
│   │   ├── planejamento-sugestoes.ts # chips do wizard (nome → categoria)
│   │   ├── financas.ts        # painéis: meio de pagamento, custo de dívida, ritmo do mês (puro)
│   │   ├── financas-dados.ts  # carga de lançamentos por competência para /api/financas
│   │   ├── contas.ts          # garantirContas / tiposDasContas
│   │   ├── filtros.ts         # filtros de período compartilhados (lancamentos/resumo/matriz)
│   │   ├── categorias.ts      # CATEGORIAS + mapearCategoria() (regras)
│   │   ├── parsers.ts         # Parsers legados C6/Nubank
│   │   └── importacao/        # engine, csv, ofx, pdf, detectar, tipos
│   ├── components/
│   │   ├── Nav.tsx
│   │   ├── LancamentoForm.tsx         # lançamento manual (modal)
│   │   ├── ComoBaixarExtrato.tsx      # ajuda de download (onboarding + importar)
│   │   ├── ContasTipo.tsx             # Configurações → Contas (corrente/cartão)
│   │   ├── financas/                  # PaineisFinancas (dashboard), NavegadorMes, comum (cores/tipos)
│   │   └── planejamento/              # FotografiaWizard, PlanejadoRealizado
│   └── app/
│       ├── layout.tsx         # Sessão + Nav condicional
│       ├── onboarding/page.tsx    # 4 passos
│       ├── planejamento/page.tsx  # Fotografia + Planejado × Realizado
│       └── api/*/route.ts     # 12 endpoints
├── docs/                      # Documentação PADTec L2 (16 arquivos)
├── padtec/                    # Framework de documentação (templates/prompts)
├── SETUP.md                   # Setup de env vars e deploy
└── AGENTS.md / CLAUDE.md      # Instruções para agentes
```
