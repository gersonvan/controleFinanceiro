# Frontend

## Estratégia de renderização

O projeto utiliza o **Next.js App Router** (introduzido no Next.js 13) com Turbopack habilitado. A estratégia de renderização adotada é:

- **Server Components** (padrão): layout raiz `src/app/layout.tsx` e a maioria das páginas de nível superior lêem a sessão no servidor via `auth()`.
- **Client Components** (`"use client"`): componentes que precisam de estado, efeitos ou interatividade com o usuário (formulários de filtro, tabelas com paginação, gráficos).
- **Sem SSG ou ISR explícito**: todas as páginas são dinâmicas, pois dependem de dados do usuário autenticado.

## Inventário de páginas

| Rota | Arquivo | Descrição | Acesso |
|---|---|---|---|
| `/` | `src/app/page.tsx` | Dashboard com totais, gráficos de categorias e evolução mensal; lembrete da fotografia enquanto não feita, card Planejado × Realizado do mês quando feita, estado vazio com CTAs de importar/lançar à mão; cartões Como você pagou, Ritmo do mês e Custo de dívida (`PaineisFinancas`) | Requer autenticação + onboarding |
| `/financas/meios` | `src/app/financas/meios/page.tsx` | Como você pagou: 6 meses por meio de pagamento (barras empilhadas + tabela com média e guardado); navega por mês | Requer autenticação + onboarding |
| `/financas/divida` | `src/app/financas/divida/page.tsx` | Custo de dívida: 12 meses de juros/IOF/multas, de onde vem e o que fazer | Requer autenticação + onboarding |
| `/planejamento` | `src/app/planejamento/page.tsx` | Abas Fotografia do mês (wizard) e Planejado × Realizado; `?aba=comparacao` abre a segunda | Requer autenticação + onboarding |
| `/lancamentos` | `src/app/lancamentos/page.tsx` | Lista paginada de lançamentos com filtros e edição inline; botão **+ Novo** abre o lançamento manual (`?novo=1` abre direto) | Requer autenticação + onboarding |
| `/matriz` | `src/app/matriz/page.tsx` | Matriz de gastos: categorias × meses, com drill-down por descrição | Requer autenticação + onboarding |
| `/importar` | `src/app/importar/page.tsx` | Fluxo de importação de extrato (upload, preview, confirmação) | Requer autenticação + onboarding |
| `/previsao` | `src/app/previsao/page.tsx` | Previsão de despesas dos próximos 12 meses | Requer autenticação + onboarding |
| `/emprestimos` | `src/app/emprestimos/page.tsx` | Controle de empréstimos por pessoa com status | Requer autenticação + onboarding |
| `/memoria-ia` | `src/app/memoria-ia/page.tsx` | Gerenciamento de regras da memória de IA | Requer autenticação + onboarding |
| `/configuracoes` | `src/app/configuracoes/page.tsx` | Tipo de cada conta (corrente/cartão) e gerenciamento de perfis de importação (ativar/desativar/criar/excluir) | Requer autenticação + onboarding |
| `/onboarding` | `src/app/onboarding/page.tsx` | Wizard de 4 etapas para configuração inicial do usuário | Requer autenticação; acessível sem onboarding |
| `/login` | `src/app/login/page.tsx` | Página de login com botão "Entrar com Google" | Público |

## Componentes compartilhados

| Componente | Arquivo | Responsabilidade |
|---|---|---|
| `Nav` | `src/components/Nav.tsx` | Barra de navegação lateral com 9 links; ocultada durante onboarding e em sessões sem autenticação |
| `FotografiaWizard` | `src/components/planejamento/FotografiaWizard.tsx` | Wizard da Fotografia do mês (entradas → fixos → variáveis → sazonais → parcelas → resumo); `modo="onboarding"` mostra "Fazer depois", `modo="pagina"` permite salvar em qualquer etapa; sempre envia o conjunto inteiro ao `PUT /api/planejamento`; com histórico, sugere valores nos chips, mostra referência em categorias compartilhadas e o bloco "Encontrado no seu histórico" (`GET /api/planejamento/historico`); sem histórico, mostra a dica da funcionalidade |
| `PlanejadoRealizado` | `src/components/planejamento/PlanejadoRealizado.tsx` | Tabela e cartões do Planejado × Realizado de um mês (`GET /api/planejamento/realizado`) |
| `LancamentoForm` | `src/components/LancamentoForm.tsx` | Modal de lançamento manual (`POST /api/lancamentos`); contas sugeridas a partir dos perfis |
| `LeituraPDF` | `src/components/importacao/LeituraPDF.tsx` | O que foi lido de um PDF antes de importar: lista completa, soma, aviso da conferência com o resumo da fatura (`AvisoConferencia`, também no lote) e revisão das linhas (corrigir, excluir, incluir — `lib/importacao/ajustes.ts`), com a conferência refeita na hora |
| `ComoBaixarExtrato` | `src/components/ComoBaixarExtrato.tsx` | Instruções de onde obter OFX/PDF/CSV; usado no onboarding e em `/importar` |
| `DividirPainel` | `src/components/DividirPainel.tsx` | Painel lateral "Dividir" de Lançamentos: busca de gastos com filtro ao digitar, seleção múltipla, prévia da parte de cada gasto e "Desfazer divisão"; pré-marca o gasto sugerido pelo padrão e, depois de salvar, oferece dividir os Pix parecidos do mesmo pagador |
| `PaineisFinancas` | `src/components/financas/PaineisFinancas.tsx` | Os três cartões mensais do dashboard (`/api/financas/*`) |
| `NavegadorMes` | `src/components/financas/NavegadorMes.tsx` | Cabeçalho das páginas `/financas/*`: voltar e trocar de mês pela URL (`?ano&mes`) |
| `ContasTipo` | `src/components/ContasTipo.tsx` | Seção Contas de Configurações: alterna corrente/cartão (`/api/contas`) |
| `CategoriaSelect` | `src/components/CategoriaSelect.tsx` | Select de categorias agrupado em Saídas/Entradas |

## Layout raiz e controle de sessão

O `src/app/layout.tsx` é um Server Component que:

1. Chama `auth()` do NextAuth para obter a sessão no servidor.
2. Se a sessão for `null` ou `onboardingCompleto === false`, renderiza o `<body>` sem o componente `Nav` (layout mínimo para páginas de login e onboarding).
3. Se autenticado e onboarding concluído, envolve o conteúdo com `<SessionProvider>` (para habilitar `useSession` nos Client Components) e inclui o componente `Nav`.

```
src/app/layout.tsx:
  if (!session || session.onboardingCompleto === false) → layout sem Nav
  else → SessionProvider + Nav + children
```

## Wizard de onboarding

`src/app/onboarding/page.tsx` é um Client Component com 4 etapas:

| Etapa | Conteúdo |
|---|---|
| 1 | Boas-vindas e campo de nome do usuário |
| 2 | Fotografia do mês (`FotografiaWizard` em modo onboarding) — opcional, com "Fazer depois"; concluir grava `fotografiaConcluidaEm` |
| 3 | Seleção de bancos (toggle de perfis via `GET /api/perfis?todos=true`) + `ComoBaixarExtrato` |
| 4 | Checklist de próximos passos (importar ou lançar à mão → categorizar → comparar com a fotografia); cada item conclui o onboarding e leva ao destino |

Ao finalizar:
1. Chama `PATCH /api/onboarding` com o nome informado.
2. Chama `await update({ onboardingCompleto: true })` do `next-auth/react` para atualizar o JWT no cliente.
3. Redireciona para a rota escolhida via `router.push()`.

## Navegação

`src/components/Nav.tsx` define os 8 links de navegação principal:

| Rota | Rótulo |
|---|---|
| `/` | Dashboard |
| `/planejamento` | Planejamento |
| `/lancamentos` | Lançamentos |
| `/matriz` | Matriz |
| `/importar` | Importar |
| `/previsao` | Previsão |
| `/emprestimos` | Empréstimos |
| `/memoria-ia` | Memória IA |
| `/configuracoes` | Configurações |

## Bibliotecas de interface

| Biblioteca | Versão | Uso |
|---|---|---|
| Tailwind CSS | 4.3.0 | Estilização utilitária em todos os componentes |
| lucide-react | 1.17.0 | Ícones SVG como componentes React na navegação e botões |
| recharts | 3.8.1 | Gráficos de barras, pizza e linha no dashboard |

## Convenções de estado e dados

- Dados são carregados via `fetch` do lado do cliente para as API Routes (não há Server Actions).
- Estado local de filtros e seleção é gerenciado com `useState`/`useEffect` nos Client Components.
- A sessão do usuário é acessível nos Client Components via `useSession()` do `next-auth/react`.
- Não há gerenciador de estado global (sem Redux, Zustand ou Context API de estado).
