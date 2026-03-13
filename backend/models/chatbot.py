from datetime import datetime
import re
from typing import List, Optional
from fastapi import HTTPException
from pydantic import BaseModel
from config.settings import embedding_model, groq_client

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    question: str
    history: Optional[List[Message]] = []

class ChatResponse(BaseModel):
    response: str


def _recent_user_text(history: Optional[List[Message]], turns: int = 3) -> str:
    if not history:
        return ""
    user_turns = [m.content.strip() for m in history if m.role == "user" and m.content]
    return " ".join(user_turns[-turns:]).lower()


def _is_ambiguous_follow_up(question: str) -> bool:
    q = question.strip().lower()
    phrases = {
        "can you do it for me",
        "do it for me",
        "do it",
        "for me",
        "okay",
        "ok",
        "sure",
        "yes",
        "yeah",
    }
    return q in phrases or len(q.split()) <= 5


def _is_spending_optimization_question(question: str) -> bool:
    q = question.lower()
    keywords = [
        "cut down",
        "reduce",
        "spending",
        "spend less",
        "save money",
        "where can i cut",
        "overspending",
        "expenses",
    ]
    return any(k in q for k in keywords)


def _is_general_finance_question(question: str) -> bool:
    q = question.lower()
    keywords = [
        "budget",
        "budgeting",
        "save",
        "saving",
        "savings",
        "invest",
        "investing",
        "debt",
        "emergency fund",
        "financial plan",
        "financial planning",
        "50/30/20",
    ]
    return any(k in q for k in keywords)


def _build_search_query(question: str, history: Optional[List[Message]]) -> str:
    """Build a retrieval query that preserves entities across follow-up turns."""
    if not history:
        return question

    user_turns = [m.content.strip() for m in history if m.role == "user" and m.content]
    recent_user_turns = user_turns[-3:]

    parts = [p for p in recent_user_turns + [question.strip()] if p]
    query = " ".join(parts)

    # Keep embeddings stable and avoid very long retrieval prompts.
    return query[:600]


def _fetch_transactions(sb, query_vector: list[float], user_id: str, threshold: float, count: int):
    response = sb.rpc(
        'match_transactions',
        {
            'query_embedding': query_vector,
            'match_threshold': threshold,
            'match_count': count,
            'p_user_id': user_id,
        }
    ).execute()
    return response.data or []


def _fetch_recent_transactions(sb, user_id: str, limit: int = 60):
    response = (
        sb.table("transactions")
        .select("txn_date,merchant,amount,category,city,state")
        .eq("user_id", user_id)
        .order("txn_date", desc=True)
        .limit(limit)
        .execute()
    )
    return response.data or []


def _filter_food_transactions(transactions: list[dict]) -> list[dict]:
    food = []
    for t in transactions:
        category = str(t.get("category") or "").lower()
        merchant = str(t.get("merchant") or "").lower()
        if "food" in category or "dining" in category:
            food.append(t)
            continue
        if any(k in merchant for k in ["dunkin", "taco", "chipotle", "qdoba", "starbucks", "coffee"]):
            food.append(t)
    return food


def _compute_spending_stats(transactions: list[dict]) -> dict:
    if not transactions:
        return {"count": 0, "total": 0.0, "weekly_avg": 0.0, "weeks": 0.0}

    amounts = []
    timestamps = []
    for t in transactions:
        try:
            amounts.append(abs(float(t.get("amount", 0) or 0)))
        except (TypeError, ValueError):
            continue

        try:
            timestamps.append(float(t.get("txn_date")))
        except (TypeError, ValueError):
            pass

    if not amounts:
        return {"count": 0, "total": 0.0, "weekly_avg": 0.0, "weeks": 0.0}

    total = round(sum(amounts), 2)
    count = len(amounts)

    if len(timestamps) >= 2:
        span_seconds = max(timestamps) - min(timestamps)
        weeks = max(1.0, span_seconds / (7 * 24 * 3600))
    else:
        weeks = 1.0

    weekly_avg = round(total / weeks, 2)
    return {"count": count, "total": total, "weekly_avg": weekly_avg, "weeks": round(weeks, 1)}


def _extract_weekly_budget_amount(text: str) -> Optional[float]:
    if not text:
        return None

    pattern = r"\$\s*(\d+(?:\.\d+)?)\s*(?:/|per\s*)?\s*(?:week|weekly)"
    match = re.search(pattern, text.lower())
    if match:
        try:
            return float(match.group(1))
        except ValueError:
            return None

    return None


def _is_budget_comparison_question(question: str) -> bool:
    q = question.lower()
    triggers = ["more than", "higher than", "too high", "too much", "help me save", "wouldnt help", "wouldn't help"]
    return ("week" in q or "weekly" in q) and any(t in q for t in triggers)

async def ask_financial_assistant(context, request: ChatRequest):
    sb = context["supabase"]
    user_id = context["user_id"]
    
    try:
        search_query = _build_search_query(request.question, request.history)

        query_vector = embedding_model.encode(search_query).tolist()

        direct_general = _is_general_finance_question(request.question)
        direct_spending = _is_spending_optimization_question(request.question)
        recent_text = _recent_user_text(request.history)
        carry_over_intent = _is_ambiguous_follow_up(request.question)
        inferred_general = carry_over_intent and _is_general_finance_question(recent_text)
        inferred_spending = carry_over_intent and _is_spending_optimization_question(recent_text)

        wants_general_guidance = direct_general or inferred_general
        wants_spending_advice = direct_spending or inferred_spending

        transactions = _fetch_transactions(
            sb=sb,
            query_vector=query_vector,
            user_id=user_id,
            threshold=0.2,
            count=25,
        )

        # Spending-cutdown prompts are broad; retry with a lower threshold to avoid false misses.
        if not transactions and wants_spending_advice:
            transactions = _fetch_transactions(
                sb=sb,
                query_vector=query_vector,
                user_id=user_id,
                threshold=0.0,
                count=50,
            )

        # Final fallback for spending/budget discussions: use recent user transactions directly.
        if not transactions and (wants_spending_advice or wants_general_guidance):
            transactions = _fetch_recent_transactions(sb=sb, user_id=user_id, limit=60)

        # Deterministic comparison for weekly budget questions to avoid contradictory answers.
        if transactions and (wants_spending_advice or wants_general_guidance):
            food_txns = _filter_food_transactions(transactions)
            food_stats = _compute_spending_stats(food_txns)

            budget_amount = _extract_weekly_budget_amount(request.question)
            if budget_amount is None and carry_over_intent:
                budget_amount = _extract_weekly_budget_amount(recent_text)

            if budget_amount is not None and _is_budget_comparison_question(request.question) and food_stats["count"] > 0:
                weekly_avg = food_stats["weekly_avg"]
                recommended = max(1.0, round(weekly_avg * 0.85, 2))

                if budget_amount > weekly_avg:
                    msg = (
                        f"Yes, ${budget_amount:.2f}/week is above your current Food & Dining pace of about "
                        f"${weekly_avg:.2f}/week (based on ${food_stats['total']:.2f} across {food_stats['count']} transactions over about {food_stats['weeks']:.1f} weeks). "
                        f"To save money, set a target closer to ${recommended:.2f}/week instead."
                    )
                else:
                    msg = (
                        f"You are right to focus on savings. Your current Food & Dining pace is about ${weekly_avg:.2f}/week "
                        f"(from ${food_stats['total']:.2f} across {food_stats['count']} transactions over about {food_stats['weeks']:.1f} weeks). "
                        f"A savings target would be around ${recommended:.2f}/week."
                    )

                return ChatResponse(response=msg)
        
        if not transactions:
            if wants_general_guidance or wants_spending_advice:
                llm_messages = [{
                    "role": "system",
                    "content": (
                        "You are a helpful personal finance assistant. "
                        "The user asked for general finance guidance. "
                        "If transaction context is unavailable, provide practical advice and clearly say it is general guidance. "
                        "Give clear, practical advice in concise steps. "
                        "Keep the response under 140 words unless the user asks for more detail."
                    ),
                }]

                for msg in request.history:
                    llm_messages.append({"role": msg.role, "content": msg.content})

                llm_messages.append({"role": "user", "content": request.question})

                chat_completion = groq_client.chat.completions.create(
                    messages=llm_messages,
                    model="openai/gpt-oss-120b",
                    temperature=0.2,
                    max_completion_tokens=500,
                    top_p=1,
                    reasoning_effort="medium",
                    stop=None,
                )

                return ChatResponse(response=chat_completion.choices[0].message.content)

            return ChatResponse(response="I couldn't find matching transactions for that question right now. I can still give general advice, or you can sync accounts and ask again for spending-specific recommendations.")

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

        food_stats = _compute_spending_stats(_filter_food_transactions(transactions))
        food_summary = (
            f"Food & Dining summary from provided context: total=${food_stats['total']:.2f}, "
            f"count={food_stats['count']}, weekly_avg=${food_stats['weekly_avg']:.2f}, span_weeks={food_stats['weeks']:.1f}."
            if food_stats["count"] > 0
            else "Food & Dining summary from provided context: no clear Food & Dining transactions detected."
        )

        system_prompt = f"""You are a helpful, precise personal finance AI assistant.
        Answer the user's question using ONLY the following transaction data. 
        If the data does not contain the answer, explicitly state that you don't know. 
        For follow-up questions, use the prior chat history to resolve references like "it", "that", or "last time".
        If the latest user question is ambiguous (for example "can you do it for me"), infer intent from recent user turns.
        Do not give general financial advice unless specifically asked.
        Keep responses concise and complete, ideally under 120 words unless the user asks for detailed guidance.        
        {food_summary}

        User's Transaction Context:
        {context_text}"""

        llm_messages = [{"role": "system", "content": system_prompt}]
        
        for msg in request.history:
            llm_messages.append({"role": msg.role, "content": msg.content})
            
        llm_messages.append({"role": "user", "content": request.question})

        chat_completion = groq_client.chat.completions.create(
            messages=llm_messages,
            model="openai/gpt-oss-120b", 
            temperature=0.1,
            max_completion_tokens=500,
            top_p=1,
            reasoning_effort="medium",
            stop=None
        )

        return ChatResponse(response=chat_completion.choices[0].message.content)

    except Exception as e:
        print(f"Chatbot Error: {str(e)}")
        raise HTTPException(status_code=500, detail="An error occurred while processing your question.")