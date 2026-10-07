# Glossário

Mínimo L2: 60 termos. Este glossário contém 75 termos do domínio do sistema financeiro-web.

---

| # | Termo | Definição neste sistema |
|---|---|---|
| 1 | **Lançamento** | Registro de uma transação financeira (crédito ou débito) importada ou criada manualmente. Entidade central do sistema. |
| 2 | **Entrada** | Tipo de lançamento que representa crédito na conta do usuário (`tipo = "Entrada"`). |
| 3 | **Saída** | Tipo de lançamento que representa débito na conta do usuário (`tipo = "Saída"`). |
| 4 | **Categoria** | Classificação semântica de um lançamento (ex: "Supermercado e Mercearia"). Lista estática de 36 categorias em `src/lib/categorias.ts`. |
| 5 | **Conta** | Identificador textual da conta ou cartão de origem do lançamento (ex: "Nubank Conta", "C6 Cartão"). |
| 6 | **Mês de referência** (`mesReferencia`) | Data de competência de um lançamento, distinta da data da transação. Usado para faturas de cartão de crédito. |
| 7 | **Categoria neutra** | Categoria que representa movimentação interna (ex: "Pagamento de Cartão de Crédito") e é excluída dos totais de receita/despesa real. |
| 8 | **Memória da IA** | Conjunto de regras de correção de categoria por descrição exata, aprendidas por interação do usuário. Entidade `MemoriaIA`. |
| 9 | **Perfil de importação** | Configuração de como interpretar um arquivo de extrato de um banco específico (mapeamento de colunas, formato de data, delimitador). Entidade `PerfilImportacao`. |
| 10 | **Perfil nativo** (`builtin`) | Perfil pré-configurado pelo sistema para um banco suportado. Identificado pelo campo `builtin` com valor como `"nubank-corrente-ofx"`. Não pode ser excluído pelo usuário. |
| 11 | **Motor de importação** | Componente (`src/lib/importacao/engine.ts`) que converte arquivo + perfil em lista de `LancamentoImportado`. |
| 12 | **LancamentoImportado** | Tipo intermediário (`src/lib/importacao/tipos.ts`) retornado pelo motor antes da persistência. |
| 13 | **Formato OFX** | Open Financial Exchange — padrão XML-like de extratos bancários adotado por bancos brasileiros. |
| 14 | **Formato CSV** | Comma-Separated Values — formato de extrato com colunas separadas por delimitador. |
| 15 | **Formato PDF** | Arquivo de fatura de cartão de crédito em PDF. Processado por `pdf-parse` para extração de texto. |
| 16 | **Parser OFX** | `src/lib/importacao/ofx.ts` — interpreta o conteúdo OFX e extrai lançamentos. |
| 17 | **Parser CSV genérico** | `src/lib/importacao/csv.ts` — interpreta CSV com base no mapeamento de colunas do perfil. |
| 18 | **Parser PDF** | `src/lib/importacao/pdf.ts` — extrai lançamentos do texto de faturas PDF. |
| 19 | **Parser legado** | `src/lib/parsers.ts` — parsers fixos para C6 e Nubank implementados antes do motor genérico. Mantidos para compatibilidade. |
| 20 | **Detecção automática de banco** | Processo de identificar o banco a partir do cabeçalho OFX (`FID`/`ORG`). Função `detectarBancoOFX()`. |
| 21 | **Sugestão de papéis** | Heurística que analisa colunas de um CSV e sugere qual é data, descrição, valor, entrada ou saída. Função `sugerirPapeis()`. |
| 22 | **Mapeamento de colunas** | Configuração no `PerfilImportacao` que associa colunas do CSV (`colData`, `colDescricao`, `colValor`) aos campos do lançamento. |
| 23 | **Modo de valor** (`modoValor`) | Define se o valor da transação está em coluna única (`"unica"`) ou em colunas separadas de entrada e saída (`"separadas"`). |
| 24 | **Inverter sinal** (`inverterSinal`) | Flag que indica se o sinal do valor deve ser invertido (para bancos que registram débitos como positivos). |
| 25 | **Usa mês de referência** (`usaMesReferencia`) | Flag que indica se os lançamentos do perfil devem ter `mesReferencia` preenchido (padrão em faturas de cartão). |
| 26 | **Categorização automática** | Processo em três fases: Memória da IA → Regras de texto → Gemini AI. Executado via `POST /api/categorizar`. |
| 27 | **Fase 1 — Memória** | Fase de categorização por correspondência exata com regras da `MemoriaIA`. |
| 28 | **Fase 2 — Regras manuais** | Fase de categorização por `mapearCategoria()` usando padrões de texto configurados em `src/lib/categorias.ts`. |
| 29 | **Fase 3 — Gemini** | Fase opcional de categorização via Gemini AI para lançamentos sem correspondência nas fases anteriores. |
| 30 | **Gemini AI** | Modelo de linguagem da Google (padrão `gemini-3.1-flash-lite`, trocável por `GEMINI_MODEL`) usado no botão "+ Gemini" para classificar o que as regras não resolveram. |
| 31 | **Dashboard** | Página `/` que exibe totais de entradas/saídas/saldo, gráfico por categoria e evolução mensal. |
| 32 | **Matriz de gastos** | Página `/matriz` que exibe uma tabela categoria × mês com valores e drill-down por descrição normalizada. |
| 33 | **Normalização de descrição** | Função que remove prefixos bancários, CNPJ e varia o texto para consolidar a mesma despesa sob um nome canônico. |
| 34 | **Previsão de despesas** | Página `/previsao` que projeta despesas fixas e parcelamentos para os próximos 12 meses. |
| 35 | **Despesa fixa** | Categoria incluída em `CATEGORIAS_FIXAS` (ex: Aluguel, Assinaturas Digitais) usada na previsão por média. |
| 36 | **Parcelamento** | Lançamento com padrão `(N/M)` na descrição. A previsão calcula as parcelas futuras. |
| 37 | **Empréstimo** | Lançamento com categoria "Empréstimo" ou "Recebimento de Empréstimo". Agrupado por pessoa no módulo de empréstimos. |
| 38 | **Pessoa** | Campo textual livre em `Lancamento` para identificar o terceiro envolvido em operações de empréstimo. |
| 39 | **Status de empréstimo** | Estado de um empréstimo por pessoa: `"aberto"` (saldo > 0, sem pagamentos), `"parcial"` (saldo > 0, com pagamentos), `"quitado"` (saldo ≤ 0). |
| 40 | **Onboarding** | Fluxo de 3 etapas para novos usuários: boas-vindas/nome → seleção de bancos → conclusão. |
| 41 | **`onboardingCompleto`** | Campo booleano em `UserProfile` e no JWT que indica se o usuário concluiu o onboarding. |
| 42 | **Auto-graduação** | Mecanismo que marca `onboardingCompleto = true` automaticamente para usuários existentes que já possuem lançamentos no banco. |
| 43 | **UserProfile** | Entidade que armazena o nome e estado de onboarding do usuário. `userId` = e-mail Google. |
| 44 | **userId** | Identificador único do usuário no sistema; igual ao e-mail Google; funciona como discriminador de tenant em todas as tabelas. |
| 45 | **Tenant** | No contexto deste sistema: um usuário individual com seus dados completamente isolados dos demais. |
| 46 | **Isolamento por discriminador** | Modelo de multi-tenancy onde todos os tenants compartilham o mesmo banco e schema, mas cada registro pertence a um `userId` específico. |
| 47 | **NextAuth v5** | Biblioteca de autenticação para Next.js (`next-auth@5.0.0-beta.31`) com suporte a OAuth, JWT e callbacks personalizados. |
| 48 | **JWT** (JSON Web Token) | Formato de token usado para transmitir identidade e estado de sessão de forma stateless. Assinado com `AUTH_SECRET`. |
| 49 | **Edge Runtime** | Ambiente de execução V8 (sem Node.js nativo) usado pelo middleware do Vercel/Next.js. Não suporta Prisma. |
| 50 | **`auth.config.ts`** | Arquivo de configuração mínima do NextAuth compatível com Edge Runtime (sem imports Prisma). Usado exclusivamente no middleware. |
| 51 | **`auth.ts`** | Arquivo de configuração completa do NextAuth com Google Provider e callbacks que acessam Prisma. Usado nas API Routes. |
| 52 | **Proxy (ex-Middleware)** | `src/proxy.ts` — intercepta toda requisição HTTP antes do roteamento; verifica autenticação e estado de onboarding. No Next 16 a convenção `middleware.ts` foi renomeada para `proxy.ts` e passou a rodar em Node.js por padrão. |
| 53 | **ALLOWED_EMAILS** | Variável de ambiente com lista de e-mails autorizados a acessar o sistema. Separados por vírgula. |
| 54 | **Google OAuth 2.0** | Protocolo de autorização usado para autenticar usuários com conta Google. |
| 55 | **OIDC** | OpenID Connect — camada de identidade sobre OAuth 2.0; fornece `id_token` com claims de identidade (email, name). |
| 56 | **Callback JWT** | Função em `src/auth.ts` chamada pelo NextAuth ao criar ou atualizar um token; responsável por adicionar `onboardingCompleto` ao JWT. |
| 57 | **Callback Session** | Função em `src/auth.ts` que projeta campos do JWT no objeto de sessão acessível em Server Components e Client Components. |
| 58 | **`update()`** | Função do `next-auth/react` chamada no cliente para atualizar o JWT após mudança de estado (ex: conclusão do onboarding). |
| 59 | **`getSessionUserId()`** | Função em `src/lib/session.ts` que retorna o `userId` (e-mail) da sessão atual ou `null` se não autenticado. |
| 60 | **Prisma ORM** | Object-Relational Mapper utilizado para acesso ao banco de dados. Versão 7.8.0. |
| 61 | **`@prisma/adapter-pg`** | Adaptador Prisma para o driver `pg` (PostgreSQL nativo). Necessário para conexão com Neon. |
| 62 | **Neon PostgreSQL** | Banco de dados PostgreSQL serverless usado em produção. Configurado via `DATABASE_URL`. |
| 63 | **`DATABASE_URL`** | Variável de ambiente com a string de conexão completa para o banco Neon (inclui credenciais e parâmetros SSL). |
| 64 | **Migration** | Script SQL versionado (em `prisma/migrations/`) que aplica alterações no schema de banco de forma incremental. |
| 65 | **`prisma migrate deploy`** | Comando para aplicar migrations pendentes em produção sem gerar novas migrations. |
| 66 | **App Router** | Sistema de roteamento do Next.js baseado em sistema de arquivos (`src/app/`), introduzido no Next.js 13. |
| 67 | **Server Component** | Componente React renderizado exclusivamente no servidor; pode acessar recursos do servidor diretamente. |
| 68 | **Client Component** | Componente React com diretiva `"use client"`; executa no navegador e pode usar hooks como `useState`. |
| 69 | **API Route** | Arquivo `route.ts` dentro de `src/app/api/` que implementa um endpoint REST no Next.js App Router. |
| 70 | **Turbopack** | Bundler incremental do Next.js usado em desenvolvimento (`next dev --turbopack`). |
| 71 | **`serverExternalPackages`** | Configuração em `next.config.ts` que exclui pacotes do bundle Next.js (Prisma, pdf-parse) para permitir uso de módulos nativos Node.js. |
| 72 | **Recharts** | Biblioteca de gráficos React (versão 3.8.1) usada no dashboard para barras, pizza e linhas. |
| 73 | **papaparse** | Biblioteca (versão 5.5.3) para parsing de CSV no servidor. |
| 74 | **pdf-parse** | Biblioteca (versão 2.4.5) para extração de texto de arquivos PDF de faturas de cartão. |
| 75 | **FID BACEN** | Código identificador de instituição financeira no padrão OFX, usado para detectar automaticamente o banco ao importar um arquivo OFX. |
