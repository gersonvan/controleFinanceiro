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
- **Categorias**: lista estática de 41 categorias em `src/lib/categorias.ts` (const `CATEGORIAS`). Adicionar categoria = mudança de código (e o `categoriaSchema` da validação passa a aceitá-la). Subconjuntos: `CATEGORIAS_FIXAS` (previsão), `CATEGORIAS_EMPRESTIMO`, `CATEGORIAS_NEUTRAS` (movimentação interna, excluída dos totais do dashboard, resumo e Planejado × Realizado). Em 20/09 entraram Plano de Saúde, Pets, Cuidados Pessoais, Presentes e Impostos e Tributos, com regras genéricas em `mapearCategoria`.
- **Fotografia do mês** (`/planejamento`): pré-configuração opcional e sugerida no onboarding — entradas, fixos, variáveis (mês/semana), sazonais (ano ÷ 12), parcelas e margem (% das entradas) → "sobra/falta". Alimenta o Planejado × Realizado (`/api/planejamento/realizado`) e a Previsão (categorias sem histórico ganham `tipoPrevisao: "Planejado"`; parcelas da fotografia não repetem parcelas já vistas nos lançamentos). Sugestões (chips) em `src/lib/planejamento-sugestoes.ts`. Inspirada na planilha de consultoria da irmã do Gerson — ideia, não cópia.

## 5. Motor de importação (src/lib/importacao/)

`engine.ts:importar()` decide o parser:
1. `perfil.builtin` legado ("c6-credito", "c6-debito", "nubank-credito", "nubank-debito") → parsers fixos em `src/lib/parsers.ts` (caminho legado mantido por compatibilidade).
2. formato "ofx" → `ofx.ts:parseOFX()`.
3. formato "pdf" → `pdf.ts:parsePDF()`.
4. formato "csv" → `csv.ts:parseCSVGenerico()` com mapeamento de colunas do perfil.

`detectar.ts`: detecção automática de formato (extensão + magic bytes/cabeçalho), de banco OFX via FID BACEN (Itaú 0341, Bradesco 0237, Santander 0033, BB 0001, Caixa 0104, Inter 0077, Sicoob 0756, Sicredi 0748) ou ORG (Nubank), e do layout CSV de fatura C6. Também `sugerirPapeis()` — heurística p/ pré-preencher colunas de CSV desconhecido.

Perfis nativos são criados automaticamente por usuário no primeiro GET `/api/perfis` (`ensureBuiltinPerfis`): 10 OFX de conta corrente, 5 PDF de fatura de cartão (Nubank, C6, Itaú, Bradesco, Inter) e o CSV de fatura C6. O CSV C6 predefine as colunas, inverte o sinal, exige mês de referência e incorpora a parcela à descrição (`Compra (N/M)`). Perfis builtin não podem ser excluídos (DELETE filtra `builtin: null`); podem ser ativados/desativados (campo `ativo`, PATCH).

## 6. Categorização (3 fases — POST /api/categorizar)

1. **Memória da IA**: match exato (lowercase) da descrição contra tabela MemoriaIA.
2. **Regras manuais**: `mapearCategoria()` em `src/lib/categorias.ts` — cascata de `includes()` com padrões pessoais do Gerson (nomes próprios, fornecedores locais de Fortaleza-CE, etc.).
3. **Gemini** (só se `usarGemini: true`): REST p/ `gemini-2.0-flash-lite`, JSON schema com `categoria_sugerida`, temperature 0, sleep 1100ms entre chamadas (rate limit), erros ignorados silenciosamente. Sem `GEMINI_API_KEY`, a fase é pulada.

## 7. Catálogo de APIs (todas exigem sessão; 401 caso contrário)

| Rota | Métodos | Função |
|---|---|---|
| `/api/lancamentos` | GET (filtros+paginação), POST, PATCH, PUT (recategorização em lote por ids/descricaoContem/categoriaErrada), DELETE | CRUD de lançamentos |
| `/api/resumo` | GET | Totais + breakdown por categoria com mesmos filtros dos lançamentos |
| `/api/dashboard` | GET (ano, mes?) | Totais, top 15 categorias, série mensal, por conta |
| `/api/matriz` | GET | Matriz categoria × mês com drill-down por descrição normalizada (`normalizarDescricao` remove prefixos bancários/CNPJ e aplica nomes canônicos) |
| `/api/previsao` | GET | 12 meses futuros: parcelamentos (regex `(N/M)` na descrição) + média de categorias fixas |
| `/api/emprestimos` | GET | Agrupamento por pessoa; status aberto/parcial/quitado |
| `/api/memoria-ia` | GET, POST (upsert), DELETE | Regras da memória |
| `/api/categorizar` | POST | Categorização 3 fases |
| `/api/perfis` | GET (`?todos=true` inclui inativos), POST, PATCH (ativo), DELETE | Perfis de importação |
| `/api/onboarding` | PATCH | Marca onboarding completo + salva nome |
| `/api/planejamento` | GET, PUT | Fotografia do mês: itens + margem + totais; PUT substitui o conjunto inteiro numa transação (`concluir: true` grava `fotografiaConcluidaEm`) |
| `/api/planejamento/realizado` | GET (ano, mes) | Planejado (mensalizado para o mês) × realizado por categoria, entradas, saídas, margem e gastos não planejados |

## 8. Páginas (frontend)

`/` dashboard (lembrete/card da fotografia, estado vazio com CTAs) · `/planejamento` (abas Fotografia do mês e Planejado × Realizado; `?aba=comparacao`) · `/lancamentos` (botão **+ Novo** = lançamento manual via `LancamentoForm`; `?novo=1` abre direto) · `/matriz` · `/importar` (com `ComoBaixarExtrato`) · `/previsao` · `/emprestimos` · `/memoria-ia` · `/configuracoes` (gerencia perfis) · `/onboarding` (wizard 4 etapas: nome → fotografia do mês (opcional, "Fazer depois") → bancos → checklist de próximos passos) · `/login`.

Layout raiz (`src/app/layout.tsx`, Server Component): sem sessão ou onboarding incompleto → body sem Nav; caso contrário SessionProvider + Nav (9 links). Dados carregados client-side via fetch às APIs; sem Server Actions; sem estado global.

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
- ✅ Fotografia do mês + nova jornada de entrada (20/09): wizard no onboarding e em `/planejamento`, Planejado × Realizado, Previsão com base na fotografia, lançamento manual, estados vazios e ajuda de download de extrato — pensado para a irmã do Gerson como primeira usuária externa
- ✅ Revisão de segurança (20/09): upgrade Next 16.3.5 / next-auth beta.32 / Prisma 7.10 (CVEs críticos), validação zod em todas as APIs, cabeçalhos de segurança + CSP, sessão de 7 dias com allowlist por requisição, migração `middleware.ts` → `src/proxy.ts`, chave Gemini no header e teto de 50 chamadas/requisição, unique em perfis nativos

## 11. Backlog / próximos passos e dívidas conhecidas

Itens identificados como carência na documentação ou pendências naturais (nenhum foi explicitamente priorizado pelo Gerson ainda — confirmar antes de atacar):

**Dívidas técnicas / riscos**
- Cobertura automatizada: Vitest com 26 testes (helpers de tenant, CRUD e validação de lançamentos, categorização, importadores). Ainda faltam testes de perfis, memória, onboarding e interface.
- **Histórico de migrações incompleto**: `UserProfile` e `PerfilImportacao` existem em produção mas nenhuma migração as cria (foram levadas por `db push`). A migração `20260920150000_planejamento` usa `IF NOT EXISTS` para conviver com isso; um banco novo a partir de `migrate deploy` ainda ficaria sem `PerfilImportacao`. Vale criar uma migração-baseline.
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
├── prisma/schema.prisma       # 4 models
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
│   │   ├── filtros.ts         # filtros de período compartilhados (lancamentos/resumo/matriz)
│   │   ├── categorias.ts      # CATEGORIAS + mapearCategoria() (regras)
│   │   ├── parsers.ts         # Parsers legados C6/Nubank
│   │   └── importacao/        # engine, csv, ofx, pdf, detectar, tipos
│   ├── components/
│   │   ├── Nav.tsx
│   │   ├── LancamentoForm.tsx         # lançamento manual (modal)
│   │   ├── ComoBaixarExtrato.tsx      # ajuda de download (onboarding + importar)
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
