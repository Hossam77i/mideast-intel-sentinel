#!/usr/bin/env python3
import sys
import os
import argparse
import json

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import init_db, get_stats, get_articles, get_recent_notifications
from app.collector import collect_all_news
from app.notifier import dispatch_urgent_alerts
from app.graph_engine import extract_causal_chains

def main():
    parser = argparse.ArgumentParser(description="Middle East Intel Sentinel OSINT CLI")
    subparsers = parser.add_subparsers(dest="command", help="Subcommand to run")

    # scan
    subparsers.add_parser("scan", help="Run immediate news scan and trigger alerts")

    # stats
    subparsers.add_parser("stats", help="Display intelligence telemetry stats")

    # latest
    latest_p = subparsers.add_parser("latest", help="Show latest intelligence dispatches")
    latest_p.add_argument("--country", default=None, help="Filter by country (Iran, Israel, Egypt, Germany)")
    latest_p.add_argument("--critical", action="store_true", help="Show only critical flash alerts")
    latest_p.add_argument("--limit", type=int, default=10, help="Max items to show")

    # forecasts
    subparsers.add_parser("forecasts", help="Show predictive causal chains connecting past to future")

    args = parser.parse_args()
    init_db()

    if args.command == "scan":
        print("⚡ Scanning feeds...")
        res = collect_all_news()
        print(f"Scanned {res['total_scanned']} items. Ingested {res['new_inserted']} new. Critical: {res['critical_count']}")
        alert_res = dispatch_urgent_alerts()
        print(f"Alerts dispatched: {alert_res['sent']} sent, {alert_res['failed']} failed.")

    elif args.command == "stats":
        stats = get_stats()
        print("\n=== SENTINEL INTELLIGENCE STATS ===")
        print(f"Total Dispatches: {stats['total_articles']}")
        print(f"Critical Flash Alerts: {stats['critical_articles']}")
        print(f"High Priority Alerts: {stats['high_articles']}")
        print(f"Graph Nodes: {stats['total_nodes']} | Edges: {stats['total_edges']}")
        print(f"Phone Alerts Dispatched: {stats['alerts_sent']}")
        print("\nBy Country/Axis:")
        for c, count in stats["by_country"].items():
            print(f"  • {c}: {count}")
        print("\nBy Discipline:")
        for cat, count in stats["by_category"].items():
            print(f"  • {cat}: {count}")

    elif args.command == "latest":
        min_urgency = 75 if args.critical else None
        articles = get_articles(limit=args.limit, country=args.country, min_urgency=min_urgency)
        print(f"\n=== LATEST DISPATCHES ({len(articles)} items) ===")
        for a in articles:
            print(f"\n[{a['urgency_level']} - {a['urgency_score']}/100] [{a['country']}] {a['title']}")
            print(f"  Category: {a['category']} | Source: {a['source']}")
            if a['future_projection']:
                print(f"  🔮 Forecast: {a['future_projection']}")
            print(f"  Link: {a['link']}")

    elif args.command == "forecasts":
        chains = extract_causal_chains()
        print(f"\n=== STRATEGIC CAUSAL CHAINS ({len(chains)} active) ===")
        for i, c in enumerate(chains[:5], 1):
            print(f"\n--- CHAIN #{i} ---")
            print(f"🏛️ Past Precedent: {c['past_label']}")
            print(f"   {c['past_details']}")
            print(f"⚡ Current Trigger: {c['current_label']} ({c['current_country']})")
            print(f"🔮 Future Strategic Forecast:")
            print(f"   {c['future_details']}")

    else:
        parser.print_help()

if __name__ == "__main__":
    main()
