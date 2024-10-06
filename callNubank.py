from pynubank import Nubank

nu = Nubank()
nu.authenticate_with_cert("89523822349", "G13v11@1981N", "cert.p12")
# Insira aqui o código para se autenticar!
# Veja a seção acima sobre autenticação para mais detalhes ;)

# Lista de dicionários contendo todas as transações de seu cartão de crédito
card_statements = nu.get_card_statements()

# Retorna um dicionário contendo os detalhes de uma transação retornada por get_card_statements()
# Contém as parcelas da transação
card_statement_details = nu.get_card_statement_details(card_statements[0])

# Soma de todas as compras
print(sum([t['amount'] for t in card_statements]))

# Lista de dicionários contendo todas as faturas do seu cartão de crédito
bills = nu.get_bills()

# Retorna um dicionário contendo os detalhes de uma fatura retornada por get_bills()
bill_details = nu.get_bill_details(bills[1])