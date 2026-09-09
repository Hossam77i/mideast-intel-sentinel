import sys
import os

root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, root_dir)

from app.collector import collect_all_news
from app.notifier import dispatch_urgent_alerts

def run():
    print("Running scraper...")
    res = collect_all_news()
    print("Scraping results:", res)
    alert_res = dispatch_urgent_alerts()
    print("Alerts dispatched:", alert_res)

if __name__ == "__main__":
    run()
