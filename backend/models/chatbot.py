import os
from datetime import datetime
from fastapi import HTTPException
from pydantic import BaseModel
from google import genai
from supabase import create_client, Client
from config.settings import gemini_client, groq_client
from google.genai import types


class ChatRequest(BaseModel):
    question: str

class ChatResponse(BaseModel):
    response: str

# 4. The Core RAG Endpoint
async def ask_financial_assistant(context, request: ChatRequest):
    sb = context["supabase"]
    user_id = context["user_id"]
    try:
        embed_response = gemini_client.models.embed_content(
            model='gemini-embedding-001',
            contents=request.question,
            config=types.EmbedContentConfig(output_dimensionality=768)
        )

        query_vector = embed_response.embeddings[0].values

        search_response = sb.rpc(
            'match_transactions',
            {
                'query_embedding': query_vector,
                'match_threshold': 0.3,
                'match_count': 15,
                'p_user_id': user_id
            }
        ).execute()

        transactions = search_response.data
        
        if not transactions:
            return ChatResponse(response="I couldn't find any recent transactions matching that question. Can you rephrase it?")

        formatted_swipes = []
        for t in transactions:
            try:
                readable_date = datetime.fromtimestamp(float(t['txn_date'])).strftime('%Y-%m-%d')
            except:
                readable_date = "Unknown Date"
                
            formatted_swipes.append(
                f"{readable_date} - {t.get('merchant', 'Unknown')}: ${abs(float(t.get('amount', 0))):.2f} "
                f"(Category: {t.get('category', 'None')})"
            )
            
        context_text = "\n".join(formatted_swipes)

        system_prompt = f"""You are a helpful, precise personal finance AI assistant.
        Answer the user's question using ONLY the following transaction data. 
        If the data does not contain the answer, explicitly state that you don't know. 
        Do not give general financial advice unless specifically asked. Keep it concise.
        
        User's Transaction Context:
        {context_text}"""

        chat_completion = groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": request.question}
            ],
            model="openai/gpt-oss-120b", 
            temperature=0.1,
            max_completion_tokens=500,
            top_p=1,
            reasoning_effort="medium",
            stop=None
        )

        return ChatResponse(response=chat_completion.choices[0].message.content)

    except Exception as e:
        print(f"Chatbot Error: {str(e)}") # Log it to the terminal
        raise HTTPException(status_code=500, detail="An error occurred while processing your question.")