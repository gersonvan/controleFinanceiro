# Importação Flexível de Extratos — Arquitetura e Guia de Replicação

> Documento de referência. Descreve o sistema de importação configurável
> (perfis + mapeamento visual + CSV genérico + OFX + PDF) construído no
> **financeiro-web**, pensado para ser **replicado no Empresa Fácil**.

## 1. Problema que resolve

A primeira versão tinha um parser **hardcoded por banco** (`parsers.ts`): cada
banco era uma função com índices de coluna fixos, número de linhas de cabeçalho
fixo, formato de data fixo e convenção de sinal fixa. Isso funciona para o dono
do sistema, mas **trava qualquer outro usuário** — só dá pra importar de bancos
que alguém programou na mão.

A solução é inverter o controle: em vez de código por banco, o **usuário
configura um "perfil de importação"** uma vez (ensina o sistema a ler o CSV
dele) e reutiliza nas próximas importações.

## 2. Decisão de arquitetura central

Mantivemos os 4 parsers antigos como **perfis nativos** (`builtin != null`) para
não quebrar a importação já em uso, e construímos um **motor genérico** novo
para todos os perfis criados pelo usuário (`builtin == null`).

```
Perfil.builtin != null  ──► parsers.ts (legado, intocado)
Perfil.formato == "ofx" ──► ofx.ts
Perfil.formato == "csv" ──► csv.ts (genérico, mapeamento de colunas)
Perfil.formato == "pdf" ──► pdf.ts (parsers por banco + fallback genérico)
```

Toda essa decisão fica num único ponto: `lib/importacao/engine.ts`.

## 3. Modelo de dados

`PerfilImportacao` (Prisma). Campos relevantes:

| Campo | Função |
|---|---|
| `userId` | Isolamento multi-usuário |
| `nome`, `conta` | Identificação e conta atribuída aos lançamentos |
| `formato` | `"csv"`, `"ofx"` ou `"pdf"` |
| `delimitador` | `,` `;` `\t` (CSV) |
| `linhasPular` | Linhas de cabeçalho a ignorar (CSV) |
| `formatoData` | `DD/MM/AAAA`, `AAAA-MM-DD`, `DD-MM-AAAA`, `MM/DD/AAAA` |
| `modoValor` | `"unica"` (uma coluna, sinal indica direção) ou `"separadas"` (colunas de entrada/saída) |
| `colData`, `colDescricao`, `colValor`, `colEntrada`, `colSaida` | Índices de coluna (base 0) |
| `inverterSinal` | Faturas de cartão: valor positivo = gasto |
| `usaMesReferencia` | Faturas pedem o mês no upload; extratos usam a data |
| `ativo` | Exibido/oculto na tela de importação (gerenciado em Configurações) |
| `builtin` | `null` para perfis genéricos; nome do parser nativo para perfis embutidos |

## 4. Estrutura de arquivos

```
src/lib/importacao/
  tipos.ts      # Tipos + utilitários puros: parseCSV, parseDataFlexivel, parseValor
  csv.ts        # Parser CSV genérico (usa o mapeamento de colunas do perfil)
  ofx.ts        # Parser OFX (regex sobre blocos <STMTTRN>)
  pdf.ts        # Parsers de PDF por banco + fallback genérico
  detectar.ts   # Detecta formato do arquivo + heurística de colunas CSV + banco OFX/PDF
  engine.ts     # Orquestrador: escolhe o parser conforme o perfil

src/app/api/
  perfis/route.ts               # CRUD de perfis + seeding automático de nativos
  importar/preview/route.ts     # Recebe CSV, devolve amostra de linhas p/ mapeamento
  importar/pdf-preview/route.ts # Extrai texto do PDF + detecta banco + prévia de transações
  importar/route.ts             # Importa de fato usando perfilId (suporta CSV, OFX, PDF)

src/app/
  importar/page.tsx     # UI unificada: drop zone → auto-detecção → fluxo por formato
  configuracoes/page.tsx# Toggle de bancos ativos (visíveis na importação)
```

## 5. Os parsers (o coração reaproveitável)

### 5.1 `parseCSV(texto, delimitador)`
Quebra o texto em matriz de células respeitando **aspas** (campos com vírgula
dentro de `"..."`). Independente de banco.

### 5.2 `parseDataFlexivel(str, formato)`
Interpreta data em 4 formatos comuns. Descarta a parte de hora (`T`/espaço),
trata ano de 2 dígitos.

### 5.3 `parseValor(str)`
Normaliza valores: detecta separador decimal BR (`1.234,56`) vs US (`1234.56`),
remove `R$`/espaços.

### 5.4 `parseCSVGenerico(...)`
Aplica o mapeamento do perfil linha a linha. Dois modos de valor:
- **única**: lê `colValor`, aplica `inverterSinal`. Sinal define Entrada/Saída.
- **separadas**: lê `colEntrada` e `colSaida`.

### 5.5 `parseOFX(...)`
OFX é **estruturado** (não precisa mapeamento). Extrai blocos `<STMTTRN>` por
regex e lê `DTPOSTED` (data `YYYYMMDD`), `TRNAMT` (valor, negativo = saída),
`NAME`/`MEMO` (descrição). Tolera SGML (sem tags de fechamento) e XML.

### 5.6 `parsePDF(...)`
Dispatch para o parser específico do banco (via `perfil.builtin`) ou fallback
genérico. Requer PDFs **digitais** (com texto embutido). Ver seção 9.

## 6. Mês de referência (lição aprendida)

A v1 extraía o mês de referência da fatura **do nome do arquivo**
(`Fatura_2026_06.csv`) — frágil e não generalizável. No motor novo:
`usaMesReferencia = true` faz a UI **pedir o mês no upload** (`<input type="month">`),
aplicado a todos os lançamentos. Extratos usam o mês da própria data.

## 7. UI unificada de importação

`importar/page.tsx` é uma máquina de estados com drop zone única:

```
upload → detectando → confirmar_ofx  → importando → resultado
                    → novo_ofx       →
                    → confirmar_pdf  →
                    → novo_pdf       →
                    → selecionar_csv →
                    → mapeamento_csv →
```

- **OFX**: lê `<FID>`/`<ORG>` → bate com perfil ativo → importa 1 clique.
- **PDF**: envia ao servidor → `/api/importar/pdf-preview` extrai texto, detecta banco,
  retorna todas as linhas lidas e a conferência com o resumo da fatura (`conferencia.ts`);
  usuário confere a lista e a soma, confirma mês de referência e importa.
- **CSV**: perfis ativos aparecem como cards para seleção direta; "Novo mapeamento"
  vai para o editor visual com sugestão automática de colunas.

### 7.1 Sugestão automática de colunas (`detectar.ts`)
Analisa as linhas de dados:
- **Data**: coluna com >60% de valores que casam com regex de data.
- **Valor**: coluna com >60% de valores numéricos/monetários.
- **Descrição**: coluna com maior comprimento médio de texto (>5 chars).
- 2 colunas numéricas → sugere "Entrada" e "Saída" separadas.

## 8. Como replicar no Empresa Fácil

O núcleo `lib/importacao/` é **independente de domínio** — depende apenas de uma
função `mapearCategoria` (que pode virar no-op ou outra lógica). Passos:

1. **Copiar** `tipos.ts`, `csv.ts`, `ofx.ts`, `pdf.ts`, `detectar.ts`, `engine.ts`.
   Ajustar o tipo `LancamentoImportado` para a entidade de lá (ex: `MovimentoFiscal`).
2. **Trocar** `mapearCategoria` pela regra de classificação do Empresa Fácil
   (ou remover, se não houver).
3. **Criar** o model `PerfilImportacao` no schema (idêntico, trocar só relações).
4. **Copiar** as 4 rotas de API (`perfis`, `importar/preview`, `importar/pdf-preview`, `importar`),
   ajustando o `createMany` para a entidade nova.
5. **Copiar** `importar/page.tsx` e `configuracoes/page.tsx` — a UI é genérica.
6. Para notas fiscais, adicionar parser **XML (NF-e)** no mesmo padrão do
   OFX: um arquivo `lib/importacao/nfe.ts` e mais um `case` no `engine.ts`.

### O padrão que se repete
> Um **orquestrador** central + um **parser por formato** + um **modelo de
> configuração** persistido + uma **UI de mapeamento** que escreve esse modelo.
> Adicionar um formato novo = um arquivo de parser + um `case` no engine.

## 9. Suporte a PDF — bancos implementados e roadmap

### 9.1 Referência: projeto banksheet

[**tio-ze-rj/banksheet**](https://github.com/tio-ze-rj/banksheet) (MIT License) —
parser de faturas de cartão em PDF para múltiplos bancos, feito em TypeScript.
Os padrões de regex do nosso `pdf.ts` foram derivados deste projeto.

> **Como usar o banksheet para adicionar um novo banco:**
> 1. Abrir `packages/core/src/plugins/BR/<banco-cartao>/index.ts` no repositório.
> 2. Copiar os padrões de detecção (strings/CNPJ que identificam o banco no texto)
>    e o regex de linha de transação.
> 3. Adicionar nova função `parseXxx()` em `src/lib/importacao/pdf.ts`.
> 4. Registrar o `builtinKey` em `detectarBancoPDF()` e no `switch` de `parsePDF()`.
> 5. Adicionar o perfil em `BUILTIN_PDF_PERFIS` em `src/app/api/perfis/route.ts`.

### 9.2 Status dos bancos

#### Faturas de cartão de crédito (PDF)

| Banco | builtin key | Status | Fonte |
|---|---|---|---|
| Nubank | `nubank-cartao-pdf` | ✅ Implementado | banksheet + adaptação |
| C6 Bank | `c6-cartao-pdf` | ✅ Implementado | banksheet + adaptação |
| Itaú | `itau-cartao-pdf` | ✅ Implementado | banksheet + adaptação |
| Bradesco | `bradesco-cartao-pdf` | ✅ Implementado | banksheet + adaptação |
| Inter | `inter-cartao-pdf` | ✅ Implementado | banksheet + adaptação |
| Nomad (emitido pela Afinz) | `nomad-cartao-pdf` | ✅ Implementado | fatura real de 10/2026 |
| Porto Seguro | `porto-seguro-cartao-pdf` | 🔲 A adicionar | banksheet disponível |
| Santander | — | 🔲 A adicionar | precisa de arquivo real |
| Banco do Brasil | — | 🔲 A adicionar | precisa de arquivo real |
| Caixa | — | 🔲 A adicionar | precisa de arquivo real |

> **Porto Seguro (pronto para implementar):**
> Detecção: `"Porto Bank"`, `"PORTOSEG S/A"`, `"cartaoportoseguro"` ou CNPJ `04.862.600`.
> Regex de transação: `^(\d{2})\/(\d{2})\s+(.+?)\s+(-?[\d.,]+)\s*$` (mesmo padrão do Bradesco).
> Usa data de vencimento para inferir o ano. Implementação estimada: ~20 linhas.

#### Extratos de conta corrente (OFX)

| Banco | builtin key | Status |
|---|---|---|
| Itaú Corrente | `itau-corrente-ofx` | ✅ Implementado |
| Itaú Poupança | `itau-poupanca-ofx` | ✅ Implementado |
| Bradesco | `bradesco-corrente-ofx` | ✅ Implementado |
| Bradesco (extrato em PDF do app Bradesco Celular) | `bradesco-extrato-pdf` | ✅ Implementado |
| Santander | `santander-corrente-ofx` | ✅ Implementado |
| Banco do Brasil | `bb-corrente-ofx` | ✅ Implementado |
| Caixa | `caixa-corrente-ofx` | ✅ Implementado |
| Nubank Conta | `nubank-corrente-ofx` | ✅ Implementado |
| Inter | `inter-corrente-ofx` | ✅ Implementado |
| Sicoob | `sicoob-corrente-ofx` | ✅ Implementado |
| Sicredi | `sicredi-corrente-ofx` | ✅ Implementado |

> OFX é o formato preferencial para extratos de conta corrente — estruturado,
> sem heurística frágil. Todos os grandes bancos brasileiros exportam OFX no
> internet banking. Para adicionar um novo banco OFX, basta registrar em
> `BUILTIN_OFX_PERFIS` com o nome/conta corretos e atualizar `OFX_FID_MAP`
> ou `OFX_ORG_MAP` em `detectar.ts` com os identificadores do banco.

### 9.3 Limitações do parser PDF

- Só funciona com PDFs **digitais** (texto embutido). PDFs escaneados (imagem)
  precisariam de OCR — fora do escopo atual.
- Cada banco formata o PDF de forma diferente e pode mudar o layout em qualquer
  versão. Se a importação parar de funcionar, verificar se o layout mudou e ajustar
  o regex na função correspondente em `pdf.ts`.
- Para bancos sem parser específico, o **fallback genérico** tenta o padrão
  `DD/MM[/AAAA] descrição valor` — funciona para layouts tabulares simples.

### 9.4 Como testar e depurar um novo PDF

```bash
# Extrair texto do PDF no terminal (macOS/Linux)
pdftotext arquivo.pdf -

# Ou via Node.js
node -e "
  const pdf = require('pdf-parse');
  pdf(require('fs').readFileSync('arquivo.pdf'))
    .then(d => console.log(d.text));
"
```

Com o texto extraído, identificar o padrão de linha de transação e testar o
regex em [regex101.com](https://regex101.com) antes de implementar.

## 10. Fase 3 (futuro, não implementado)

- **Porto Seguro PDF**: ~20 linhas, pronto para implementar com banksheet.
- **Santander / BB / Caixa PDF**: banksheet não cobre — precisaria de arquivos reais para mapear layout.
- **Faturas de cartão OFX**: alguns bancos exportam OFX de fatura (ex: Nubank Crédito) —
  mapear `usaMesReferencia = true` no perfil OFX para cobrir esses casos.
- **Detecção de CSV desconhecido por LLM**: enviar as primeiras linhas para um modelo
  de linguagem sugerir o mapeamento de colunas sem precisar de arquivo de amostra.
- **Parser OFX de saldo** (`<LEDGERBAL>`): exportar saldo atual da conta além das transações.
- **Importação de NF-e (XML)**: para o Empresa Fácil — parser `nfe.ts` no mesmo padrão.
- **Pré-visualização completa antes de gravar**: mostrar todos os lançamentos parseados
  para o usuário confirmar/descartar individualmente antes de persistir.
