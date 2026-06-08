# Setup — Controle Financeiro Web

## 1. Banco de dados (Neon — gratuito)

1. Acesse https://neon.tech e crie uma conta gratuita
2. Crie um novo projeto (ex: "financeiro")
3. Na tela de conexão, copie a **Connection string** (começa com `postgresql://...`)
4. Abra o arquivo `.env` e cole na variável `DATABASE_URL`

## 2. Configurar variáveis de ambiente

Edite o arquivo `.env`:

```env
DATABASE_URL="postgresql://usuario:senha@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require"

# Opcional: chave do Gemini para categorização por IA
# Obtenha em https://aistudio.google.com/app/apikey
GEMINI_API_KEY=""
```

## 3. Criar as tabelas no banco

```bash
npx prisma migrate dev --name init
```

## 4. Rodar localmente

```bash
npm run dev
```

Acesse http://localhost:3000

## 5. Migrar dados da planilha antiga

Com o servidor rodando (`npm run dev`), execute:

```bash
python3 scripts/migrate-xlsx.py
```

Isso vai importar todos os 2205 lançamentos e as 47 regras da Memória da IA.

## 6. Deploy no Vercel (gratuito)

1. Suba o código para o GitHub:
   ```bash
   git add -A && git commit -m "Initial commit"
   git remote add origin https://github.com/seu-usuario/financeiro-web.git
   git push -u origin main
   ```
2. Acesse https://vercel.com → "Import Project" → selecione o repositório
3. Em **Environment Variables**, adicione `DATABASE_URL` com a mesma URL do Neon
4. Clique em **Deploy**

O Vercel faz deploy automático a cada push!

## Estrutura das páginas

| URL | Descrição |
|-----|-----------|
| `/` | Dashboard com gráficos |
| `/lancamentos` | Lista e edição de transações |
| `/importar` | Upload de CSV do C6/Nubank |
| `/previsao` | Previsão de parcelamentos e gastos fixos |
| `/memoria-ia` | Regras de categorização automática |

## Como importar CSVs

O nome do arquivo determina o mês de referência:
- **C6 Crédito**: `Fatura_AAAA_MM.csv`
- **C6 Débito**: `Extrato_AAAA_MM.csv`
- **Nubank Crédito**: `Nubank_AAAA_MM.csv`
- **Nubank Débito**: `NU_AAAA_MM.csv`

## Categorização com IA

- **Automática (grátis)**: regras manuais + Memória da IA — sem custo, instantânea
- **Gemini Flash**: fallback para transações não reconhecidas — 1500 req/dia grátis no Google AI Studio
- Na página de Lançamentos, clique em "🤖 Categorizar sem categoria" para processar pendentes
