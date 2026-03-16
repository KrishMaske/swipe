from datetime import datetime
from dateutil import parser as dateutil_parser
import re
from typing import List, Optional
from fastapi import HTTPException
from pydantic import BaseModel
from config.settings import embedding_model, groq_client
from database.db import get_chat_summary, upsert_chat_summary

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    question: str
    history: Optional[List[Message]] = []

class ChatResponse(BaseModel):
    response: str


SUMMARY_CHAR_LIMIT = 1500


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

def _parse_txn_date(raw) -> datetime | None:
    """Parse txn_date whether it's an epoch number or a timestamp string."""
    if raw is None:
        return None
    # Try epoch float first
    try:
        ts = float(raw)
        if ts > 1e9:  # looks like a Unix epoch
            return datetime.fromtimestamp(ts)
    except (TypeError, ValueError):
        pass
    # Try parsing as a datetime string
    try:
        return dateutil_parser.parse(str(raw))
    except (ValueError, TypeError):
        return None


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

        parsed_dt = _parse_txn_date(t.get("txn_date"))
        if parsed_dt:
            timestamps.append(parsed_dt.timestamp())

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


def _history_for_summary(history: Optional[List[Message]], keep: int = 8) -> str:
    if not history:
        return ""
    lines = []
    for msg in history[-keep:]:
        role = "User" if msg.role == "user" else "Assistant"
        text = (msg.content or "").strip().replace("\n", " ")
        if text:
            lines.append(f"{role}: {text}")
    return "\n".join(lines)


def _fallback_summary(existing_summary: str, question: str, answer: str) -> str:
    q = question.strip().replace("\n", " ")
    a = answer.strip().replace("\n", " ")
    combined = f"{existing_summary}\nLatest user question: {q}\nLatest assistant answer: {a}".strip()
    return combined[-SUMMARY_CHAR_LIMIT:]


def _roll_summary(existing_summary: str, question: str, answer: str, history: Optional[List[Message]]) -> str:
    history_text = _history_for_summary(history)
    system_prompt = (
        "You maintain a rolling memory summary for a personal finance assistant. "
        "Update the memory with only durable, high-signal facts and preferences. "
        "Keep it concise, <= 10 bullet lines, plain text, no markdown headers."
    )
    user_prompt = (
        f"Existing summary:\n{existing_summary or '(none)'}\n\n"
        f"Recent conversation:\n{history_text or '(none)'}\n\n"
        f"Latest user question:\n{question}\n\n"
        f"Latest assistant response:\n{answer}\n\n"
        "Return the updated summary only."
    )

    try:
        completion = groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            model="openai/gpt-oss-120b",
            temperature=0.1,
            max_completion_tokens=280,
            top_p=1,
            reasoning_effort="medium",
            stop=None,
        )
        summary = (completion.choices[0].message.content or "").strip()
        if not summary:
            return _fallback_summary(existing_summary, question, answer)
        return summary[-SUMMARY_CHAR_LIMIT:]
    except Exception:
        return _fallback_summary(existing_summary, question, answer)

async def ask_financial_assistant(context, request: ChatRequest):
    sb = context["supabase"]
    user_id = context["user_id"]
    rolling_summary = get_chat_summary(context)
    
    try:
        budget_response = sb.table("budgets").select("*").eq("user_id", user_id).execute()
        active_budgets = budget_response.data or []
        
        if active_budgets:
            budget_lines = [f"- {b['category']}: ${b['amount']} ({b.get('period', 'monthly')})" for b in active_budgets]
            budget_text = "\n".join(budget_lines)
        else:
            budget_text = "No active budgets set."

        search_query = _build_search_query(request.question, request.history)
        query_instruction = "Represent this sentence for searching relevant passages: "
        
        query_vector = embedding_model.encode(query_instruction + search_query).tolist()

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

        if not transactions and wants_spending_advice:
            transactions = _fetch_transactions(
                sb=sb,
                query_vector=query_vector,
                user_id=user_id,
                threshold=0.0,
                count=50,
            )

        if not transactions and (wants_spending_advice or wants_general_guidance):
            transactions = _fetch_recent_transactions(sb=sb, user_id=user_id, limit=60)

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
                updated_summary = _roll_summary(rolling_summary, request.question, msg, request.history)
                upsert_chat_summary(context, updated_summary)
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
                        "Keep the response under 140 words unless the user asks for more detail.\n\n"
                        f"ROLLING MEMORY SUMMARY:\n{rolling_summary or 'No prior summary available.'}\n\n"
                        f"USER'S ACTIVE BUDGETS:\n{budget_text}"
                    ),
                }]

                for msg in request.history:
                    llm_messages.append({"role": msg.role, "content": msg.content})

                llm_messages.append({"role": "user", "content": request.question})

                chat_completion = groq_client.chat.completions.create(
                    messages=llm_messages,
                    model="llama-3.3-70b-versatile",
                    temperature=0.2,
                    max_completion_tokens=500,
                    top_p=1,
                    reasoning_effort="medium",
                    stop=None,
                )
                assistant_response = chat_completion.choices[0].message.content
                updated_summary = _roll_summary(rolling_summary, request.question, assistant_response, request.history)
                upsert_chat_summary(context, updated_summary)
                return ChatResponse(response=assistant_response)

            fallback_response = "I couldn't find matching transactions for that question right now. I can still give general advice, or you can sync accounts and ask again for spending-specific recommendations."
            updated_summary = _roll_summary(rolling_summary, request.question, fallback_response, request.history)
            upsert_chat_summary(context, updated_summary)
            return ChatResponse(response=fallback_response)

        formatted_swipes = []
        for t in transactions:
            parsed_dt = _parse_txn_date(t.get('txn_date'))
            readable_date = parsed_dt.strftime('%Y-%m-%d') if parsed_dt else 'Unknown Date'
                
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
        Answer the user's question using ONLY the following transaction data and budgets. 
        If the data does not contain the answer, explicitly state that you don't know. 
        For follow-up questions, use the prior chat history to resolve references like "it", "that", or "last time".
        If the latest user question is ambiguous (for example "can you do it for me"), infer intent from recent user turns.
        Do not give general financial advice unless specifically asked.
        Keep responses concise and complete, ideally under 120 words unless the user asks for detailed guidance.        
        
        ROLLING MEMORY SUMMARY:
        {rolling_summary or 'No prior summary available.'}

        {food_summary}

        USER'S ACTIVE BUDGETS:
        {budget_text}

        USER'S RECENT / RELEVANT TRANSACTIONS:
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
        assistant_response = chat_completion.choices[0].message.content
        updated_summary = _roll_summary(rolling_summary, request.question, assistant_response, request.history)
        upsert_chat_summary(context, updated_summary)

        return ChatResponse(response=assistant_response)

    except Exception as e:
        print(f"Chatbot Error: {str(e)}")
        raise HTTPException(status_code=500, detail="An error occurred while processing your question.")