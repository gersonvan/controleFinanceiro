# Estrutura do projeto

## Árvore de diretórios de primeiro nível

| Diretório / Arquivo | Propósito | Tipo | Evidência |
|---|---|---|---|
| `src/app/` | Páginas, layouts e API Routes do Next.js App Router | código | `src/app/layout.tsx` |
| `src/app/api/` | Handlers de API Routes (endpoints REST) | código | `src/app/api/lancamentos/route.ts` |
| `src/components/` | Componentes React reutilizáveis (Nav) | código | `src/components/Nav.tsx` |
| `src/lib/` | Lógica de domínio: categorias, parsers, motor de importação, sessão, banco | código | `src/lib/categorias.ts` |
| `src/lib/importacao/` | Motor de importação e parsers por formato (CSV, OFX, PDF) | código | `src/lib/importacao/engine.ts` |
| `src/types/` | Declarações de módulo TypeScript (extensão de tipos next-auth) | código | `src/types/next-auth.d.ts` |
| `prisma/` | Schema Prisma, migrações e configuração do cliente | configuração | `prisma/schema.prisma` |
| `docs/` | Documentação técnica PADTec L2 | documentação | `docs/01-visao-geral.md` |
| `padtec/` | Framework de documentação PADTec (templates, prompts, checklist) | documentação | `padtec/README.md` |
| `scripts/` | Scripts auxiliares (seed, utilidades) | automação | `scripts/` |
| `public/` | Ativos estáticos servidos diretamente | código | `public/` |
| `middleware.ts` | Middleware de autenticação e redirecionamento de onboarding (Edge Runtime) | código | `middleware.ts:1` |
| `src/auth.ts` | Configuração completa do NextAuth com Prisma (Node.js) | código | `src/auth.ts:1` |
| `src/auth.config.ts` | Configuração mínima NextAuth sem imports Node.js (Edge-compatible) | código | `src/auth.config.ts:1` |
| `next.config.ts` | Configuração do Next.js (Turbopack, serverExternalPackages) | configuração | `next.config.ts:1` |
| `prisma.config.ts` | Configuração do CLI Prisma (schema e migrations path) | configuração | `prisma.config.ts:1` |
| `tsconfig.json` | Configuração TypeScript com path aliases (`@/`) | configuração | `tsconfig.json` |
| `eslint.config.mjs` | Configuração ESLint flat config | configuração | `eslint.config.mjs` |

## Convenções de nomenclatura por tipo de artefato

| Tipo de artefato | Padrão observado | Exemplo no repositório |
|---|---|---|
| API Route handler | `route.ts` dentro de `src/app/api/<recurso>/` | `src/app/api/lancamentos/route.ts` |
| Página (Server/Client Component) | `page.tsx` dentro de `src/app/<rota>/` | `src/app/lancamentos/page.tsx` |
| Layout | `layout.tsx` na raiz de uma rota ou da aplicação | `src/app/layout.tsx` |
| Componente reutilizável | PascalCase com extensão `.tsx` em `src/components/` | `src/components/Nav.tsx` |
| Módulo de domínio | kebab-case com extensão `.ts` em `src/lib/` | `src/lib/categorias.ts` |
| Parser de importação | `<formato>.ts` em `src/lib/importacao/` | `src/lib/importacao/csv.ts` |
| Schema de banco | `schema.prisma` na raiz de `prisma/` | `prisma/schema.prisma` |
| Migration | timestamp + descrição gerada pelo Prisma | `prisma/migrations/*/migration.sql` |
| Declaração de tipo | `<módulo>.d.ts` em `src/types/` | `src/types/next-auth.d.ts` |

## Padrão de módulo adotado

O projeto segue uma organização **por camada** (não por feature). Cada camada tem um diretório próprio: páginas e rotas em `src/app/`, lógica de domínio em `src/lib/`, componentes de interface em `src/components/`. As API Routes seguem a convenção do Next.js App Router: um arquivo `route.ts` por recurso REST dentro de `src/app/api/<recurso>/`. O módulo de referência mais completo é `src/app/api/lancamentos/route.ts`, que implementa GET, POST, DELETE, PATCH e PUT para o recurso `lancamentos`.

## Regras de fronteira entre módulos

| Regra | Aplicação automatizada | Evidência |
|---|---|---|
| `middleware.ts` importa apenas de `src/auth.config.ts` (sem Prisma) | Não — convenção manual | `middleware.ts:2`; violação causaria erro de runtime no Edge |
| `src/auth.config.ts` não importa módulos Node.js | Não — convenção manual | `src/auth.config.ts:1` |
| API Routes não importam `src/auth.ts` diretamente; usam `getSessionUserId()` de `src/lib/session.ts` | Não | `src/lib/session.ts:1` |
| Proibição de dependências cíclicas entre módulos | Não — sem configuração de lint para ciclos | // CARÊNCIA: não identificado no código |
| Path alias `@/` mapeia para `src/` | Sim — via `tsconfig.json` `paths` | `tsconfig.json` |

## Arquivos sensíveis e pontos de entrada

| Arquivo | Função | Risco de modificação | Evidência |
|---|---|---|---|
| `middleware.ts` | Ponto de entrada para toda requisição autenticada; controla redirecionamentos de onboarding | Modificação pode expor rotas protegidas ou bloquear usuários legítimos | `middleware.ts:1` |
| `src/auth.ts` | Define callbacks JWT e de sessão; impõe lista de e-mails permitidos | Modificação pode conceder acesso indevido a usuários não autorizados | `src/auth.ts:6` |
| `src/auth.config.ts` | Configuração base do NextAuth usada no Edge; `pages` de login/erro definidos aqui | Modificação afeta redirecionamento de login em todo o sistema | `src/auth.config.ts:4` |
| `prisma/schema.prisma` | Define o modelo de dados completo e relacionamentos | Modificação sem migration pode corromper o banco de produção | `prisma/schema.prisma:1` |
| `next.config.ts` | Configura `serverExternalPackages` necessário para Prisma e pdf-parse | Remoção de entradas pode quebrar o bundle em produção | `next.config.ts:1` |
| `.env` / variáveis de ambiente | Credenciais de banco, segredos OAuth e chave Gemini | Exposição compromete todos os dados de todos os usuários | `SETUP.md` |
