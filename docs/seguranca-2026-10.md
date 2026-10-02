# Rodada de segurança — outubro/2026

Executada em 02/10/2026 no ambiente de testes local (Postgres em Docker, login de
teste, `npm run test:e2e`) e, só com leituras de páginas públicas, em produção.
Os testes ativos estão em `e2e/seguranca.spec.ts` e `e2e/isolamento.spec.ts` e
rodam a cada `npm run test:e2e`.

## O que foi verificado e passou

| Área | Como | Resultado |
|---|---|---|
| Autorização | As 49 combinações rota × método de `/api` sem sessão | Todas recusam (401 ou redireciono ao login) |
| Isolamento entre contas | Bruno tenta ler/alterar/apagar lançamentos, reservas, regras da Memória, perfis de importação, contas, "mesmo pagamento" e reembolsos da Ana pelo id | Nada vaza nem muda |
| Atribuição em massa | `POST /api/lancamentos` com `userId` e `id` de outra conta | Ignorados; o dono vem da sessão |
| XSS | Descrições com `<img onerror>`, `<script>` e `javascript:` em Lançamentos e Matriz | Mostradas como texto; nada executa |
| Entradas malformadas | JSON quebrado, `null`, `[]`, tipos errados e texto de 20 mil caracteres em 15 rotas; ids inválidos | Sempre 400, nunca 500 |
| Uploads | Arquivo de 9 MB, PDF falso, PDF corrompido | Recusados sem erro interno nem detalhes técnicos |
| Redirecionamento | `callbackUrl` externa no parâmetro e em cookie forjado | Sempre volta ao próprio site |
| Login de teste | `/login` e `/api/auth/providers` em produção | Só Google; nenhum botão de teste |
| Cabeçalhos (produção) | `curl` em `/login` | HSTS, `X-Frame-Options: DENY`, `nosniff`, CSP, Referrer e Permissions Policy |
| Cookies de sessão | `/api/auth/csrf` em produção | `__Host-`/`__Secure-`, `HttpOnly`, `Secure`, `SameSite=Lax` |
| Segredos no repositório | Busca por padrões (URL Neon com senha, chaves Google/Gemini, OAuth, GitHub, chave privada) nos arquivos e em todo o histórico | Só exemplos de documentação e a URL fictícia do teste; repositório privado; nenhum `.env` real commitado |
| Segredos no navegador | Valores reais de `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_SECRET` nos 35 arquivos de `.next/static` | Não aparecem |
| `.env.test` versionado | Comparação com o `.env` real (sem exibir valores) | Todos os segredos diferentes |
| Código | Chamadas ao banco sem filtro do usuário; `dangerouslySetInnerHTML`, `$queryRaw`, `eval`; erros internos na resposta | Nenhuma ocorrência |

## Corrigido nesta rodada

1. **Next.js 16.3.5 → 16.3.8** — vulnerabilidade crítica de execução remota de
   código no `next/og` (GHSA-vcvr-r3jv-pc5j). O app não usa `next/og`, então não
   estava exposta, mas a versão vulnerável saiu.
2. **`X-Powered-By: Next.js`** desligado (`poweredByHeader: false`).
3. **Upload grande recusado antes de ler o corpo** (`corpoGrandeDemais`, 413) nas
   quatro rotas de importação — antes o limite de 8 MB só era conferido depois de
   carregar tudo na memória (na Vercel a plataforma já corta acima de 4,5 MB).
4. **Teto de 200 páginas na leitura de PDF** — um PDF hostil com milhares de
   páginas não prende a função.
5. **CSP com nonce** (`src/lib/csp.ts`, aplicada no `src/proxy.ts`): cada
   requisição sorteia um valor e só scripts marcados com ele executam — sai o
   `'unsafe-inline'` de `script-src` (fica `'strict-dynamic'`). Estilos seguem com
   `'unsafe-inline'` (com nonce o navegador o ignoraria e a Matriz usa `style=""`).
   Conferido no build de produção: todos os `<script>` do HTML com o nonce,
   nenhuma violação, e um `<img onerror>` injetado é bloqueado (com a política
   anterior executava). O `/login` passou a ter a CSP também.
6. **Sessão revogada no proxy**: quem sai de `ALLOWED_EMAILS` perdia a sessão só
   no login completo; o proxy ainda deixava a página abrir, as APIs davam 401 e o
   dashboard quebrava ("This page couldn't load"). A lista agora está em
   `src/lib/acesso.ts`, usada pelos dois — o proxy manda para o login.

## Pendências (riscos aceitos ou para decidir)

| Item | Risco | Recomendação |
|---|---|---|
| `npm audit`: 4 "high" em `prisma` (`@prisma/config` → `deepmerge-ts`; `mysql2`) | Baixo: só na ferramenta de linha de comando do Prisma e num driver MySQL que o app não usa | A correção sugerida rebaixa o Prisma para a v6; acompanhar um patch da v7 |
| Sem limite de requisições por usuário | Baixo: só e-mails da lista entram | Se abrir para mais usuários, limitar `/api/importar` e `/api/categorizar` (Gemini tem custo) |
| `DATABASE_URL` com `sslmode=require` | Nenhum hoje; a biblioteca avisa que o significado vai mudar | Trocar por `sslmode=verify-full` na Vercel |
| Migrações não recriam o banco do zero | Recuperação de desastre / ambiente novo | Migração de alinhamento idempotente (ver CONTEXTO-PROJETO.md, "Ambiente de testes") |
| Regra global de `input/select` fora das camadas do Tailwind | Visual, não de segurança | Mover para `@layer base` com revisão visual das páginas |
