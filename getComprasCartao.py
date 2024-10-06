import csv
from pynubank import Nubank

nu = Nubank()
nu.authenticate_with_cert("89523822349", "G13v11@1981N", "cert.p12")
# Essa linha funciona porque não estamos chamando o servidor do Nubank ;)
print("Autenticado no Nubank")

transacoes = nu.get_card_statements()
#transacoes = nu.get_card_statement_details(compras_cartao[0])

#df = transacoes
#df = df.to_json

# Separa as transações em parcelamentos e compras
#parcelamentos = []
#compras = []

'''
for transacao in transacoes:
    if 'details' in transacao and 'count' in transacao['details'].get('charges', {}):
        parcelamentos.append(transacao)
    else:
        compras.append(transacao)
'''
#print(df)
#tamanho = len(transacoes)