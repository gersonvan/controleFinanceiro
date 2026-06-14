# Importação Flexível de Extratos — Arquitetura e Guia de Replicação

> Documento de referência. Descreve o sistema de importação configurável
> (perfis + mapeamento visual + CSV genérico + OFX) construído no
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
```

Toda essa decisão fica num único ponto: `lib/importacao/engine.ts`.

## 3. Modelo de dados

`PerfilImportacao` (Prisma). Campos relevantes:

| Campo | Função |
|---|---|
| `userId` | Isolamento multi-usuário |
| `nome`, `conta` | Identificação e conta atribuída aos lançamentos |
| `formato` | `"csv"` ou `"ofx"` |
| `delimitador` | `,` `;` `\t` (CSV) |
| `linhasPular` | Linhas de cabeçalho a ignorar (CSV) |
| `formatoData` | `DD/MM/AAAA`, `AAAA-MM-DD`, `DD-MM-AAAA`, `MM/DD/AAAA` |
| `modoValor` | `"unica"` (uma coluna, sinal indica direção) ou `"separadas"` (colunas de entrada/saída) |
| `colData`, `colDescricao`, `colValor`, `colEntrada`, `colSaida` | Índices de coluna (base 0) |
| `inverterSinal` | Faturas de cartão: valor positivo = gasto |
| `usaMesReferencia` | Faturas pedem o mês no upload; extratos usam a data |
| `builtin` | `null` para perfis genéricos; nome do parser legado para nativos |

## 4. Estrutura de arquivos

```
src/lib/importacao/
  tipos.ts    # Tipos + utilitários puros: parseCSV, parseDataFlexivel, parseValor
  csv.ts      # Parser CSV genérico (usa o mapeamento de colunas do perfil)
  ofx.ts      # Parser OFX (regex sobre blocos <STMTTRN>)
  engine.ts   # Orquestrador: escolhe o parser conforme o perfil

src/app/api/
  perfis/route.ts            # CRUD de perfis (GET/POST/DELETE)
  importar/preview/route.ts  # Recebe CSV, devolve amostra de linhas p/ mapeamento
  importar/route.ts          # Importa de fato usando perfilId

src/app/importar/page.tsx    # UI: modo Importar + modo Novo Perfil (mapeamento visual)
```

## 5. Os parsers genéricos (o coração reaproveitável)

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

## 6. Mês de referência (lição aprendida)

A v1 extraía o mês de referência da fatura **do nome do arquivo**
(`Fatura_2026_06.csv`) — frágil e não generalizável. No motor novo:
`usaMesReferencia = true` faz a UI **pedir o mês no upload** (`<input type="month">`),
aplicado a todos os lançamentos. Extratos usam o mês da própria data.

## 7. UI de mapeamento visual

Em `importar/page.tsx`, modo **Novo perfil** (CSV):
1. Usuário sobe uma amostra → `/api/importar/preview` devolve as primeiras linhas.
2. Renderiza tabela com **um `<select>` de papel acima de cada coluna**
   (Data / Descrição / Valor / Entrada / Saída / ignorar).
3. As linhas marcadas como cabeçalho (`linhasPular`) aparecem **esmaecidas em
   vermelho** — feedback ao vivo.
4. Papéis únicos (data/descrição/valor) se auto-desmarcam se escolhidos em outra
   coluna. `modoValor` é inferido (se há entrada/saída → "separadas").

OFX não mostra mapeamento — só nome, conta e flags.

## 8. Como replicar no Empresa Fácil

O núcleo `lib/importacao/` é **independente de domínio** — depende apenas de uma
função `mapearCategoria` (que pode virar no-op ou outra lógica). Passos:

1. **Copiar** `tipos.ts`, `csv.ts`, `ofx.ts`, `engine.ts`. Ajustar o tipo
   `LancamentoImportado` para a entidade de lá (ex: `MovimentoFiscal`).
2. **Trocar** `mapearCategoria` pela regra de classificação do Empresa Fácil
   (ou remover, se não houver).
3. **Criar** o model `PerfilImportacao` no schema (idêntico, trocar só relações).
4. **Copiar** as 3 rotas de API (`perfis`, `importar/preview`, `importar`),
   ajustando o `createMany` para a entidade nova.
5. **Copiar** `importar/page.tsx` — a UI é genérica, só muda o texto e os campos
   extras específicos do domínio.
6. Para notas fiscais, considerar um parser **XML (NF-e)** no mesmo padrão do
   OFX: um arquivo por `lib/importacao/nfe.ts` e mais um `case` no `engine.ts`.

### O padrão que se repete
> Um **orquestrador** central + um **parser por formato** + um **modelo de
> configuração** persistido + uma **UI de mapeamento** que escreve esse modelo.
> Adicionar um formato novo = um arquivo de parser + um `case` no engine.

## 9. Fase 2 (futuro, não implementado)

- Detecção automática de colunas (heurística: achar coluna que parece data/valor).
- Parser OFX de saldo/conta (`<LEDGERBAL>`) além das transações.
- Importação de NF-e (XML) para o Empresa Fácil.
- Pré-visualização do **resultado** (lançamentos já parseados) antes de gravar.
