import urllib.request
import urllib.parse
import feedparser
import re
import json
import logging
from datetime import datetime, timezone
from bs4 import BeautifulSoup
from .database import (
    insert_article, get_connection, update_settings,
    get_settings
)
from .analyzer import analyze_article

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sentinel.collector")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
}

FEEDS = [
    {
        "name": "Google News: Iran Strategic",
        "url": "https://news.google.com/rss/search?q=iran+military+OR+intelligence+OR+missile+OR+nuclear&hl=en-US&gl=US&ceid=US:en"
    },
    {
        "name": "Google News: Israel Intel & War",
        "url": "https://news.google.com/rss/search?q=israel+mossad+OR+idf+OR+strike+OR+airstrike&hl=en-US&gl=US&ceid=US:en"
    },
    {
        "name": "Google News: Egypt Military & Border",
        "url": "https://news.google.com/rss/search?q=egypt+military+OR+intelligence+OR+sinai+OR+suez&hl=en-US&gl=US&ceid=US:en"
    },
    {
        "name": "Google News: Germany Middle East / BND",
        "url": "https://news.google.com/rss/search?q=germany+middle+east+OR+bnd+OR+weapons+iran+israel&hl=en-US&gl=US&ceid=US:en"
    },
    {
        "name": "BBC World Middle East",
        "url": "http://feeds.bbci.co.uk/news/world/middle_east/rss.xml"
    },
    {
        "name": "Deutsche Welle World",
        "url": "https://rss.dw.com/rdf/rss-en-all"
    }
]

def clean_html(raw_html: str) -> str:
    if not raw_html:
        return ""
    soup = BeautifulSoup(raw_html, "html.parser")
    text = soup.get_text(separator=" ")
    return re.sub(r"\s+", " ", text).strip()

def fetch_feed(feed_info: dict) -> list:
    name = feed_info["name"]
    url = feed_info["url"]
    entries = []

    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=10) as resp:
            content = resp.read()
            parsed = feedparser.parse(content)
            for entry in parsed.entries[:25]:  # Take top 25 recent
                title = clean_html(getattr(entry, "title", ""))
                link = getattr(entry, "link", "")
                summary = clean_html(getattr(entry, "summary", "") or getattr(entry, "description", ""))
                published = getattr(entry, "published", "") or getattr(entry, "updated", "")
                source_title = name
                if hasattr(entry, "source") and hasattr(entry.source, "title"):
                    source_title = entry.source.title

                if title:
                    entries.append({
                        "title": title,
                        "link": link,
                        "description": summary,
                        "published_at": published or datetime.now(timezone.utc).isoformat(),
                        "source": source_title
                    })
    except Exception as e:
        logger.warning(f"Failed to fetch feed {name}: {e}")

    return entries

def fetch_newsapi(api_key: str) -> list:
    """Optional external NewsAPI.org collector if user supplies key."""
    if not api_key:
        return []
    entries = []
    queries = ["iran military", "israel strike mossad", "egypt intelligence", "germany middle east arms"]
    for q in queries:
        try:
            url = f"https://newsapi.org/v2/everything?q={urllib.parse.quote(q)}&sortBy=publishedAt&pageSize=15&apiKey={api_key}"
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if data.get("status") == "ok":
                    for art in data.get("articles", []):
                        entries.append({
                            "title": art.get("title", ""),
                            "link": art.get("url", ""),
                            "description": art.get("description", "") or "",
                            "published_at": art.get("publishedAt", datetime.now(timezone.utc).isoformat()),
                            "source": art.get("source", {}).get("name", "NewsAPI")
                        })
        except Exception as e:
            logger.warning(f"NewsAPI error on query {q}: {e}")
            break
    return entries

def sync_to_knowledge_graph(article_id: int, article_dict: dict, analysis: dict):
    """Integrate significant news into the interactive knowledge and forecast graph."""
    if analysis["urgency_score"] < 45:
        return  # Only attach noteworthy events to graph to prevent noise

    conn = get_connection()
    cursor = conn.cursor()

    node_id = f"art:{article_id}"
    label = article_dict["title"]
    if len(label) > 65:
        label = label[:62] + "..."

    # 1. Add Current Event Node
    cursor.execute("""
        INSERT OR REPLACE INTO graph_nodes (node_id, node_type, label, country, category, details, urgency_level, timestamp, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        node_id,
        "current",
        label,
        analysis["country"],
        analysis["category"],
        article_dict.get("description", "") or article_dict["title"],
        analysis["urgency_level"],
        article_dict.get("published_at", datetime.now(timezone.utc).isoformat()),
        json.dumps({
            "link": article_dict.get("link", ""),
            "urgency_score": analysis["urgency_score"],
            "source": article_dict.get("source", "")
        })
    ))

    # 2. Connect Current Event to Detected Actor/Agency Entities
    for ent in analysis.get("entities", []):
        ent_node = None
        if ent == "Mossad": ent_node = "entity:israel_mossad"
        elif ent == "IDF": ent_node = "entity:israel_idf"
        elif ent == "IRGC": ent_node = "entity:iran_irgc"
        elif ent == "Egypt GIS": ent_node = "entity:egypt_gis"
        elif ent == "Germany BND": ent_node = "entity:germany_bnd"
        elif ent == "AEOI Nuclear": ent_node = "entity:iran_nuclear"

        if ent_node:
            cursor.execute("""
                INSERT OR IGNORE INTO graph_edges (source_node, target_node, relation, weight, metadata)
                VALUES (?, ?, ?, ?, ?)
            """, (ent_node, node_id, "INVOLVED_IN", 1.2, json.dumps({"urgency": analysis["urgency_score"]})))

    # 3. Connect to Historical Precedent
    if "Iran" in analysis["country"] and "Israel" in analysis["country"]:
        cursor.execute("""
            INSERT OR IGNORE INTO graph_edges (source_node, target_node, relation, weight, metadata)
            VALUES (?, ?, ?, ?, ?)
        """, ("past:missile_barrage_2024", node_id, "PRECEDENT_FOR", 1.0, "{}"))
    elif "Egypt" in analysis["country"]:
        cursor.execute("""
            INSERT OR IGNORE INTO graph_edges (source_node, target_node, relation, weight, metadata)
            VALUES (?, ?, ?, ?, ?)
        """, ("past:camp_david_sinai", node_id, "PRECEDENT_FOR", 1.0, "{}"))
    elif "Germany" in analysis["country"]:
        cursor.execute("""
            INSERT OR IGNORE INTO graph_edges (source_node, target_node, relation, weight, metadata)
            VALUES (?, ?, ?, ?, ?)
        """, ("past:bnd_proliferation_tracking", node_id, "PRECEDENT_FOR", 1.0, "{}"))
    elif "Nuclear" in analysis["category"]:
        cursor.execute("""
            INSERT OR IGNORE INTO graph_edges (source_node, target_node, relation, weight, metadata)
            VALUES (?, ?, ?, ?, ?)
        """, ("past:stuxnet_cyber", node_id, "PRECEDENT_FOR", 1.0, "{}"))

    # 4. Generate & Link Future Forecast Node (The "Future News" network)
    if analysis.get("future_projection") and analysis["urgency_score"] >= 65:
        fut_id = f"fut:{article_id}"
        fut_label = f"FORECAST: {analysis['future_projection'][:55]}..."
        cursor.execute("""
            INSERT OR REPLACE INTO graph_nodes (node_id, node_type, label, country, category, details, urgency_level, timestamp, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            fut_id,
            "future",
            fut_label,
            analysis["country"],
            analysis["category"],
            analysis["future_projection"],
            "HIGH" if analysis["urgency_score"] >= 75 else "MEDIUM",
            "PROJECTED_IMPACT",
            json.dumps({"predicted_from": node_id, "risk_level": "ELEVATED"})
        ))

        cursor.execute("""
            INSERT OR IGNORE INTO graph_edges (source_node, target_node, relation, weight, metadata)
            VALUES (?, ?, ?, ?, ?)
        """, (node_id, fut_id, "PROJECTS_RISK_OF", 1.5, json.dumps({"forecast": True})))

    conn.commit()
    conn.close()

def collect_all_news() -> dict:
    """Run full collection cycle across all RSS sources and NewsAPI."""
    settings = get_settings()
    newsapi_key = settings.get("newsapi_key", "")
    
    total_found = 0
    new_inserted = 0
    critical_count = 0

    all_raw_entries = []

    # 1. Fetch RSS Feeds
    for feed in FEEDS:
        entries = fetch_feed(feed)
        total_found += len(entries)
        all_raw_entries.extend(entries)

    # 2. Fetch NewsAPI if configured
    if newsapi_key:
        api_entries = fetch_newsapi(newsapi_key)
        total_found += len(api_entries)
        all_raw_entries.extend(api_entries)

    # 3. Analyze and store
    for item in all_raw_entries:
        analysis = analyze_article(item["title"], item.get("description", ""), item.get("source", ""))
        
        # Merge analysis into item
        item["country"] = analysis["country"]
        item["category"] = analysis["category"]
        item["urgency_score"] = analysis["urgency_score"]
        item["urgency_level"] = analysis["urgency_level"]
        item["entities"] = analysis["entities"]
        item["historical_link"] = analysis["historical_link"]
        item["future_projection"] = analysis["future_projection"]

        article_id = insert_article(item)
        if article_id:
            new_inserted += 1
            if item["urgency_score"] >= 75:
                critical_count += 1
            # Connect to graph
            sync_to_knowledge_graph(article_id, item, analysis)

    now_iso = datetime.now(timezone.utc).isoformat()
    update_settings({"last_sync_time": now_iso})

    logger.info(f"Ingestion complete: {total_found} scanned, {new_inserted} new articles, {critical_count} critical.")
    return {
        "total_scanned": total_found,
        "new_inserted": new_inserted,
        "critical_count": critical_count,
        "timestamp": now_iso
    }


def fetch_historical_archive(year: str, custom_query: str = None) -> dict:
    """Dynamically query Google News and global archives for historical news from a specific year."""
    if not year or year == "All":
        return {"status": "error", "message": "Valid year required"}

    queries = [
        f"iran military intelligence after:{year}-01-01 before:{year}-12-31",
        f"israel mossad idf strike after:{year}-01-01 before:{year}-12-31",
        f"egypt intelligence sinai suez after:{year}-01-01 before:{year}-12-31",
        f"germany middle east weapons bnd after:{year}-01-01 before:{year}-12-31"
    ]
    if custom_query:
        queries.insert(0, f"{custom_query} after:{year}-01-01 before:{year}-12-31")

    ingested = 0
    for q in queries:
        try:
            url = f"https://news.google.com/rss/search?q={urllib.parse.quote(q)}&hl=en-US&gl=US&ceid=US:en"
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=10) as resp:
                feed = feedparser.parse(resp.read())
                for entry in feed.entries[:15]:
                    title = clean_html(getattr(entry, "title", ""))
                    link = getattr(entry, "link", "")
                    summary = clean_html(getattr(entry, "summary", "") or getattr(entry, "description", ""))
                    published = getattr(entry, "published", "") or f"{year}-06-15T12:00:00Z"
                    source_title = getattr(entry, "source", {}).get("title", "Historical Archive") if hasattr(entry, "source") and isinstance(entry.source, dict) else "Historical Wire"

                    if title:
                        analysis = analyze_article(title, summary, source_title)
                        item = {
                            "title": title,
                            "link": link,
                            "description": summary,
                            "published_at": published,
                            "source": source_title,
                            "country": analysis["country"],
                            "category": analysis["category"],
                            "urgency_score": analysis["urgency_score"],
                            "urgency_level": analysis["urgency_level"],
                            "entities": analysis["entities"],
                            "historical_link": analysis["historical_link"],
                            "future_projection": analysis["future_projection"]
                        }
                        art_id = insert_article(item)
                        if art_id:
                            ingested += 1
                            sync_to_knowledge_graph(art_id, item, analysis)
        except Exception as e:
            logger.warning(f"Historical fetch error for {q}: {e}")

    return {"status": "success", "year": year, "ingested": ingested}
