import sys
import os

os.environ["SERVERLESS"] = "1"
os.environ["VERCEL"] = "1"

root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from app.main import app as _app

app = _app
application = app
