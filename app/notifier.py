import urllib.request
import urllib.parse
import json
import smtplib
import html
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timezone
from .database import (
    get_settings, get_unnotified_urgent_articles, mark_article_notified,
    log_notification
)

logger = logging.getLogger("sentinel.notifier")

def send_telegram_message(bot_token: str, chat_id: str, text: str, parse_mode: str = "HTML") -> dict:
    """Send an alert message directly to user's Telegram via Telegram Bot API with error handling."""
    if not bot_token or not chat_id:
        return {"success": False, "error": "Bot token or Chat ID is missing"}

    url = f"https://api.telegram.org/bot{bot_token.strip()}/sendMessage"
    
    # Ensure text never exceeds Telegram 4096 char limit
    if len(text) > 4000:
        text = text[:3950] + "\n\n<i>[Truncated for length]</i>"

    payload = {
        "chat_id": chat_id.strip(),
        "text": text,
        "parse_mode": parse_mode,
        "disable_web_page_preview": False
    }

    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json", "User-Agent": "MideastIntelSentinel/1.0"}
        )
        with urllib.request.urlopen(req, timeout=12) as resp:
            res_body = resp.read().decode("utf-8")
            res_json = json.loads(res_body)
            if res_json.get("ok"):
                return {"success": True, "message_id": res_json.get("result", {}).get("message_id")}
            else:
                return {"success": False, "error": res_json.get("description", "Unknown Telegram error")}
    except urllib.error.HTTPError as e:
        err_content = e.read().decode("utf-8")
        logger.error(f"Telegram HTTP error: {e.code} - {err_content}")
        if "chat not found" in err_content:
            friendly_err = "Chat not initialized! Please open https://t.me/AClNews18766bot on Telegram and tap 'START', then retry."
            return {"success": False, "error": friendly_err}
        return {"success": False, "error": f"HTTP {e.code}: {err_content}"}
    except Exception as e:
        logger.error(f"Telegram error: {e}")
        return {"success": False, "error": str(e)}

def format_telegram_alert(article: dict) -> str:
    """Format article into a high-impact intelligence bulletin with proper HTML escaping."""
    country_flags = {
        "Iran": "🇮🇷 Iran",
        "Israel": "🇮🇱 Israel",
        "Egypt": "🇪🇬 Egypt",
        "Germany": "🇩🇪 Germany",
        "Iran / Israel": "🇮🇷 Iran ⚔️ 🇮🇱 Israel",
        "Egypt / Israel": "🇪🇬 Egypt 🤝 🇮🇱 Israel",
        "Germany / Middle East": "🇩🇪 Germany 🌍 Middle East",
        "Regional": "🌐 Middle East Regional"
    }
    
    country_display = country_flags.get(article.get("country", "Regional"), article.get("country", "Regional"))
    
    score = article.get("urgency_score", 0)
    urgency_tag = "🔴 CRITICAL FLASH" if score >= 80 else ("🟠 HIGH PRIORITY" if score >= 60 else "🟡 INTELLIGENCE BRIEF")
    
    entities = article.get("entities", [])
    if isinstance(entities, str):
        try:
            entities = json.loads(entities)
        except Exception:
            entities = []
    entities_str = ", ".join(entities) if entities else "Regional Strategic Actors"

    title = html.escape(article.get("title", ""))
    desc = html.escape(article.get("description", "") or "")
    if len(desc) > 280:
        desc = desc[:277] + "..."

    future = html.escape(article.get("future_projection", "") or "")
    history = html.escape(article.get("historical_link", "") or "")
    source = html.escape(article.get("source", "OSINT Wire"))
    link = article.get("link", "#")

    msg = f"""🚨 <b>[SENTINEL INTEL ALERT]</b> 🚨
━━━━━━━━━━━━━━━━━━━━
⚡ <b>Status:</b> {urgency_tag} (Score: {score}/100)
🌍 <b>Axis:</b> {country_display}
📂 <b>Category:</b> {html.escape(article.get('category', 'Warfare'))}
🎯 <b>Key Entities:</b> <i>{html.escape(entities_str)}</i>

📰 <b>HEADLINE:</b>
<b>{title}</b>

📝 <b>Summary:</b>
{desc or 'Developing tactical situation. Monitor wire for updates.'}

🔮 <b>Future Projection / Strategic Risk:</b>
{future or 'Elevated regional volatility and response monitoring required.'}

🏛️ <b>Historical Precedent:</b>
{history or 'Tied to active deterrence architecture.'}

🔗 <a href="{link}">Read Full Dispatch ({source})</a>
━━━━━━━━━━━━━━━━━━━━
⏱️ <i>Middle East Intel Sentinel • 24/7 Automated Monitor</i>"""
    return msg

def send_email_alert(smtp_host, smtp_port, sender, password, recipient, subject, body_html) -> dict:
    """Send alert via standard SMTP with timeout and error handling."""
    if not smtp_host or not sender or not recipient:
        return {"success": False, "error": "SMTP credentials incomplete"}

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"Mideast Intel Sentinel <{sender}>"
        msg["To"] = recipient

        msg.attach(MIMEText(body_html, "html"))

        server = smtplib.SMTP(smtp_host, int(smtp_port), timeout=12)
        server.starttls()
        if password:
            server.login(sender, password)
        server.sendmail(sender, recipient, msg.as_string())
        server.quit()
        return {"success": True}
    except Exception as e:
        logger.error(f"Email error: {e}")
        return {"success": False, "error": str(e)}

def dispatch_urgent_alerts() -> dict:
    """Check for new urgent articles and send notifications immediately."""
    settings = get_settings()
    threshold = int(settings.get("urgency_threshold", "65"))
    telegram_enabled = settings.get("telegram_enabled", "false").lower() == "true"
    email_enabled = settings.get("email_enabled", "false").lower() == "true"

    bot_token = settings.get("telegram_bot_token", "8447880856:AAGOaLR_4542pG0kqkwPUbjOC2PXLqUryOs")
    chat_id = settings.get("telegram_chat_id", "7195584903")

    smtp_host = settings.get("email_smtp_host", "")
    smtp_port = settings.get("email_smtp_port", "587")
    sender = settings.get("email_sender", "")
    password = settings.get("email_password", "")
    recipient = settings.get("email_recipient", "")

    urgent_articles = get_unnotified_urgent_articles(threshold=threshold)
    sent_count = 0
    failed_count = 0

    for art in urgent_articles:
        art_id = art["id"]
        title = art["title"]
        score = art["urgency_score"]

        # Send Telegram if enabled
        if telegram_enabled and bot_token and chat_id:
            tg_text = format_telegram_alert(art)
            res = send_telegram_message(bot_token, chat_id, tg_text)
            if res.get("success"):
                log_notification(art_id, "telegram", "sent", title, score, "Delivered via Telegram Bot")
                sent_count += 1
            else:
                log_notification(art_id, "telegram", "failed", title, score, res.get("error", "Error"))
                failed_count += 1

        # Send Email if enabled
        if email_enabled and recipient and sender:
            html_content = f"""
            <div style="font-family: Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 20px; border-radius: 8px;">
                <h2 style="color: #ef4444;">🚨 [SENTINEL INTEL ALERT] - Urgency Score {score}/100</h2>
                <p><strong>Country:</strong> {art.get('country')}</p>
                <p><strong>Category:</strong> {art.get('category')}</p>
                <h3>{art.get('title')}</h3>
                <p>{art.get('description')}</p>
                <div style="background-color: #1e293b; padding: 15px; border-left: 4px solid #f59e0b; margin: 15px 0;">
                    <strong>🔮 Future Strategic Projection:</strong>
                    <p>{art.get('future_projection')}</p>
                </div>
                <p><a href="{art.get('link')}" style="color: #38bdf8;">Read Original Source ({art.get('source')})</a></p>
                <hr style="border-color: #334155;"/>
                <p style="font-size: 11px; color: #94a3b8;">Sent automatically by Middle East Intel Sentinel 24/7 Daemon.</p>
            </div>
            """
            subject = f"🚨 URGENT INTEL: [{art.get('country')}] {art.get('title')[:60]}"
            res = send_email_alert(smtp_host, smtp_port, sender, password, recipient, subject, html_content)
            if res.get("success"):
                log_notification(art_id, "email", "sent", title, score, "Delivered via SMTP")
                sent_count += 1
            else:
                log_notification(art_id, "email", "failed", title, score, res.get("error", "Error"))
                failed_count += 1

        # Mark article as notified
        mark_article_notified(art_id)

    return {
        "checked": len(urgent_articles),
        "sent": sent_count,
        "failed": failed_count
    }
