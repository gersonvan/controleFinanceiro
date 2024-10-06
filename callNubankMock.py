from pynubank import Nubank, MockHttpClient

nu = Nubank(MockHttpClient())
nu.authenticate_with_cert("qualquer-cpf", "qualquer-senha", "cert.p12")
# Essa linha funciona porque não estamos chamando o servidor do Nubank ;)

print(nu.get_account_balance())
# Qualquer método chamado não passará pelo Nubank e terá o retorno instantâneo.
