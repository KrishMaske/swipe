import os
from dotenv import load_dotenv
from supabase import create_client
from cryptography.fernet import Fernet
from sentence_transformers import SentenceTransformer
from groq import Groq


load_dotenv()

supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")
supabase_service_key = os.getenv("SUPABASE_SERVICE_KEY")
admin = create_client(supabase_url, supabase_service_key)
jwks_url = os.getenv("SUPABASE_JWK")

FERNET_KEY = os.getenv("FERNET_KEY")
fernet = Fernet(FERNET_KEY)

groq_client = Groq(api_key=os.environ.get("GROQ_KEY"))

embedding_model = SentenceTransformer('BAAI/bge-base-en-v1.5')