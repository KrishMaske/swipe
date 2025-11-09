from config.settings import plaid_client
import plaid
from plaid.model.transactions_sync_request import TransactionsSyncRequest
from config import state



def get_transactions():
    if not state.access_token:
        return {"error": "Access token is not set."}
    
    request = TransactionsSyncRequest(
        access_token=state.access_token,
    )
    response = plaid_client.transactions_sync(request).to_dict()
    transactions = response['added'] or []

    # the transactions in the response are paginated, so make multiple calls while incrementing the cursor to
    # retrieve all transactions
    while (response['has_more']):
        request = TransactionsSyncRequest(
            access_token=state.access_token,
            cursor=response['next_cursor']
        )
        response = plaid_client.transactions_sync(request).to_dict()
        transactions += response['added'] or []
    
    return transactions