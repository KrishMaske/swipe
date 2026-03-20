import asyncio
import html
import resend
import logging
from config.settings import resend, target_email, sender

logger = logging.getLogger(__name__)
resend.api_key = resend

def _send_sync(subject: str, html_body: str, to_email: str) -> None:
    if not resend.api_key:
        raise RuntimeError("RESEND_API_KEY must be set in your environment variables.")
    
    params = {
        "from": f"Scheduler Alerts <{sender}>",
        "to": [to_email],
        "subject": subject,
        "html": html_body,
    }
    
    resend.Emails.send(params)


async def send_html_email(subject: str, html_body: str, to_email: str = target_email) -> bool:
    """Send an HTML email without blocking the event loop."""
    try:
        await asyncio.to_thread(_send_sync, subject, html_body, to_email)
        return True
    except Exception:
        return False


def wrap_html(title: str, body_html: str) -> str:
    safe_title = html.escape(title)
    return (
        "<html><body style='font-family:Arial,sans-serif;background:#f7f7f7;padding:18px;'>"
        "<div style='max-width:900px;margin:0 auto;background:#fff;border:1px solid #e8e8e8;border-radius:10px;padding:18px;'>"
        f"<h2 style='margin:0 0 12px 0;color:#222;'>{safe_title}</h2>"
        f"{body_html}"
        "</div></body></html>"
    )
