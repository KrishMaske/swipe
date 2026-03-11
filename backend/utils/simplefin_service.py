import requests
import base64
from fastapi import HTTPException


def decode_setup_token(token: str) -> str:
    token = token.strip()
    if token.startswith("http://") or token.startswith("https://"):
        return token
    try:
        padding = "=" * (-len(token) % 4)
        raw = base64.urlsafe_b64decode(token + padding)
        decoded = raw.decode("utf-8")
        if not decoded.startswith("http://") and not decoded.startswith("https://"):
            raise HTTPException(status_code=400, detail="Invalid setup token: decoded value is not a valid URL")
        return decoded
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid setup token: failed to decode")

def exchange_setup(setup_token):
    claim_url = decode_setup_token(setup_token)
    response = requests.post(claim_url)
    
    if response.status_code == 200:
        return response.text.strip()
    else:
        return {"error": f"Failed to claim setup: {response.status_code} - {response.text}"}

def retrieve_accounts(access_url, start_date):
    if not access_url or not (access_url.startswith("http://") or access_url.startswith("https://")):
        raise HTTPException(status_code=500, detail=f"Invalid access URL provided: {access_url!r}")

    try:
        response = requests.get(f"{access_url.rstrip('/')}/accounts?start-date={start_date}&pending=1", timeout=10)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error fetching accounts: {e}")

    if response.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Failed to fetch accounts: {response.status_code} - {response.text}")

    try:
        return response.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to parse accounts JSON: {e}")

if __name__ == "__main__":
    # Example usage
    setup_token = input("Enter the setup token: ")
    result = exchange_setup(setup_token)
    print(f"access url: {result}")
    response = requests.get(f"{result}/accounts")
    print(response.json())