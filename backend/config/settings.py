import os
from dotenv import load_dotenv
import supabase
from cryptography.fernet import Fernet

load_dotenv()

supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")
jwks_url = os.getenv("SUPABASE_JWK")

FERNET_KEY = os.getenv("FERNET_KEY")
fernet = Fernet(FERNET_KEY)