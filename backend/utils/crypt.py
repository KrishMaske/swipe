from config.settings import fernet

def encrypt(plaintxt):
    return fernet.encrypt(plaintxt.encode()).decode()

def decrypt(ciphertext):
    return fernet.decrypt(ciphertext.encode()).decode()