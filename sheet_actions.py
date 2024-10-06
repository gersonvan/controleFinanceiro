from __future__ import print_function
from auth import spreadsheet_service
from auth import drive_service
from pprint import pprint
import pandas as pd
from getComprasCartao import transacoes
from getComprasCartao import nu


def create():
    spreadsheet_details = {
    'properties': {
        'title': 'Python-google-sheets-demo'
        }
    }
    sheet = spreadsheet_service.spreadsheets().create(body=spreadsheet_details,
                                    fields='spreadsheetId').execute()
    sheetId = sheet.get('spreadsheetId')
    print('Spreadsheet ID: {0}'.format(sheetId))
    permission1 = {
    'type': 'user',
    'role': 'writer',
    'emailAddress': 'gersonvan@gmail.com'
    }
    drive_service.permissions().create(fileId=sheetId, body=permission1).execute()
    return sheetId

def get_All_Card_Data():
    # Lista de dicionários contendo todas as transações de seu cartão de crédito
    transacoes = nu.get_card_statements()
    
    #file = open('transacoes.txt','w')
    #for transacao in transacoes:
    #    file.write(f"{transacao}"+"\n")
    #file.close()

    # Contém as parcelas da transação
    #transacoes_detalhes = nu.get_card_statement_details()
    #faturas = nu.get_bills()
    #fatura_detalhes = nu.get_bill_details(faturas[8])
    
    #print(*transacoes, sep = "\n")
    
def get_Bill_Data():
    faturas = nu.get_bills()
    
    #print(faturas)
    
    #file = open('faturas.txt','w')
    #for fatura in faturas:
    #    file.write(f"{fatura}"+"\n")
    #file.close()
    
    #for k,v in faturas[8].items():
    #    print(k,v)

    fatura_detalhes = nu.get_bill_details(faturas[8])
    
    #print(list(fatura_detalhes))
    
    for k,v in fatura_detalhes.items():
        for i,j in v.items():
           if i[5] == 'line_items':
            print(j[5])
    
    #file = open('fatura_detalhes.txt','w')
    #file.write(f"{fatura_detalhes}"+"\n")
    #file.close()

#def get_Bill_Future_Data():
#    faturas = nu.get_bills()
#    
#    #print(vars(faturas[1].get()))
#    fatura_futura = nu.get_bill_future_details(faturas[1])

#    file = open('faturas_futuras.txt','w')
#    file.write(f"{fatura_futura}"+"\n")
#    file.close()

def read_range():
    range_name = 'Nubank!A1:G70'
    spreadsheet_id = '1fPJsEYrzapiRgZpT5xgBzpg-vuIn8I8Fd3aG4sIpcEM'
    result = spreadsheet_service.spreadsheets().values().get(
    spreadsheetId=spreadsheet_id, range=range_name).execute()
    rows = result.get('values', [])
    #print('{0} rows retrieved.'.format(len(rows)))
    #print('{0} rows retrieved.'.format(rows))
    return rows

def write_range():
    spreadsheet_id = '1fPJsEYrzapiRgZpT5xgBzpg-vuIn8I8Fd3aG4sIpcEM'
    range_name = 'jsonTeste!A1:H'
    #values = read_range()
    values = get_All_Card_Data()
    value_input_option = 'USER_ENTERED'
    body = {
        'values': values
    }
    result = spreadsheet_service.spreadsheets().values().update(spreadsheetId=spreadsheet_id, range=range_name, valueInputOption=value_input_option, body=body).execute()
    print('{0} cells updated.'.format(result.get('updatedCells')))

#create()
#write_range()
#read_range()
get_All_Card_Data()
#get_Bill_Data()
#get_Bill_Future_Data()