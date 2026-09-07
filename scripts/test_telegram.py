#!/usr/bin/env python3
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.notifier import send_telegram_message
from app.database import get_settings

def main():
    if len(sys.argv) >= 3:
        token = sys.argv[1]
        chat_id = sys.argv[2]
    else:
        settings = get_settings()
        token = settings.get("telegram_bot_token")
        chat_id = settings.get("telegram_chat_id")

    if not token or not chat_id:
        print("Usage: python3 test_telegram.py <BOT_TOKEN> <CHAT_ID>")
        print("Or configure them in the Sentinel dashboard settings.")
        sys.exit(1)

    print(f"📡 Sending test notification to Chat ID: {chat_id} via Bot...")
    msg = """🚨 <b>[TEST] Middle East Intel Sentinel Active</b>
━━━━━━━━━━━━━━━━━━━━
⚡ <b>Status:</b> Verified & Online
🌍 <b>Target Theatres:</b> Egypt, Iran, Israel, Germany
🎯 <b>Tracking:</b> Warfare, Intelligence, Cyber, Nuclear
🔔 <b>Delivery:</b> Instant Mobile Push

Your phone is ready for 24/7 critical alert dispatches!
━━━━━━━━━━━━━━━━━━━━"""

    res = send_telegram_message(token, chat_id, msg)
    if res.get("success"):
        print("✅ SUCCESS! Test alert dispatched to your phone.")
    else:
        print("❌ FAILED:", res.get("error"))

if __name__ == "__main__":
    main()
