import os
from dotenv import load_dotenv
from cryptography.fernet import Fernet
from google import genai
from groq import Groq


load_dotenv()

supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")
jwks_url = os.getenv("SUPABASE_JWK")

FERNET_KEY = os.getenv("FERNET_KEY")
fernet = Fernet(FERNET_KEY)

gemini_client = genai.Client(api_key=os.environ.get("GEMINI_KEY"))
groq_client = Groq(api_key=os.environ.get("GROQ_KEY"))
