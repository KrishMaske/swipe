from urllib3 import request
from fastapi import APIRouter, Form
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.country_code import CountryCode
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
from config.settings import plaid_client, products, PLAID_REDIRECT_URI, PLAID_PRODUCTS
from config import state

router = APIRouter()


@router.post('/api/info', tags=["info"])
def info():

    return {
        'item_id': state.item_id,
        'access_token': state.access_token,
        'products': PLAID_PRODUCTS
    }


@router.post("/api/create_link_token", tags=["link_token"])
async def create_link_token():
    try:
        link_request = LinkTokenCreateRequest(
            products=products,
            client_name="Plaid Quickstart",
            country_codes=[CountryCode("US")],
            language="en",
                    user=LinkTokenCreateRequestUser(
                client_user_id="Plaid Quickstart"
            ),
        )
        if PLAID_REDIRECT_URI!=None:
            link_request.redirect_uri=PLAID_REDIRECT_URI
            print("Redirect URI set in link token request:", PLAID_REDIRECT_URI)
        response = plaid_client.link_token_create(link_request)
        return response.to_dict()
    except Exception as e:
        print(e)
        return {"error": str(e)}
    

@router.post("/api/set_access_token", tags=["access_token"])
async def exchange_public_token(public_token: str = Form(...)):
    exchange_request = ItemPublicTokenExchangeRequest(
        public_token=public_token
    )
    exchange_response = plaid_client.item_public_token_exchange(exchange_request).to_dict()
    
    state.access_token = exchange_response['access_token']
    state.item_id = exchange_response['item_id']
    return exchange_response