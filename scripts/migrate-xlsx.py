#!/usr/bin/env python3
"""
Migra os dados do Novo Controle Financeiro.xlsx para o banco PostgreSQL via API.

Uso:
  1. Certifique-se que o servidor está rodando: npm run dev
  2. Execute: python3 scripts/migrate-xlsx.py

Ou diretamente com psycopg2/DATABASE_URL:
  DATABASE_URL=... python3 scripts/migrate-xlsx.py --direct
"""
import sys, json, math
from datetime import datetime

try:
    import pandas as pd
except ImportError:
    print("pandas não encontrado. Instalando...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pandas", "openpyxl", "--break-system-packages"])
    import pandas as pd

XLSX_PATH = "/Users/gersonvan/Downloads/Novo Controle Financeiro (1).xlsx"
API_BASE = "http://localhost:3000"


def to_iso(val):
    if pd.isna(val):
        return None
    if isinstance(val, (datetime,)):
        return val.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    if isinstance(val, str):
        # dd/MM/yyyy
        try:
            d = datetime.strptime(val.strip(), "%d/%m/%Y")
            return d.strftime("%Y-%m-%dT%H:%M:%S.000Z")
        except:
            pass
        # MM/yyyy -> primeiro dia
        try:
            d = datetime.strptime(val.strip(), "%m/%Y")
            return d.strftime("%Y-%m-%dT%H:%M:%S.000Z")
        except:
            pass
    return None


def migrar_via_api():
    import urllib.request

    print("Carregando planilha…")
    xlsx = pd.read_excel(XLSX_PATH, sheet_name=None)

    # --- Memória da IA ---
    df_mem = xlsx.get("Memória da IA")
    if df_mem is not None and len(df_mem) > 0:
        print(f"Migrando {len(df_mem)} regras da Memória da IA…")
        for _, row in df_mem.iterrows():
            if pd.isna(row.iloc[0]) or pd.isna(row.iloc[1]):
                continue
            payload = json.dumps({
                "descricao": str(row.iloc[0]).strip(),
                "categoriaCorreta": str(row.iloc[1]).strip(),
            }).encode()
            req = urllib.request.Request(
                f"{API_BASE}/api/memoria-ia",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            try:
                urllib.request.urlopen(req)
            except Exception as e:
                print(f"  Erro ao salvar regra '{row.iloc[0]}': {e}")
        print("  ✅ Memória da IA migrada!")

    # --- Lançamentos ---
    df_lanc = xlsx.get("Lançamentos Gerais")
    if df_lanc is None:
        print("Aba 'Lançamentos Gerais' não encontrada!")
        return

    print(f"Migrando {len(df_lanc)} lançamentos…")
    BATCH = 100
    ok = 0
    erros = 0

    for start in range(0, len(df_lanc), BATCH):
        batch = df_lanc.iloc[start:start + BATCH]
        lancamentos = []
        for _, row in batch.iterrows():
            data_iso = to_iso(row.iloc[0])
            if not data_iso:
                continue
            valor = row.iloc[3]
            if pd.isna(valor) or not isinstance(valor, (int, float)):
                continue
            if math.isnan(float(valor)):
                continue

            lancamento = {
                "data": data_iso,
                "descricao": str(row.iloc[1]).strip() if not pd.isna(row.iloc[1]) else "",
                "categoria": str(row.iloc[2]).strip() if not pd.isna(row.iloc[2]) else None,
                "valor": float(valor),
                "tipo": str(row.iloc[4]).strip() if not pd.isna(row.iloc[4]) else "Saída",
                "conta": str(row.iloc[5]).strip() if not pd.isna(row.iloc[5]) else "C6 Débito",
                "status": str(row.iloc[6]).strip() if not pd.isna(row.iloc[6]) else "Paga",
                "fonte": str(row.iloc[7]).strip() if not pd.isna(row.iloc[7]) else None,
                "mesReferencia": to_iso(row.iloc[8]) if len(row) > 8 else None,
            }
            if not lancamento["descricao"]:
                continue
            lancamentos.append(lancamento)

        # Envia batch
        for l in lancamentos:
            payload = json.dumps(l).encode()
            req = urllib.request.Request(
                f"{API_BASE}/api/lancamentos",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            try:
                urllib.request.urlopen(req)
                ok += 1
            except Exception as e:
                erros += 1

        print(f"  {min(start + BATCH, len(df_lanc))}/{len(df_lanc)} processados…", end="\r")

    print(f"\n✅ Migração concluída: {ok} lançamentos importados, {erros} erros.")


if __name__ == "__main__":
    migrar_via_api()
