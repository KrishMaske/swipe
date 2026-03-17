import os
from datetime import datetime
from dateutil import parser as dateutil_parser
import re
from typing import List, Optional
from fastapi import HTTPException
from pydantic import BaseModel
from config.settings import embedder, groq_client


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    question: str
    history: Optional[List[Message]] = []


class ChatResponse(BaseModel):
    response: str


# ──────────────────────────────────────────────
# SYSTEM PROMPTS
# ──────────────────────────────────────────────

MAIN_SYSTEM_PROMPT = """\
You are SwipeSmart AI — a personal financial advisor that combines the expertise of:
  • A certified accountant (precise with numbers, taxes, categorization, P&L)
  • A licensed stockbroker (investing, market exposure, portfolio risk, asset allocation)
  • A professional budgeteer (spending plans, envelope budgeting, cash flow management)
  • A personal finance coach (behavioral advice, goal-setting, debt payoff strategies)

Your job is to give the user clear, accurate, and actionable financial guidance grounded in their actual transaction data and budgets provided below.

GROUND RULES:
1. Base all spending/income calculations ONLY on the transaction data provided.
2. When calculating spending totals, sum ONLY transactions labeled EXPENSE (-). NEVER include INCOME (+) rows in any spending or budget calculation.
3. If the data does not contain enough information to answer confidently, say so explicitly — never guess or fabricate numbers.
4. For follow-up or ambiguous questions (e.g. "do it for me", "what about that"), resolve intent from the prior conversation history.
5. Be concise — ideally under 120 words — unless the user asks for a detailed breakdown or plan.
6. Where relevant, go beyond just the numbers: flag unusual spending patterns, suggest concrete next steps, and frame advice the way a real financial advisor would (e.g. "Based on your spending, here's what I'd recommend...").
7. Never give generic boilerplate. Every response should feel personalized to this user's actual data.

TONE: Direct, confident, and professional — like a trusted advisor, not a chatbot.

{context_summary}

USER'S ACTIVE BUDGETS:
{budget_text}

USER'S RECENT / RELEVANT TRANSACTIONS:
{context_text}
"""

GENERAL_GUIDANCE_SYSTEM_PROMPT = """\
You are SwipeSmart AI — a personal financial advisor that combines the expertise of:
  • A certified accountant (taxes, categorization, cash flow, P&L thinking)
  • A licensed stockbroker (investing, market exposure, asset allocation, risk tolerance)
  • A professional budgeteer (spending plans, 50/30/20, zero-based budgeting, envelope method)
  • A personal finance coach (debt payoff strategies, emergency funds, behavioral finance, goal-setting)

The user is asking a general finance question. No transaction data is available right now, so give high-quality general guidance based on established financial principles. Clearly note when advice is general rather than based on the user's specific data.

GROUND RULES:
1. Give clear, actionable advice — not vague tips.
2. Use real frameworks when relevant (e.g. debt avalanche vs snowball, 50/30/20 rule, 3-6 month emergency fund, dollar-cost averaging).
3. If the user mentions a specific number or scenario, engage with it precisely.
4. Be concise — under 150 words unless the user asks for a detailed plan.
5. Never give generic boilerplate. Tailor your response to exactly what the user asked.

TONE: Direct, confident, and professional — like a trusted advisor who respects the user's intelligence.

USER'S ACTIVE BUDGETS:
{budget_text}
"""


# ──────────────────────────────────────────────
# HELPER FUNCTIONS
# ──────────────────────────────────────────────

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
        "how about",
        "what about",
    }
    return q in phrases or len(q.split()) <= 5


def _is_spending_optimization_question(question: str) -> bool:
    q = question.lower()
    keywords = [
        "cut down", "reduce", "spending", "spend less",
        "save money", "where can i cut", "overspending", "expenses",
    ]
    return any(k in q for k in keywords)


def _is_general_finance_question(question: str) -> bool:
    q = question.lower()
    keywords = [
        "budget", "budgeting", "save", "saving", "savings",
        "invest", "investing", "debt", "emergency fund",
        "financial plan", "financial planning", "50/30/20",
        "stock", "etf", "portfolio", "retirement", "401k", "roth",
        "tax", "interest rate", "credit score", "net worth",
    ]
    return any(k in q for k in keywords)


def _build_search_query(question: str, history: Optional[List[Message]]) -> str:
    """Build a retrieval query that avoids embedding useless conversational filler."""
    if _is_ambiguous_follow_up(question) and history:
        last_real_q = _recent_user_text(history, turns=1)
        return f"{last_real_q} {question}"[:300]
    return question.strip()[:300]


def _parse_txn_date(raw) -> datetime | None:
    """Parse txn_date whether it's an epoch number or a timestamp string."""
    if raw is None:
        return None
    try:
        ts = float(raw)
        if ts > 1e9:  # looks like a Unix epoch
            return datetime.fromtimestamp(ts)
    except (TypeError, ValueError):
        pass
    try:
        return dateutil_parser.parse(str(raw))
    except (ValueError, TypeError):
        return None


def _fetch_transactions(sb, query_vector: list[float], user_id: str, threshold: float, count: int):
    response = sb.rpc(
        "match_transactions",
        {
            "query_embedding": query_vector,
            "match_threshold": threshold,
            "match_count": count,
            "p_user_id": user_id,
        },
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


def _compute_spending_stats(transactions: list[dict]) -> dict:
    """Computes stats dynamically for the retrieved context, focusing on expenses only."""
    if not transactions:
        return {"count": 0, "total_spent": 0.0, "weekly_avg": 0.0, "weeks": 0.0}

    expense_amounts = []
    timestamps = []

    for t in transactions:
        try:
            raw_amt = float(t.get("amount", 0) or 0)
            if raw_amt <= 0:  # expenses only
                expense_amounts.append(abs(raw_amt))
                # Only timestamp expense rows so weekly avg is not skewed by income dates
                parsed_dt = _parse_txn_date(t.get("txn_date"))
                if parsed_dt:
                    timestamps.append(parsed_dt.timestamp())
        except (TypeError, ValueError):
            continue

    if not expense_amounts:
        return {"count": 0, "total_spent": 0.0, "weekly_avg": 0.0, "weeks": 0.0}

    total = round(sum(expense_amounts), 2)
    count = len(expense_amounts)

    if len(timestamps) >= 2:
        span_seconds = max(timestamps) - min(timestamps)
        weeks = max(1.0, span_seconds / (7 * 24 * 3600))
    else:
        weeks = 1.0

    weekly_avg = round(total / weeks, 2)
    return {"count": count, "total_spent": total, "weekly_avg": weekly_avg, "weeks": round(weeks, 1)}


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


def _extract_response_text(message) -> str:
    """
    Safely extract text from a Groq/OpenAI chat message object.
    Reasoning models (e.g. openai/gpt-oss-120b) may return content=None
    and put the actual reply in reasoning or reasoning_content instead.
    """
    content = (message.content or "").strip()
    if content:
        return content
    reasoning = (
        getattr(message, "reasoning", None)
        or getattr(message, "reasoning_content", None)
    )
    if reasoning:
        return reasoning.strip()
    return ""


# ──────────────────────────────────────────────
# MAIN HANDLER
# ──────────────────────────────────────────────

async def ask_financial_assistant(context, request: ChatRequest):
    sb = context["supabase"]
    user_id = context["user_id"]

    try:
        budget_response = sb.table("budgets").select("*").eq("user_id", user_id).execute()
        active_budgets = budget_response.data or []

        if active_budgets:
            budget_lines = [
                f"- {b['category']}: ${b['amount']} ({b.get('period', 'monthly')})"
                for b in active_budgets
            ]
            budget_text = "\n".join(budget_lines)
        else:
            budget_text = "No active budgets set."

        search_query = _build_search_query(request.question, request.history)
        query_instruction = "Represent this sentence for searching relevant passages: "
        query_vector = embedder.encode(query_instruction + search_query).tolist()

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

        # DYNAMIC STATS — budget comparison shortcut
        if transactions and (wants_spending_advice or wants_general_guidance):
            stats = _compute_spending_stats(transactions)
            budget_amount = _extract_weekly_budget_amount(request.question)
            if budget_amount is None and carry_over_intent:
                budget_amount = _extract_weekly_budget_amount(recent_text)

            if budget_amount is not None and _is_budget_comparison_question(request.question) and stats["count"] > 0:
                weekly_avg = stats["weekly_avg"]
                recommended = max(1.0, round(weekly_avg * 0.85, 2))
                if budget_amount > weekly_avg:
                    msg = (
                        f"Yes, ${budget_amount:.2f}/week is above your current spending pace for this category, which is about "
                        f"${weekly_avg:.2f}/week (based on ${stats['total_spent']:.2f} across {stats['count']} transactions "
                        f"over about {stats['weeks']:.1f} weeks). "
                        f"To save money, set a target closer to ${recommended:.2f}/week instead."
                    )
                else:
                    msg = (
                        f"You are right to focus on savings. Your current spending pace here is about ${weekly_avg:.2f}/week "
                        f"(from ${stats['total_spent']:.2f} across {stats['count']} transactions over about {stats['weeks']:.1f} weeks). "
                        f"A savings target would be around ${recommended:.2f}/week."
                    )
                return ChatResponse(response=msg)

        # NO TRANSACTIONS PATH
        if not transactions:
            if wants_general_guidance or wants_spending_advice:
                llm_messages = [
                    {
                        "role": "system",
                        "content": GENERAL_GUIDANCE_SYSTEM_PROMPT.format(budget_text=budget_text),
                    }
                ]
                for m in request.history:
                    llm_messages.append({"role": m.role, "content": m.content})
                llm_messages.append({"role": "user", "content": request.question})

                chat_completion = groq_client.chat.completions.create(
                    messages=llm_messages,
                    model="llama-3.3-70b-versatile",
                    temperature=0.2,
                    max_completion_tokens=500,
                    top_p=1,
                    stop=None,
                )
                raw_msg = chat_completion.choices[0].message
                print(f"[general guidance] content={repr(raw_msg.content)} | reasoning={repr(getattr(raw_msg, 'reasoning', 'N/A'))}")

                assistant_response = _extract_response_text(raw_msg)
                if not assistant_response:
                    assistant_response = "I wasn't able to generate a response. Please try again."
                return ChatResponse(response=assistant_response)

            fallback_response = (
                "I couldn't find matching transactions for that question right now. "
                "I can still give general advice, or you can sync accounts and ask again for spending-specific recommendations."
            )
            return ChatResponse(response=fallback_response)

        # TRANSACTIONS FOUND — build context and call main model
        formatted_swipes = []
        for t in transactions:
            parsed_dt = _parse_txn_date(t.get("txn_date"))
            readable_date = parsed_dt.strftime("%Y-%m-%d") if parsed_dt else "Unknown Date"
            raw_amount = float(t.get("amount", 0))
            txn_type = "INCOME (+)" if raw_amount > 0 else "EXPENSE (-)"
            formatted_swipes.append(
                f"{readable_date} | {txn_type} | {t.get('merchant', 'Unknown')} | ${abs(raw_amount):.2f} "
                f"(Category: {t.get('category', 'None')})"
            )

        context_text = "\n".join(formatted_swipes)

        stats = _compute_spending_stats(transactions)
        context_summary = (
            f"Expense summary for retrieved transactions: "
            f"total_spent=${stats['total_spent']:.2f}, "
            f"expense_count={stats['count']}, "
            f"weekly_avg=${stats['weekly_avg']:.2f}, "
            f"span={stats['weeks']:.1f} weeks. "
            f"(INCOME rows are excluded from all spending calculations.)"
            if stats["count"] > 0
            else "No expense transactions detected in the retrieved data. Only EXPENSE (-) rows count toward spending."
        )

        system_prompt = MAIN_SYSTEM_PROMPT.format(
            context_summary=context_summary,
            budget_text=budget_text,
            context_text=context_text,
        )

        llm_messages = [{"role": "system", "content": system_prompt}]
        for m in request.history:
            llm_messages.append({"role": m.role, "content": m.content})
        llm_messages.append({"role": "user", "content": request.question})

        chat_completion = groq_client.chat.completions.create(
            messages=llm_messages,
            model="openai/gpt-oss-120b",
            temperature=0.1,
            max_completion_tokens=1000,
            top_p=1,
            reasoning_effort="medium",
            stop=None,
        )
        raw_msg = chat_completion.choices[0].message
        print(f"[main response] content={repr(raw_msg.content)} | reasoning={repr(getattr(raw_msg, 'reasoning', 'N/A'))}")

        assistant_response = _extract_response_text(raw_msg)
        if not assistant_response:
            assistant_response = "I wasn't able to generate a response. Please try again."
        print(f"[main response] final={repr(assistant_response)}")

        return ChatResponse(response=assistant_response)

    except Exception as e:
        print(f"Chatbot Error: {str(e)}")
        raise HTTPException(status_code=500, detail="An error occurred while processing your question.")