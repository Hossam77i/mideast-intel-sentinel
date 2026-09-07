import sys
import os
import traceback

os.environ["SERVERLESS"] = "1"
os.environ["VERCEL"] = "1"

root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

try:
    from app.main import app
except Exception:
    err = traceback.format_exc()
    from fastapi import FastAPI
    from fastapi.responses import PlainTextResponse

    app = FastAPI()

    @app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"])
    async def debug_catcher(full_path: str):
        return PlainTextResponse(f"BACKEND INITIALIZATION ERROR:\n\n{err}", status_code=200)

    @app.get("/")
    async def debug_root():
        return PlainTextResponse(f"BACKEND INITIALIZATION ERROR:\n\n{err}", status_code=200)
