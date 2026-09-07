import os
import re
import json
import logging
import httpx
from typing import Optional
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Query, Body, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, Response, PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware

from .database import (
    init_db, get_stats, get_articles, count_articles, get_recent_notifications,
    get_settings, update_settings, get_user_profile, save_user_profile,
    mask_credential
)
from .collector import collect_all_news, fetch_historical_archive
from .graph_engine import get_graph_data, extract_causal_chains, analyze_network_centrality
from .notifier import send_telegram_message, send_email_alert, dispatch_urgent_alerts
from .daemon import daemon_instance

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sentinel.api")

STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "static")

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        init_db()
    except Exception as e:
        logger.warning(f"init_db in lifespan: {e}")
        
    if not os.environ.get("VERCEL") and not os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        try:
            daemon_instance.start()
        except Exception as e:
            logger.warning(f"daemon start: {e}")
    yield
    if not os.environ.get("VERCEL") and not os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        try:
            daemon_instance.stop()
        except Exception:
            pass

is_serverless = bool(os.environ.get("SERVERLESS") or os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"))

app = FastAPI(
    title="Middle East Intelligence Sentinel",
    description="Strategic News Tracking, Geopolitical Graph & Predictive Intelligence for Egypt, Iran, Israel, and Germany",
    version="2.1.0",
    lifespan=None if is_serverless else lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def fix_vercel_rewrites(request: Request, call_next):
    matched_path = request.headers.get("x-matched-path")
    if matched_path and request.scope.get("path") == "/api/index.py":
        request.scope["path"] = matched_path
    return await call_next(request)

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    import traceback
    return PlainTextResponse(f"SERVER UNHANDLED EXCEPTION:\n{traceback.format_exc()}", status_code=500)

@app.get("/api/public-url")
def api_public_url():
    mideast_url = os.getenv("PUBLIC_URL") or os.getenv("MIDEAST_PUBLIC_URL") or ""
    darkweb_url = os.getenv("DARKWEB_PUBLIC_URL") or ""
    if not mideast_url or not darkweb_url:
        try:
            if os.path.exists("/var/run/sentinel-tunnels.json"):
                with open("/var/run/sentinel-tunnels.json", "r") as f:
                    data = json.load(f)
                    tunnels = data.get("tunnels", {})
                    if not mideast_url:
                        mideast_url = tunnels.get("mideast", {}).get("public_url", "")
                    if not darkweb_url:
                        darkweb_url = tunnels.get("darkweb", {}).get("public_url", "")
            if not mideast_url and os.path.exists("/var/log/sentinel-tunnel.log"):
                with open("/var/log/sentinel-tunnel.log", "r", errors="ignore") as f:
                    content = f.read()
                    matches = re.findall(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com", content)
                    if matches:
                        mideast_url = matches[-1]
        except Exception as e:
            logger.error(f"Error reading tunnel log: {e}")
    return {
        "public_url": mideast_url,
        "darkweb_url": darkweb_url,
        "status": "online" if mideast_url else "offline"
    }

@app.get("/api/tunnels")
def api_tunnels():
    if os.path.exists("/var/run/sentinel-tunnels.json"):
        try:
            with open("/var/run/sentinel-tunnels.json", "r") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error reading tunnels state: {e}")
    return {"tunnels": {}}

@app.get("/api/status")
def api_status():
    return {"status": "ok", "service": "Middle East Intel Sentinel", "version": "2.1.0"}

@app.get("/api/graph-data")
def api_graph_data_alias(
    country: str = Query(None),
    node_type: str = Query(None),
    year: str = Query(None),
    from_year: str = Query(None),
    to_year: str = Query(None)
):
    return get_graph_data(
        country_filter=country,
        type_filter=node_type,
        year_filter=year,
        from_year=from_year,
        to_year=to_year
    )

@app.get("/api/notifications/recent")
def api_notifications_recent_alias(limit: int = Query(30, ge=1, le=100)):
    return get_recent_notifications(limit=limit)

@app.get("/api/user-profile/{username}")
def api_user_profile_alias(username: str):
    return api_get_profile(username=username)

@app.get("/api/stats")
def api_stats(
    year: str = Query(None),
    from_year: str = Query(None),
    to_year: str = Query(None)
):
    return get_stats(year=year, from_year=from_year, to_year=to_year)

@app.get("/api/articles")
def api_articles(
    limit: int = Query(30, ge=1, le=200),
    offset: int = Query(0, ge=0),
    country: str = Query(None),
    category: str = Query(None),
    min_urgency: int = Query(None, ge=0, le=100),
    search: str = Query(None),
    year: str = Query(None),
    from_year: str = Query(None),
    to_year: str = Query(None),
    order_by: str = Query("time_desc")
):
    items = get_articles(
        limit=limit,
        offset=offset,
        country=country,
        category=category,
        min_urgency=min_urgency,
        search=search,
        year=year,
        from_year=from_year,
        to_year=to_year,
        order_by=order_by
    )
    total = count_articles(
        country=country,
        category=category,
        min_urgency=min_urgency,
        search=search,
        year=year,
        from_year=from_year,
        to_year=to_year
    )
    has_more = (offset + len(items)) < total
    return {
        "articles": items,
        "total": total,
        "offset": offset,
        "limit": limit,
        "has_more": has_more,
        "order_by": order_by
    }

@app.post("/api/collect")
def api_collect():
    try:
        res = collect_all_news()
        alert_res = dispatch_urgent_alerts()
        return {"status": "success", "ingestion": res, "alerts": alert_res}
    except Exception as e:
        logger.error(f"Manual collect failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/collect-historical")
def api_collect_historical(payload: dict = Body(...)):
    year = payload.get("year")
    from_year = payload.get("from_year")
    to_year = payload.get("to_year")
    query = payload.get("query", None)

    target_years = []
    if from_year and to_year:
        try:
            start_y = int(from_year)
            end_y = int(to_year)
            target_years = [str(y) for y in range(min(start_y, end_y), max(start_y, end_y) + 1)]
        except Exception:
            target_years = [str(from_year)]
    elif year and year != "All":
        target_years = [str(year)]
    else:
        target_years = ["2022"]

    total_ingested = 0
    for y in target_years[:3]:  # Limit to 3 years per request to prevent timeout
        try:
            res = fetch_historical_archive(y, query)
            total_ingested += res.get("ingested", 0)
        except Exception as e:
            logger.warning(f"Archive fetch failed for {y}: {e}")

    return {"status": "success", "years": target_years, "ingested": total_ingested}

@app.get("/api/graph")
def api_graph(
    country: str = Query(None),
    node_type: str = Query(None),
    year: str = Query(None),
    from_year: str = Query(None),
    to_year: str = Query(None)
):
    return get_graph_data(
        country_filter=country,
        type_filter=node_type,
        year_filter=year,
        from_year=from_year,
        to_year=to_year
    )

@app.get("/api/causal-chains")
def api_causal_chains(
    year: str = Query(None),
    from_year: str = Query(None),
    to_year: str = Query(None)
):
    return extract_causal_chains(
        year_filter=year,
        from_year=from_year,
        to_year=to_year
    )

@app.get("/api/network-centrality")
def api_network_centrality():
    return analyze_network_centrality()

@app.get("/api/notifications")
def api_notifications(limit: int = Query(30, ge=1, le=100)):
    return get_recent_notifications(limit=limit)

# User Profiles & Masked Credential Protection
@app.get("/api/profile")
def api_get_profile(username: str = Query("Hossam")):
    if not username:
        username = "Hossam"
    profile = get_user_profile(username, mask=True)
    # Never expose full raw tokens in public responses
    token = profile.get("telegram_bot_token", "")
    profile["has_token"] = bool(token)
    profile["telegram_bot_token"] = mask_credential(token)
    return profile

@app.post("/api/profile")
def api_save_profile(payload: dict = Body(...)):
    username = payload.get("username", "").strip()
    if not username:
        raise HTTPException(status_code=400, detail="Username is required")
    profile = save_user_profile(username, payload)
    profile["telegram_bot_token"] = mask_credential(profile.get("telegram_bot_token", ""))
    return {"status": "success", "profile": profile}

@app.get("/api/settings")
def api_get_settings(username: str = Query("Hossam")):
    profile = get_user_profile(username, mask=False)
    token = profile.get("telegram_bot_token", "")
    return {
        "username": profile.get("username", "Hossam"),
        "display_name": profile.get("display_name", "Hossam"),
        "telegram_bot_token_masked": mask_credential(token),
        "telegram_chat_id": profile.get("telegram_chat_id", ""),
        "has_token": bool(token),
        "telegram_enabled": bool(profile.get("telegram_enabled", 0)),
        "email_recipient": profile.get("email_recipient", ""),
        "email_enabled": bool(profile.get("email_enabled", 0)),
        "urgency_threshold": int(profile.get("urgency_threshold", 75)),
        "poll_interval_minutes": int(profile.get("poll_interval_minutes", 10)),
        "theme_preference": profile.get("theme_preference", "dark")
    }

@app.post("/api/settings")
def api_update_settings(payload: dict = Body(...)):
    username = payload.get("username", "Hossam").strip()
    save_user_profile(username, payload)
    return {"status": "success", "user": username}

@app.post("/api/test-telegram")
def api_test_telegram(payload: dict = Body(None)):
    username = (payload and payload.get("username")) or "Hossam"
    profile = get_user_profile(username, mask=False)

    user_token = payload.get("bot_token") if payload else None
    # If user submitted a masked string or empty string, fallback to saved token
    if not user_token or "••" in user_token:
        token = profile.get("telegram_bot_token")
    else:
        token = user_token.strip()

    chat_id = (payload and payload.get("chat_id")) or profile.get("telegram_chat_id")

    if not token or not chat_id:
        return {"success": False, "error": "Please provide both Telegram Bot Token and Chat ID."}

    test_msg = f"""🚨 <b>[TEST] Sentinel Alert Dispatch Active</b>
━━━━━━━━━━━━━━━━━━━━
⚡ <b>Status:</b> Connection Verified
👤 <b>Recipient:</b> {profile.get('display_name', username)}
🌍 <b>Monitoring:</b> Egypt 🇪🇬, Iran 🇮🇷, Israel 🇮🇱, Germany 🇩🇪
🎯 <b>Alert Types:</b> Kinetic Warfare, Intelligence, Cyber, Nuclear
🔔 <b>Alert Threshold:</b> Critical & High Urgency Only

Your phone is successfully configured to receive instant lifetime alerts!
━━━━━━━━━━━━━━━━━━━━
<i>Middle East Intel Sentinel System Check OK</i>"""

    res = send_telegram_message(token, chat_id, test_msg)
    return res

@app.post("/api/test-email")
def api_test_email(payload: dict = Body(None)):
    settings = get_settings()
    host = settings.get("email_smtp_host", "smtp.gmail.com")
    port = settings.get("email_smtp_port", "587")
    sender = settings.get("email_sender", "")
    pwd = settings.get("email_password", "")
    recipient = (payload and payload.get("recipient")) or settings.get("email_recipient", "")

    if not host or not sender or not recipient:
        return {"success": False, "error": "SMTP Host, Sender, and Recipient are required."}

    html = """
    <div style="font-family: Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 20px; border-radius: 8px;">
        <h2 style="color: #38bdf8;">🛰️ Sentinel Test Alert</h2>
        <p>This is a test notification confirming your email dispatch channel is operational.</p>
    </div>
    """
    res = send_email_alert(host, port, sender, pwd, recipient, "🚨 [TEST] Sentinel Email Notification Active", html)
    return res

@app.post("/api/daemon/start")
def api_daemon_start():
    daemon_instance.start()
    return {"status": "started", "is_running": daemon_instance.is_running}

@app.post("/api/daemon/stop")
def api_daemon_stop():
    daemon_instance.stop()
    return {"status": "stopped", "is_running": daemon_instance.is_running}

# Mount static files
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.api_route("/", methods=["GET", "HEAD"])
def serve_index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

@app.api_route("/styles.css", methods=["GET", "HEAD"])
def serve_styles():
    p = os.path.join(STATIC_DIR, "styles.css")
    if os.path.exists(p):
        return FileResponse(p, media_type="text/css")
    return JSONResponse(status_code=404, content={"detail": "Not found"})

@app.api_route("/app.js", methods=["GET", "HEAD"])
def serve_app_js():
    p = os.path.join(STATIC_DIR, "app.js")
    if os.path.exists(p):
        return FileResponse(p, media_type="application/javascript")
    return JSONResponse(status_code=404, content={"detail": "Not found"})

@app.api_route("/vis-network.min.js", methods=["GET", "HEAD"])
def serve_vis_js():
    p = os.path.join(STATIC_DIR, "vis-network.min.js")
    if os.path.exists(p):
        return FileResponse(p, media_type="application/javascript")
    return JSONResponse(status_code=404, content={"detail": "Not found"})

@app.api_route("/favicon.ico", methods=["GET", "HEAD"])
def serve_favicon():
    p = os.path.join(STATIC_DIR, "favicon.ico")
    if os.path.exists(p):
        return FileResponse(p)
    return JSONResponse(status_code=204, content=None)

DARKWEB_STATIC_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "darkweb-sentinel", "static"))
if os.path.exists(DARKWEB_STATIC_DIR):
    app.mount("/darkweb", StaticFiles(directory=DARKWEB_STATIC_DIR, html=True), name="darkweb")

# --- CROSS-SENTINEL ROUTE PROXIES TO DARKNET SENTINEL ---
DARKWEB_LOCAL_URL = os.getenv("DARKWEB_LOCAL_URL", "http://127.0.0.1:8080")

@app.api_route("/api/search", methods=["GET", "POST", "OPTIONS"])
@app.api_route("/api/recon/{path:path}", methods=["GET", "POST", "OPTIONS"])
@app.api_route("/api/directories/{path:path}", methods=["GET", "POST", "OPTIONS"])
@app.api_route("/api/leaks", methods=["GET", "OPTIONS"])
@app.api_route("/api/leaks/{path:path}", methods=["GET", "POST", "OPTIONS"])
@app.api_route("/api/targets", methods=["GET", "OPTIONS"])
@app.api_route("/api/targets/{path:path}", methods=["GET", "POST", "OPTIONS"])
@app.api_route("/api/discovery", methods=["GET", "OPTIONS"])
@app.api_route("/api/discovery/{path:path}", methods=["GET", "POST", "OPTIONS"])
@app.api_route("/api/telegram/{path:path}", methods=["GET", "POST", "OPTIONS"])
@app.api_route("/api/tor/{path:path}", methods=["GET", "POST", "OPTIONS"])
@app.api_route("/api/cache/{path:path}", methods=["GET", "POST", "OPTIONS"])
@app.api_route("/api/watchlist/{path:path}", methods=["GET", "POST", "OPTIONS"])
async def proxy_to_darkweb(request: Request, path: Optional[str] = None):
    """Transparently proxies Darknet Sentinel routes to local port 8080."""
    req_path = request.url.path
    target_url = f"{DARKWEB_LOCAL_URL}{req_path}"
    if request.url.query:
        target_url += f"?{request.url.query}"
    
    headers = {k: v for k, v in request.headers.items() if k.lower() not in ("host", "content-length")}
    method = request.method
    body = await request.body()
    
    async with httpx.AsyncClient(timeout=35.0) as client:
        try:
            resp = await client.request(method, target_url, headers=headers, content=body)
            excluded_headers = {"content-length", "content-encoding", "transfer-encoding", "connection", "keep-alive"}
            filtered_headers = {k: v for k, v in resp.headers.items() if k.lower() not in excluded_headers}
            return Response(
                content=resp.content,
                status_code=resp.status_code,
                headers=filtered_headers,
                media_type=resp.headers.get("content-type")
            )
        except Exception as e:
            logger.error(f"Error proxying to Darknet Sentinel ({target_url}): {e}")
            raise HTTPException(status_code=502, detail=f"Darknet Backend Proxy Error: {str(e)}")
