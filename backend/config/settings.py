import os
from dotenv import load_dotenv
from supabase import create_client
from cryptography.fernet import Fernet
from sentence_transformers import SentenceTransformer
from google import genai
from groq import Groq


from functools import lru_cache

load_dotenv()

# Required variables
REQUIRED_VARS = [
    "SUPABASE_URL",
    "SUPABASE_KEY",
    "SUPABASE_SERVICE_KEY",
    "SUPABASE_JWK",
    "FERNET_KEY",
]
missing = [v for v in REQUIRED_VARS if not os.getenv(v)]
if missing:
    raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")

supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")
supabase_service_key = os.getenv("SUPABASE_SERVICE_KEY")
admin = create_client(supabase_url, supabase_service_key)
jwks_url = os.getenv("SUPABASE_JWK")

FERNET_KEY = os.getenv("FERNET_KEY")
fernet = Fernet(FERNET_KEY)

@lru_cache()
def get_groq_client():
    return Groq(api_key=os.environ.get("GROQ_KEY"))

@lru_cache()
def get_gemini_client():
    return genai.Client(api_key=os.environ.get("GEMINI_KEY"))

@lru_cache()
def get_embedder():
    return SentenceTransformer('BAAI/bge-base-en-v1.5')

SIMPLEFIN_CONNECT_TIMEOUT_SECONDS = int(os.getenv("SIMPLEFIN_CONNECT_TIMEOUT_SECONDS", "10"))
SIMPLEFIN_READ_TIMEOUT_SECONDS = int(os.getenv("SIMPLEFIN_READ_TIMEOUT_SECONDS", "60"))
SIMPLEFIN_RETRY_ATTEMPTS = int(os.getenv("SIMPLEFIN_RETRY_ATTEMPTS", "2"))
SIMPLEFIN_RETRY_BACKOFF_SECONDS = float(os.getenv("SIMPLEFIN_RETRY_BACKOFF_SECONDS", "5"))

embedder = get_embedder()
groq_client = get_groq_client()
gemini_client = get_gemini_client()