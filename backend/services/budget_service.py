import logging
from fastapi import HTTPException

logger = logging.getLogger(__name__)

def create_budget(context, budget):
    sb = context["supabase"]
    user_id = context["user_id"]
    
    try:
        response = (
            sb.table("budgets")
            .upsert({
                "user_id": user_id,
                "name": budget.name,
                "amount": budget.amount,
                "category": budget.category,
                "period": budget.period,
            })
            .execute()
        )
        return response.data
    except Exception as e:
        logger.error(f"Failed to create budget for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create budget.")

def get_active_budgets(context):
    sb = context["supabase"]
    user_id = context["user_id"]
    
    try:
        response = (
            sb.table("budgets")
            .select("*")
            .eq("user_id", user_id)
            .execute()
        )
        return response.data
    except Exception as e:
        logger.error(f"Failed to retrieve budgets for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve budgets.")

def update_budget(context, budget_id: str, budget_data):
    sb = context["supabase"]
    user_id = context["user_id"]
    
    update_fields = {k: v for k, v in budget_data.dict().items() if v is not None}
    if not update_fields:
        return {"status": "success"}

    try:
        response = (
            sb.table("budgets")
            .update(update_fields)
            .eq("id", budget_id)
            .eq("user_id", user_id)
            .execute()
        )
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update budget: {str(e)}")

def delete_budget(context, budget_id: str):
    sb = context["supabase"]
    user_id = context["user_id"]

    try:
        sb.table("budgets").delete().eq("id", budget_id).eq("user_id", user_id).execute()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete budget: {str(e)}")
