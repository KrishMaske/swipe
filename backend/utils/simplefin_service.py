import httpx
import base64
import asyncio
from fastapi import HTTPException
from config.settings import (
    SIMPLEFIN_CONNECT_TIMEOUT_SECONDS,
    SIMPLEFIN_READ_TIMEOUT_SECONDS,
    SIMPLEFIN_RETRY_ATTEMPTS,
    SIMPLEFIN_RETRY_BACKOFF_SECONDS,
)


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

async def exchange_setup(setup_token):
    claim_url = decode_setup_token(setup_token)
    async with httpx.AsyncClient() as client:
        response = await client.post(claim_url)
    
    if response.status_code == 200:
        return response.text.strip()
    else:
        return {"error": f"Failed to claim setup: {response.status_code} - {response.text}"}

async def retrieve_accounts(access_url, start_date):
    if not access_url or not (access_url.startswith("http://") or access_url.startswith("https://")):
        raise HTTPException(status_code=500, detail=f"Invalid access URL provided: {access_url!r}")

    url = f"{access_url.rstrip('/')}/accounts?start-date={start_date}&pending=1"
    last_error = None

    timeout = httpx.Timeout(SIMPLEFIN_READ_TIMEOUT_SECONDS, connect=SIMPLEFIN_CONNECT_TIMEOUT_SECONDS)

    async with httpx.AsyncClient(timeout=timeout) as client:
        for attempt in range(SIMPLEFIN_RETRY_ATTEMPTS + 1):
            try:
                response = await client.get(url)
                break
            except httpx.ReadTimeout as exc:
                last_error = exc
                if attempt >= SIMPLEFIN_RETRY_ATTEMPTS:
                    raise HTTPException(
                        status_code=504,
                        detail=(
                            "SimpleFIN timed out while fetching accounts. "
                            f"Tried {attempt + 1} time(s) with a {SIMPLEFIN_READ_TIMEOUT_SECONDS}s read timeout."
                        ),
                    ) from exc
                await asyncio.sleep(SIMPLEFIN_RETRY_BACKOFF_SECONDS * (attempt + 1))
            except httpx.RequestError as exc:
                last_error = exc
                if attempt >= SIMPLEFIN_RETRY_ATTEMPTS:
                    raise HTTPException(status_code=502, detail=f"Error fetching accounts: {exc}") from exc
                await asyncio.sleep(SIMPLEFIN_RETRY_BACKOFF_SECONDS * (attempt + 1))
        else:
            raise HTTPException(status_code=502, detail=f"Error fetching accounts: {last_error}")

    if response.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Failed to fetch accounts: {response.status_code} - {response.text}")

    try:
        return response.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to parse accounts JSON: {e}")

if __name__ == "__main__":
    # Example usage (simplified for CLI)
    async def main():
        setup_token = input("Enter the setup token: ")
        result = await exchange_setup(setup_token)
        print(f"access url: {result}")
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{result}/accounts")
            print(response.json())
            
    asyncio.run(main())