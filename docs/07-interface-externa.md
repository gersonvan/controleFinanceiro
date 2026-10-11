# Interface externa — Catálogo de API

Todas as rotas são Next.js API Routes (App Router). A autenticação é obrigatória em todas as rotas: `getSessionUserId()` retorna `null` se a sessão for inválida e a rota responde `401`. Os dados de todos os endpoints são sempre filtrados pelo `userId` da sessão.

## Catálogo completo de endpoints

| Método | Rota | Descrição | Evidência |
|---|---|---|---|
| `GET` | `/api/lancamentos` | Lista lançamentos com filtros e paginação | `src/app/api/lancamentos/route.ts:348` |
| `POST` | `/api/lancamentos` | Cria um lançamento individual | `src/app/api/lancamentos/route.ts:393` |
| `PATCH` | `/api/lancamentos` | Atualiza campos de um lançamento por `id` | `src/app/api/lancamentos/route.ts:413` |
| `PUT` | `/api/lancamentos` | Recategorização em lote (por `ids`, `descricaoContem` ou `categoriaErrada`) | `src/app/api/lancamentos/route.ts:427` |
| `DELETE` | `/api/lancamentos` | Remove um lançamento por `id` (query param) | `src/app/api/lancamentos/route.ts:402` |
| `GET` | `/api/resumo` | Totais de entradas/saídas/saldo e breakdown por categoria com filtros | `src/app/api/resumo/route.ts:975` |
| `GET` | `/api/dashboard` | Totais, breakdown por categoria, por mês e por conta para um período | `src/app/api/dashboard/route.ts:173` |
| `GET` | `/api/matriz` | Matriz de gastos por categoria e descrição normalizada, agrupada por mês | `src/app/api/matriz/route.ts:517` |
| `GET` | `/api/emprestimos` | Resumo de empréstimos agrupados por pessoa com status (aberto/parcial/quitado) | `src/app/api/emprestimos/route.ts:275` |
| `GET` | `/api/previsao` | Previsões de despesas para os próximos 12 meses (parcelamentos + gastos fixos) | `src/app/api/previsao/route.ts:825` |
| `GET` | `/api/memoria-ia` | Lista todas as regras de memória de IA do usuário | `src/app/api/memoria-ia/route.ts:591` |
| `POST` | `/api/memoria-ia` | Cria ou atualiza uma regra de memória (upsert por `descricao + userId`) | `src/app/api/memoria-ia/route.ts:602` |
| `DELETE` | `/api/memoria-ia` | Remove uma regra de memória por `id` (query param) | `src/app/api/memoria-ia/route.ts:618` |
| `POST` | `/api/categorizar` | Executa categorização automática em lançamentos sem categoria | `src/app/api/categorizar/route.ts:7` |
| `GET` | `/api/perfis` | Lista perfis de importação (ativos por padrão; `?todos=true` inclui inativos) | `src/app/api/perfis/route.ts:723` |
| `POST` | `/api/perfis` | Cria um perfil de importação personalizado | `src/app/api/perfis/route.ts:739` |
| `PATCH` | `/api/perfis` | Alterna o campo `ativo` de um perfil por `id` | `src/app/api/perfis/route.ts:767` |
| `DELETE` | `/api/perfis` | Remove um perfil personalizado (`builtin: null`) por `id` | `src/app/api/perfis/route.ts:781` |
| `GET` | `/api/lancamentos/agrupados` | Lançamentos de uma categoria (ou `__sem__`) agrupados pela descrição exata | `src/app/api/lancamentos/agrupados/route.ts:22` |
| `POST` | `/api/importar/analisar` | Analisa um arquivo sem gravar (formato, banco, perfil, total/novos/duplicados, período, mês de referência sugerido) | `src/app/api/importar/analisar/route.ts:30` |
| `PATCH` | `/api/onboarding` | Marca o onboarding como completo e salva o nome do usuário | `src/app/api/onboarding/route.ts:634` |
| `GET` | `/api/planejamento` | Fotografia do mês do usuário: itens, `margemPercentual`, `fotografiaConcluidaEm` e totais mensalizados | `src/app/api/planejamento/route.ts:63` |
| `PUT` | `/api/planejamento` | Substitui a fotografia inteira (`itens[]`, `margemPercentual`, `concluir`) numa transação; validação zod por grupo/periodicidade/parcelas | `src/app/api/planejamento/route.ts:71` |
| `GET` | `/api/contas` | Contas do usuário com tipo e nº de lançamentos; cria as que faltam com tipo sugerido pelo nome | `src/app/api/contas/route.ts` |
| `PATCH` | `/api/contas` | Muda o tipo (`corrente`/`cartao`) de uma conta do usuário por `id`; 404 se não for dele | `src/app/api/contas/route.ts` |
| `GET` | `/api/financas/meios` | Gasto por meio de pagamento no mês (`ano`/`mes`, padrão mês atual) e nos 5 anteriores, com a média deles e o investido | `src/app/api/financas/meios/route.ts` |
| `GET` | `/api/financas/ritmo` | Gasto acumulado dia a dia das contas correntes × média dos 5 meses anteriores; projeção quando o mês está em andamento | `src/app/api/financas/ritmo/route.ts` |
| `GET` | `/api/financas/divida` | Juros, IOF e multas nos 12 meses até o mês; maiores lançamentos, total por origem e a principal | `src/app/api/financas/divida/route.ts` |
| `GET` | `/api/reembolsos` | Gastos vinculados a um Pix de reembolso (`entradaId`) com a parte de cada um | `src/app/api/reembolsos/route.ts` |
| `PUT` | `/api/reembolsos` | Define os gastos que um Pix reembolsa (`{entradaId, saidaIds}`; vazio desfaz); distribui o valor, marca "Reembolso" e recalcula `valorReembolsado` | `src/app/api/reembolsos/route.ts` |
| `GET` | `/api/reembolsos/candidatos` | `{gastos, sugerido}`: sem `busca`, de 45 dias antes a 15 depois do Pix; com `busca`, pela descrição; `sugerido` = gasto do padrão aprendido | `src/app/api/reembolsos/candidatos/route.ts` |
| `GET` | `/api/reembolsos/parecidos` | Pix do mesmo pagador ainda sem divisão com o gasto que o padrão sugere para cada um | `src/app/api/reembolsos/parecidos/route.ts` |
| `POST` | `/api/reembolsos/aplicar` | Divide pelos padrões os Pix informados (`entradaIds`); devolve `vinculados` | `src/app/api/reembolsos/aplicar/route.ts` |
| `GET` | `/api/planejamento/historico` | Resumo do histórico por categoria (12 meses fechados; médias sobre os 6 últimos) para sugerir valores na Fotografia do mês | `src/app/api/planejamento/historico/route.ts` |
| `GET` | `/api/planejamento/realizado` | Planejado × realizado por categoria para `ano`/`mes` (padrão: mês atual); exclui `CATEGORIAS_NEUTRAS`; lista gastos não planejados | `src/app/api/planejamento/realizado/route.ts:37` |

## Parâmetros de filtro — GET /api/lancamentos

| Parâmetro | Tipo | Comportamento | Evidência |
|---|---|---|---|
| `page` | number | Página para paginação (padrão: 1) | `src/app/api/lancamentos/route.ts:354` |
| `limit` | number | Itens por página (padrão: 50) | `src/app/api/lancamentos/route.ts:355` |
| `conta` | string | Filtra por conta exata | `src/app/api/lancamentos/route.ts:356` |
| `categoria` | string | Filtra por categoria; `__sem__` filtra `categoria = null` | `src/app/api/lancamentos/route.ts:365` |
| `tipo` | string | `"Entrada"` ou `"Saída"` | `src/app/api/lancamentos/route.ts:358` |
| `busca` | string | Busca por `descricao` (case-insensitive, contains) | `src/app/api/lancamentos/route.ts:360` |
| `pessoa` | string | Busca por `pessoa` (case-insensitive, contains) | `src/app/api/lancamentos/route.ts:359` |
| `dataInicio` | ISO date string | Início do intervalo de data (por `mesReferencia` ou `data`) | `src/app/api/lancamentos/route.ts:361` |
| `dataFim` | ISO date string | Fim do intervalo de data | `src/app/api/lancamentos/route.ts:362` |

## Contrato POST /api/categorizar

```json
{
  "ids": [1, 2, 3],
  "inteligente": false
}
```

- `ids` (opcional): restringe a categorização a IDs específicos. Se ausente, processa todos sem categoria.
- `inteligente` (padrão `false`): depois das regras, pede ao Claude sugestões para o que sobrou (até 200). As sugestões **não** são gravadas.

Resposta:
```json
{
  "total": 10,
  "porMemoria": 3,
  "porHistorico": 2,
  "porRegras": 4,
  "semCategoria": 1,
  "inteligente": "ok",
  "sugestoes": [{ "id": 7, "categoria": "Farmácia", "certeza": "alta", "descricao": "DROGASIL 2460", "data": "2026-10-03T00:00:00.000Z", "valor": -58.9, "conta": "Nubank · Crédito" }]
}
```

`inteligente` só aparece quando pedido: `"ok"`, `"sem-chave"` ou `"erro"` (com `inteligenteErro`, ex.: "o serviço respondeu HTTP 529").

## Contrato PUT /api/categorizar

Grava as sugestões confirmadas na revisão: `{ "itens": [{ "id": 7, "categoria": "Farmácia" }] }` (1 a 200; categoria da lista). Só altera lançamentos do usuário que continuam sem categoria. Resposta: `{ "aplicados": 1 }`.

`GET /api/categorizar` → `{ "inteligente": true }` quando há `ANTHROPIC_API_KEY` (o botão "✨ Inteligente" só aparece assim).

## Tratamento de erros padrão

| Condição | Status | Corpo |
|---|---|---|
| Sessão inválida ou ausente | `401` | `{ "error": "Não autorizado" }` |
| Parâmetro `id` ausente onde obrigatório | `400` | `{ "error": "id required" }` |
| Campos obrigatórios ausentes no POST de perfil | `400` | `{ "error": "Nome e conta são obrigatórios" }` |
| Sucesso em DELETE/PATCH | `200` | `{ "ok": true }` |
| Criação bem-sucedida (POST) | `201` | Objeto criado |
