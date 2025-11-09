import os
from dotenv import load_dotenv
import plaid
from plaid.api import plaid_api
from plaid.model.products import Products

load_dotenv()

PLAID_CLIENT_ID = os.getenv("PLAID_CLIENT_ID")
PLAID_SECRET = os.getenv("PLAID_SECRET")
PLAID_ENV = os.getenv("PLAID_ENV")
PLAID_PRODUCTS = os.getenv("PLAID_PRODUCTS").split(",")
PLAID_REDIRECT_URI = os.getenv("PLAID_REDIRECT_URI")

if PLAID_ENV == 'sandbox':
    host = plaid.Environment.Sandbox
elif PLAID_ENV == 'development':
    host = plaid.Environment.Development

configuration = plaid.Configuration(
    host=host,
    api_key={
        'clientId': PLAID_CLIENT_ID,
        'secret': PLAID_SECRET,
    }
)

api_client = plaid.ApiClient(configuration)
plaid_client = plaid_api.PlaidApi(api_client)
products = []
for product in PLAID_PRODUCTS:
    products.append(Products(product))
