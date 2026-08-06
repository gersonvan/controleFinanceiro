# Backend

## Modelo de execução

O backend é composto inteiramente por **Next.js API Routes** no padrão App Router (`route.ts`). Não há servidor dedicado; cada rota é uma função serverless executada sob demanda. O runtime é Node.js (não Edge), exceto o middleware de autenticação.

## Módulo de sessão

`src/lib/session.ts` expõe a função `getSessionUserId()`:

```typescript
// Retorna o e-mail do usuário autenticado (userId) ou null
getSessionUserId(): Promise<string | null>
```

É chamada no início de toda API Route para obter o `userId` e garantir isolamento de dados. Retorna `session?.user?.email` da sessão NextAuth — `src/lib/session.ts:1`.

## Motor de importação

### Ponto de entrada

`src/lib/importacao/engine.ts:21` — função `importar(texto, fileName, perfil, memoriaIA, mesReferenciaManual)`:

- **Caminho 1 — Perfis legados** (`perfil.builtin !== null`): delega para os parsers em `src/lib/parsers.ts` (C6 crédito/débito, Nubank crédito/débito) — `src/lib/importacao/engine.ts:29`.
- **Caminho 2 — OFX genérico**: chama `parseOFX()` em `src/lib/importacao/ofx.ts` — `src/lib/importacao/engine.ts:46`.
- **Caminho 3 — PDF**: chama `parsePDF()` em `src/lib/importacao/pdf.ts` — `src/lib/importacao/engine.ts:49`.
- **Caminho 4 — CSV genérico**: chama `parseCSVGenerico()` em `src/lib/importacao/csv.ts` — `src/lib/importacao/engine.ts:52`.

Todos os caminhos retornam `LancamentoImportado[]` — `src/lib/importacao/tipos.ts:4`.

### Funções utilitárias compartilhadas

| Função | Arquivo | Descrição |
|---|---|---|
| `parseCSV(text, delimitador)` | `src/lib/importacao/tipos.ts:37` | Converte texto CSV em matriz de células, com suporte a aspas e escape |
| `parseDataFlexivel(str, formato)` | `src/lib/importacao/tipos.ts:66` | Interpreta datas nos formatos DD/MM/AAAA, AAAA-MM-DD, MM/DD/AAAA e DD-MM-AAAA |
| `parseValor(str)` | `src/lib/importacao/tipos.ts:94` | Converte strings monetárias BR ("1.234,56") e US ("1234.56") para `number` |
| `detectarFormato(texto, nomeArquivo)` | `src/lib/importacao/detectar.ts:38` | Determina formato (csv/ofx/pdf) a partir de extensão e cabeçalho |
| `detectarBancoOFX(texto)` | `src/lib/importacao/detectar.ts:49` | Extrai `FID`/`ORG` do cabeçalho OFX e mapeia para `builtinKey` |
| `detectarPerfilCSV(texto)` | `src/lib/importacao/detectar.ts` | Reconhece o cabeçalho de fatura CSV do C6 e seleciona o perfil nativo |
| `sugerirPapeis(linhas, linhasPular)` | `src/lib/importacao/detectar.ts:67` | Heurística para pré-preencher papéis de colunas em CSV desconhecido |

### Bancos suportados nativamente (OFX)

`src/lib/importacao/detectar.ts` mapeia os seguintes `FID` BACEN para perfis nativos:

| FID | Banco |
|---|---|
| 0341 | Itaú |
| 0237 | Bradesco |
| 0033 | Santander |
| 0001 | Banco do Brasil |
| 0104 | Caixa Econômica Federal |
| 0077 | Inter |
| 0756 | Sicoob |
| 0748 | Sicredi |

Nubank é detectado via `ORG` (sem FID BACEN oficial).

### Perfis nativos PDF (faturas de cartão)

`src/app/api/perfis/route.ts:681` define 5 perfis PDF com `usaMesReferencia: true`:
- Nubank Fatura Cartão, C6 Fatura Cartão, Itaú Fatura Cartão, Bradesco Fatura Cartão, Inter Fatura Cartão.

### Perfil nativo CSV — fatura C6

O perfil `c6-cartao-csv` reconhece as colunas da fatura C6, usa `Valor (em R$)` como valor único com sinal invertido, solicita o mês de referência e concatena a coluna `Parcela` à descrição. Assim, uma compra como `GRAN EDUCACAO` + `5/12` é persistida como `GRAN EDUCACAO (5/12)` e entra na previsão de parcelamentos.

## Sistema de categorização

### Hierarquia de prioridade (`src/lib/categorias.ts:115`)

1. **Memória da IA** — correspondência exata `descricao.toLowerCase()` no `Map<string, string>` carregado da tabela `MemoriaIA`.
2. **Transferências entre contas próprias** — nomes pessoais configurados na constante `NOMES_PROPRIOS`.
3. **Pagamento de fatura de cartão** — padrões de texto (ex: "pag fatura boleto").
4. **Tipo Entrada** — mapeamento específico (ex: "recebimento salario" → "Salário").
5. **Assinaturas Digitais** — lista de serviços (Netflix, Spotify, ChatGPT, GitHub, etc.).
6. **Moradia, Alimentação, Transporte, Saúde, Educação** — padrões de texto por domicílio do usuário.
7. **Financeiro** — pagamentos, investimentos, taxas, transferências.
8. **Fallback** — retorna `""` (sem categoria).

### Integração com Gemini AI

`src/app/api/categorizar/route.ts:119` — função `chamarGemini(descricao, categoriasStr, apiKey)`:

- Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent`
- Formato: JSON com `systemInstruction` + prompt de descrição.
- Resposta: `{ categoria_sugerida: string }` via `responseMimeType: "application/json"`.
- `temperature: 0.0` para determinismo.
- Delay de 1100ms entre chamadas para respeitar rate limit — `src/app/api/categorizar/route.ts:98`.

## Normalização de descrições (Matriz)

`src/app/api/matriz/route.ts:492` — função `normalizarDescricao(descricao)`:

1. Remove prefixos bancários configurados (ex: "Pix enviado para ", "Transferência enviada pelo Pix - ").
2. Remove CNPJ e sufixo após ele (padrão Nubank Pix).
3. Converte para maiúsculas.
4. Aplica mapa de nomes canônicos (ex: "BRISANET SERVICOS DE TELECOMUNICACOES S A" → "BRISANET").

## Lógica de previsão

`src/app/api/previsao/route.ts:825`:

- **Parcelamentos**: detecta padrão `(N/M)` na descrição; calcula parcelas futuras a partir da diferença de meses entre hoje e o `mesReferencia` do lançamento — `src/app/api/previsao/route.ts:848`.
- **Gastos fixos**: calcula média dos últimos 12 meses de cada categoria em `CATEGORIAS_FIXAS` e projeta para os próximos 12 meses — `src/app/api/previsao/route.ts:893`.

## Acesso a dados — padrões

Todos os endpoints utilizam **Prisma Client** com o adaptador `pg` para Neon PostgreSQL. Padrões observados:

| Operação | Método Prisma | Evidência |
|---|---|---|
| Listar com filtros | `findMany({ where: { userId, ...filtros } })` | `src/app/api/lancamentos/route.ts:380` |
| Criar | `create({ data: { ...body, userId } })` | `src/app/api/lancamentos/route.ts:398` |
| Atualizar com proteção de tenant | `updateMany({ where: { id, userId }, data })` | `src/app/api/lancamentos/route.ts:421` |
| Excluir com proteção de tenant | `deleteMany({ where: { id, userId } })` | `src/app/api/lancamentos/route.ts:409` |
| Upsert | `upsert({ where: chave_unica, create, update })` | `src/app/api/memoria-ia/route.ts:610` |
| Contagem | `count({ where })` | `src/auth.ts:27` |

Não há transações explícitas (`$transaction`) identificadas no código; operações em lote (categorização) são executadas com `Promise.all` de múltiplos `update` individuais — `src/app/api/categorizar/route.ts:58`.
