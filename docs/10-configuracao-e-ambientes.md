# Configuração e ambientes

## Variáveis de ambiente

| Variável | Obrigatória | Descrição | Evidência |
|---|---|---|---|
| `DATABASE_URL` | Sim | String de conexão PostgreSQL (Neon). Deve incluir `?sslmode=require` para conexão segura. Exemplo: `postgresql://user:pass@host.neon.tech/db?sslmode=require` | `src/lib/db.ts:2`, `SETUP.md` |
| `AUTH_SECRET` | Sim | Segredo de assinatura dos tokens JWT do NextAuth v5. Gerado com `openssl rand -base64 32`. | `src/auth.ts:13` (via NextAuth config) |
| `AUTH_GOOGLE_ID` | Sim | Client ID da aplicação Google OAuth 2.0 (Console GCP). | `src/auth.ts:15` (Google Provider) |
| `AUTH_GOOGLE_SECRET` | Sim | Client Secret da aplicação Google OAuth 2.0. | `src/auth.ts:15` (Google Provider) |
| `GEMINI_API_KEY` | Não | Chave de API do Google AI Studio para Gemini. Sem ela, a Fase 3 de categorização é ignorada silenciosamente. | `src/app/api/categorizar/route.ts:86` |
| `ALLOWED_EMAILS` | Não | Lista de e-mails autorizados separados por vírgula. Padrão: `gersonvan@gmail.com`. | `src/auth.ts:6` |

## Arquivo `.env.local`

O projeto usa o padrão Next.js de variáveis de ambiente:

- `.env.local`: valores locais do desenvolvedor (não commitado; listado em `.gitignore`)
- `.env`: valores padrão públicos (não contém segredos)

O `prisma.config.ts` carrega explicitamente variáveis de ambiente via `import "dotenv/config"` para garantir que o CLI Prisma acesse `DATABASE_URL` — `prisma.config.ts:1`.

## Ambientes identificados

| Ambiente | Descrição | Evidência |
|---|---|---|
| Desenvolvimento local | Next.js dev server com Turbopack; banco Neon apontado por `DATABASE_URL` local | `SETUP.md`, `next.config.ts` |
| Produção | Deploy em plataforma serverless (Vercel); variáveis de ambiente configuradas via painel da plataforma | `SETUP.md` |

Não há ambiente de homologação/staging identificado no código.

## Configuração do Next.js

`next.config.ts` declara:

```typescript
serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pdf-parse"]
```

Esses pacotes usam módulos nativos Node.js e devem ser excluídos do bundle do Next.js para não causar falha no processo de bundling — `next.config.ts:1`.

Turbopack está habilitado implicitamente via flag `--turbopack` no script `dev` em `package.json`.

## Configuração do Prisma

`prisma.config.ts` define:
- Schema: `prisma/schema.prisma`
- Migrations: `prisma/migrations/`
- Carrega `.env` via `dotenv/config`

Provider no schema: `postgresql` com `db` vindo de `env("DATABASE_URL")`.

Adaptador: `PrismaPg` do pacote `@prisma/adapter-pg`, instanciado em `src/lib/db.ts` com pool de conexões `pg.Pool`.

## Configuração do TypeScript

`tsconfig.json` define path alias `@/` mapeando para `src/`. Usado em todas as importações do projeto para evitar caminhos relativos longos.

## Scripts npm

| Script | Comando | Descrição |
|---|---|---|
| `dev` | `next dev --turbopack` | Servidor de desenvolvimento com Turbopack |
| `build` | `next build` | Build de produção |
| `start` | `next start` | Servidor de produção |
| `lint` | `next lint` | Executa ESLint |
