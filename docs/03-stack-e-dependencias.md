# Stack tecnológico e dependências

## Inventário por camada

| Camada | Categoria | Tecnologia | Versão resolvida | Literal no manifesto | Evidência |
|---|---|---|---|---|---|
| Apresentação | Linguagem | TypeScript | 5.9.3 | `^5` | `package.json:devDependencies` |
| Apresentação | Motor de execução | Node.js | // CARÊNCIA: versão de runtime não declarada no projeto | — | — |
| Apresentação | Framework de aplicação | Next.js | 16.2.7 | `^16.2.7` | `package.json:dependencies` |
| Apresentação | Biblioteca estrutural | React | 19.2.4 | `^19.0.0` | `package.json:dependencies` |
| Apresentação | Biblioteca estrutural | React DOM | 19.2.4 | `^19.0.0` | `package.json:dependencies` |
| Apresentação | Biblioteca estrutural | Tailwind CSS | 4.3.0 | `^4` | `package.json:dependencies` |
| Apresentação | Biblioteca estrutural | lucide-react | 1.17.0 | `^1.17.0` | `package.json:dependencies` |
| Apresentação | Biblioteca estrutural | recharts | 3.8.1 | `^3.8.1` | `package.json:dependencies` |
| Apresentação | Biblioteca estrutural | date-fns | 4.4.0 | `^4.4.0` | `package.json:dependencies` |
| Aplicação | Framework de aplicação | NextAuth v5 | 5.0.0-beta.31 | `^5.0.0-beta.31` | `package.json:dependencies` |
| Domínio | Biblioteca estrutural | papaparse | 5.5.3 | `^5.5.3` | `package.json:dependencies` |
| Domínio | Biblioteca estrutural | pdf-parse | 2.4.5 | `^2.4.5` | `package.json:dependencies` |
| Infraestrutura | Mecanismo de persistência | Prisma ORM | 7.8.0 | `^7.8.0` | `package.json:dependencies` |
| Infraestrutura | Mecanismo de persistência | @prisma/client | 7.8.0 | `^7.8.0` | `package.json:dependencies` |
| Infraestrutura | Mecanismo de persistência | @prisma/adapter-pg | 7.8.0 | `^7.8.0` | `package.json:dependencies` |
| Infraestrutura | Mecanismo de persistência | pg (node-postgres) | 8.21.0 | `^8.12.0` | `package.json:dependencies` |
| Build | Ferramenta de build | ESLint | 9.39.4 | `^9` | `package.json:devDependencies` |
| Build | Ferramenta de build | eslint-config-next | 16.2.7 | `16.2.7` | `package.json:devDependencies` |
| Build | Ferramenta de build | @types/node | // CARÊNCIA: versão não verificada | — | `package.json:devDependencies` |
| Build | Ferramenta de build | @types/react | // CARÊNCIA: versão não verificada | — | `package.json:devDependencies` |
| Build | Ferramenta de build | postcss | // CARÊNCIA: versão não verificada | — | `package.json:devDependencies` |

## Dependências runtime

| Nome | Versão resolvida | Propósito | Evidência |
|---|---|---|---|
| next | 16.2.7 | Framework web fullstack com App Router e Server Components | `package.json:dependencies` |
| react | 19.2.4 | Biblioteca de interface declarativa | `package.json:dependencies` |
| react-dom | 19.2.4 | Renderizador React para DOM | `package.json:dependencies` |
| next-auth | 5.0.0-beta.31 | Autenticação OAuth/OIDC com Google, JWT e callbacks de sessão | `src/auth.ts:1` |
| @prisma/client | 7.8.0 | Cliente ORM gerado para acesso ao banco de dados | `src/lib/db.ts:1` |
| @prisma/adapter-pg | 7.8.0 | Adaptador Prisma para driver `pg` (necessário para Neon) | `src/lib/db.ts:3` |
| pg | 8.21.0 | Driver Node.js para PostgreSQL; usado em conjunto com o adaptador Prisma | `src/lib/db.ts:2` |
| tailwindcss | 4.3.0 | Framework CSS utilitário aplicado nos componentes | `src/app/globals.css` |
| recharts | 3.8.1 | Biblioteca de gráficos baseada em D3 usada no dashboard | `src/app/page.tsx` |
| date-fns | 4.4.0 | Manipulação e formatação de datas | `src/app/api/dashboard/route.ts` |
| lucide-react | 1.17.0 | Ícones SVG como componentes React | `src/components/Nav.tsx` |
| papaparse | 5.5.3 | Parser de CSV no lado do servidor (motor de importação) | `src/lib/importacao/csv.ts` |
| pdf-parse | 2.4.5 | Extração de texto de arquivos PDF (faturas de cartão) | `src/lib/importacao/pdf.ts` |

## Dependências de desenvolvimento

| Nome | Versão resolvida | Propósito | Evidência |
|---|---|---|---|
| typescript | 5.9.3 | Compilador TypeScript e checagem de tipos estática | `package.json:devDependencies` |
| eslint | 9.39.4 | Linter JavaScript/TypeScript | `package.json:devDependencies` |
| eslint-config-next | 16.2.7 | Conjunto de regras ESLint recomendado pelo Next.js | `package.json:devDependencies` |
| prisma | 7.8.0 | CLI Prisma para migrations e geração do cliente | `package.json:devDependencies` |
| @types/papaparse | // CARÊNCIA: versão não verificada | Tipos TypeScript para papaparse | `package.json:devDependencies` |
| @types/pg | // CARÊNCIA: versão não verificada | Tipos TypeScript para pg | `package.json:devDependencies` |
| @types/pdf-parse | // CARÊNCIA: versão não verificada | Tipos TypeScript para pdf-parse | `package.json:devDependencies` |

## Serviços de plataforma

| Categoria | Função no sistema | Modo de consumo | Evidência |
|---|---|---|---|
| Banco de dados relacional gerenciado | Persistência de todos os dados de lançamentos, perfis e usuários | Driver `pg` via adaptador Prisma com connection string `DATABASE_URL` | `src/lib/db.ts:1` |
| Provedor de identidade OAuth | Autenticação de usuários via Google | NextAuth v5 Google Provider com OIDC | `src/auth.ts:14` |
| Modelo de linguagem via REST | Categorização de descrições por IA generativa | `fetch` HTTP nativo do Node.js | `src/app/api/categorizar/route.ts:119` |

## Política de atualização

// CARÊNCIA: não identificado no código. Não há arquivo de automação (Dependabot, Renovate) nem script de atualização de dependências no repositório.
