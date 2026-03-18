import asyncio
import html
import os
import smtplib
from email.message import EmailMessage

TARGET_EMAIL = os.getenv("TARGET_EMAIL", "KRISHM.IMP@GMAIL.COM")


def _send_sync(subject: str, html_body: str, to_email: str) -> None:
    sender = os.getenv("SMTP_EMAIL")
    password = os.getenv("SMTP_PASSWORD")
    if not sender or not password:
        raise RuntimeError("SMTP_EMAIL and SMTP_PASSWORD must be set")

    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = to_email

    text_fallback = "Automated scheduler notification. Please view this email in HTML mode."
    msg.set_content(text_fallback)
    msg.add_alternative(html_body, subtype="html")

    with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as server:
        server.starttls()
        server.login(sender, password)
        server.send_message(msg)


async def send_html_email(subject: str, html_body: str, to_email: str = TARGET_EMAIL) -> bool:
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
