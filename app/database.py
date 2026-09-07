import sqlite3
import json
import hashlib
from datetime import datetime, timezone
import os

import shutil

ORIGINAL_DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
ORIGINAL_DB_PATH = os.path.join(ORIGINAL_DATA_DIR, "sentinel.db")
SEED_DB_PATH = os.path.join(ORIGINAL_DATA_DIR, "seed_sentinel.db")

IS_SERVERLESS = bool(os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME") or not os.access(os.path.dirname(ORIGINAL_DATA_DIR), os.W_OK))

if IS_SERVERLESS:
    DATA_DIR = "/tmp/sentinel_data"
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
    except Exception:
        pass
    DB_PATH = os.path.join(DATA_DIR, "sentinel.db")
    if not os.path.exists(DB_PATH):
        source_seed = SEED_DB_PATH if os.path.exists(SEED_DB_PATH) else (ORIGINAL_DB_PATH if os.path.exists(ORIGINAL_DB_PATH) else None)
        if source_seed:
            try:
                shutil.copyfile(source_seed, DB_PATH)
            except Exception:
                pass
else:
    DATA_DIR = ORIGINAL_DATA_DIR
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
    except Exception:
        pass
    DB_PATH = os.environ.get("SENTINEL_DB_PATH", ORIGINAL_DB_PATH)

def get_connection():
    try:
        os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
    except Exception:
        pass
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    # Articles table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hash TEXT UNIQUE,
        title TEXT NOT NULL,
        description TEXT,
        source TEXT,
        link TEXT,
        published_at TEXT,
        fetched_at TEXT,
        country TEXT,
        category TEXT,
        urgency_score INTEGER DEFAULT 0,
        urgency_level TEXT DEFAULT 'LOW',
        entities TEXT,
        historical_link TEXT,
        future_projection TEXT,
        notified INTEGER DEFAULT 0
    )
    """)

    # Events graph nodes
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS graph_nodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node_id TEXT UNIQUE,
        node_type TEXT,
        label TEXT NOT NULL,
        country TEXT,
        category TEXT,
        details TEXT,
        urgency_level TEXT DEFAULT 'MEDIUM',
        timestamp TEXT,
        metadata TEXT
    )
    """)

    # Events graph edges
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS graph_edges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_node TEXT NOT NULL,
        target_node TEXT NOT NULL,
        relation TEXT NOT NULL,
        weight REAL DEFAULT 1.0,
        metadata TEXT,
        UNIQUE(source_node, target_node, relation)
    )
    """)

    # Notifications log
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        article_id INTEGER,
        channel TEXT,
        status TEXT,
        title TEXT,
        urgency_score INTEGER,
        sent_at TEXT,
        details TEXT
    )
    """)

    # Global system settings
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )
    """)

    # User Profiles for multi-user settings isolation
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS user_profiles (
        username TEXT PRIMARY KEY,
        display_name TEXT,
        telegram_bot_token TEXT,
        telegram_chat_id TEXT,
        telegram_enabled INTEGER DEFAULT 1,
        email_recipient TEXT DEFAULT '',
        email_enabled INTEGER DEFAULT 0,
        urgency_threshold INTEGER DEFAULT 75,
        poll_interval_minutes INTEGER DEFAULT 10,
        theme_preference TEXT DEFAULT 'dark',
        created_at TEXT
    )
    """)

    # Indexes
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_articles_urgency ON articles(urgency_score);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_articles_country ON articles(country);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_articles_notified ON articles(notified);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_graph_nodes_type ON graph_nodes(node_type);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_graph_nodes_ts ON graph_nodes(timestamp);")

    conn.commit()

    # Seed default Hossam profile
    cursor.execute("""
        INSERT OR IGNORE INTO user_profiles (
            username, display_name, telegram_bot_token, telegram_chat_id,
            telegram_enabled, urgency_threshold, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        "Hossam",
        "Hossam (@Aclies)",
        "8447880856:AAGOaLR_4542pG0kqkwPUbjOC2PXLqUryOs",
        "7195584903",
        1,
        75,
        datetime.now(timezone.utc).isoformat()
    ))

    # Default system settings
    default_settings = {
        "telegram_bot_token": "8447880856:AAGOaLR_4542pG0kqkwPUbjOC2PXLqUryOs",
        "telegram_chat_id": "7195584903",
        "telegram_enabled": "true",
        "urgency_threshold": "75",
        "poll_interval_minutes": "10",
        "tracked_countries": json.dumps(["Egypt", "Iran", "Israel", "Germany"]),
        "tracked_categories": json.dumps(["Warfare", "Intelligence", "Cyber", "Nuclear", "Diplomacy", "Arms"]),
        "daemon_status": "running"
    }

    for k, v in default_settings.items():
        cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (k, v))

    conn.commit()
    seed_historical_baseline(conn)
    seed_2022_2023_archives(conn)
    conn.close()

def seed_historical_baseline(conn):
    """Seed foundational anchor events and intelligence agencies."""
    cursor = conn.cursor()

    entities = [
        ("entity:iran_irgc", "entity", "IRGC (Islamic Revolutionary Guard Corps)", "Iran", "Intelligence", "State military branch and covert foreign operations (Quds Force).", "HIGH", "1979-Present"),
        ("entity:israel_mossad", "entity", "Mossad (Institute for Intelligence)", "Israel", "Intelligence", "Foreign intelligence agency handling covert actions and intelligence gathering.", "HIGH", "1949-Present"),
        ("entity:israel_idf", "entity", "IDF (Israel Defense Forces)", "Israel", "Warfare", "Main military force conducting strikes, regional defense, and border warfare.", "HIGH", "1948-Present"),
        ("entity:egypt_gis", "entity", "GIS (General Intelligence Service)", "Egypt", "Intelligence", "Egypt Mukhabarat handling regional mediation, Sinai border security, and Red Sea monitoring.", "MEDIUM", "1954-Present"),
        ("entity:germany_bnd", "entity", "BND (Bundesnachrichtendienst)", "Germany", "Intelligence", "German foreign intelligence agency monitoring Middle East proliferation, drone networks, and European security.", "MEDIUM", "1956-Present"),
        ("entity:iran_nuclear", "entity", "AEOI (Atomic Energy Org of Iran)", "Iran", "Nuclear", "Centrifuge cascades, Fordow/Natanz underground enrichment facilities.", "CRITICAL", "1974-Present")
    ]

    for node_id, ntype, label, country, cat, details, urgency, ts in entities:
        cursor.execute("""
            INSERT OR IGNORE INTO graph_nodes (node_id, node_type, label, country, category, details, urgency_level, timestamp, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (node_id, ntype, label, country, cat, details, urgency, ts, json.dumps({"is_actor": True})))

    past_events = [
        ("past:stuxnet_cyber", "past", "Operation Olympic Games (Stuxnet)", "Iran", "Cyber", 
         "Historical benchmark: Cyber sabotage against Natanz nuclear centrifuges, establishing the cyber warfare precedent.", "HIGH", "2010"),
        ("past:camp_david_sinai", "past", "Camp David & Sinai Security Protocol", "Egypt", "Diplomacy", 
         "Foundational Egypt-Israel peace treaty establishing Sinai demilitarized zones and intelligence coordination mechanisms.", "LOW", "1979"),
        ("past:missile_barrage_2024", "past", "Direct Iran-Israel Missile & Drone Exchanges", "Regional", "Warfare", 
         "Shift from proxy warfare to direct state-on-state ballistic missile strikes and air defense interceptions.", "CRITICAL", "2024"),
        ("past:bnd_proliferation_tracking", "past", "Germany-EU Middle East Sanctions Framework", "Germany", "Diplomacy", 
         "German BND and customs intelligence interdicting dual-use components and UAV technology destined for Middle Eastern state proxies.", "MEDIUM", "2023"),
        ("past:red_sea_maritime_crisis", "past", "Red Sea & Bab al-Mandab Maritime Strikes", "Regional", "Warfare", 
         "Anti-ship missile and UAV attacks disrupting Suez Canal shipping, impacting Egyptian revenue and German trade corridors.", "HIGH", "2023")
    ]

    for node_id, ntype, label, country, cat, details, urgency, ts in past_events:
        cursor.execute("""
            INSERT OR IGNORE INTO graph_nodes (node_id, node_type, label, country, category, details, urgency_level, timestamp, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (node_id, ntype, label, country, cat, details, urgency, ts, json.dumps({"historical_precedent": True})))

    edges = [
        ("entity:israel_mossad", "past:stuxnet_cyber", "EXECUTED", 1.0),
        ("past:stuxnet_cyber", "entity:iran_nuclear", "TARGETED", 1.0),
        ("entity:egypt_gis", "past:camp_david_sinai", "GUARANTEES", 1.0),
        ("entity:iran_irgc", "past:missile_barrage_2024", "LAUNCHED", 1.0),
        ("past:missile_barrage_2024", "entity:israel_idf", "TARGETED", 1.0),
        ("entity:germany_bnd", "past:bnd_proliferation_tracking", "COORDINATES", 1.0),
        ("past:bnd_proliferation_tracking", "entity:iran_irgc", "INTERDICTS_ARMS_OF", 1.0),
        ("past:red_sea_maritime_crisis", "entity:egypt_gis", "DIRECTLY_IMPACTS_SUEZ_OF", 1.0)
    ]

    for src, tgt, rel, weight in edges:
        cursor.execute("""
            INSERT OR IGNORE INTO graph_edges (source_node, target_node, relation, weight, metadata)
            VALUES (?, ?, ?, ?, ?)
        """, (src, tgt, rel, weight, "{}"))

    conn.commit()

def seed_2022_2023_archives(conn):
    """Seed authentic 2022 and 2023 historical articles & nodes."""
    cursor = conn.cursor()

    historical_articles = [
        ("Deepening Russia-Iran Military & Drone Relationship Alarms Israel and Western Intelligence",
         "Tehran agrees to provide Shahed-136 UAVs and aerospace coordination, creating major strategic shift monitored by Mossad and BND.",
         "Reuters / Intelligence Wire", "https://reuters.com/world/middle-east", "2022-12-15T10:00:00Z", "Iran", "Arms", 85, "CRITICAL",
         ["IRGC", "Mossad", "Germany BND"], "Rooted in legacy Iranian asymmetric drone development.",
         "Forecasts rapid proliferation of low-cost loitering munitions across regional conflict theatres."),
        
        ("Mossad Chief Barnea Issues Dire Warning on Iranian Uranium Enrichment Breakout at Fordow",
         "Israeli intelligence reveals Iran has installed advanced IR-6 centrifuge cascades capable of reaching 60% and 90% purity.",
         "Times of Israel", "https://timesofisrael.com", "2022-09-12T08:30:00Z", "Iran / Israel", "Nuclear", 90, "CRITICAL",
         ["Mossad", "AEOI Nuclear"], "Follows the 2010 Stuxnet sabotage and subsequent JCPOA collapse.",
         "Anticipate covert preemptive sabotage operations against centrifuge drive mechanisms and power switches."),

        ("Egypt Reinforces Sinai Demarcation Lines and Enhances Maritime Security off Red Sea Corridors",
         "General Intelligence Service (GIS) and 2nd Field Army coordinate security sweeps and border surveillance protocols.",
         "Ahram Online", "https://ahram.org.eg", "2022-11-04T12:00:00Z", "Egypt", "Intelligence", 55, "HIGH",
         ["Egypt GIS", "Suez Canal / Sinai"], "Anchored in 1979 Camp David security arrangements.",
         "Enhances long-term Egyptian deterrence against Sinai insurgent infiltration and secures Suez maritime approach."),

        ("Germany Announces Historic 'Zeitenwende' Defense Realignment and Initiates Arrow-3 Missile Procurement with Israel",
         "Berlin defense committee and BND review strategic air defense needs, initiating negotiations for the Israeli-US exo-atmospheric Arrow-3 interceptor.",
         "Deutsche Welle (DW)", "https://dw.com", "2022-09-28T14:15:00Z", "Germany / Middle East", "Arms", 65, "HIGH",
         ["Germany BND", "IDF"], "Follows decades of bilateral German-Israeli security coordination.",
         "Positions Germany as central European air defense hub with direct strategic ties to Israeli defense aerospace."),

        ("IAEA Board Adopts Resolution Censuring Iran Over Undeclared Nuclear Sites in Marivan and Varamin",
         "Grossi warns of severed inspector camera feeds as Tehran responds by boosting uranium enrichment at Natanz.",
         "BBC World", "https://bbc.com", "2022-06-09T16:00:00Z", "Iran", "Nuclear", 80, "CRITICAL",
         ["AEOI Nuclear"], "Connected to 2003 AMAD Project documentation seized by Mossad in 2018.",
         "High risk of escalated cyber-kinetic tit-for-tat strikes targeting Iranian enrichment electrical grids."),

        ("Israeli Precision Airstrikes Hit Iranian Munitions Depots and Radar Sites Near Damascus Airport",
         "IDF operations target Quds Force weapons transfer shipments destined for regional proxy stockpiles.",
         "Times of Israel", "https://timesofisrael.com", "2022-06-10T04:20:00Z", "Iran / Israel", "Warfare", 78, "CRITICAL",
         ["IDF", "IRGC"], "Precedent established during Campaign Between the Wars (MABAM).",
         "Likely retaliatory UAV or rocket salvos against Golan Heights border radars."),

        ("Outbreak of Multi-Front Conflict: Massive Infiltration and Regional Escalation Axis",
         "IDF mobilizes 300,000 reserves; Mossad and Shin Bet activate emergency foreign counter-espionage protocols.",
         "Reuters", "https://reuters.com", "2023-10-07T09:00:00Z", "Israel", "Warfare", 98, "CRITICAL",
         ["IDF", "Mossad", "Shin Bet"], "Largest operational failure and war mobilization since Yom Kippur 1973.",
         "Triggers widespread multi-front warfare, northern border evacuations, and regional proxy missile activation."),

        ("Red Sea Crisis Erupts: Anti-Ship Ballistic Missiles Target Commercial Vessels in Bab al-Mandab",
         "Maritime traffic rerouted around Cape of Good Hope, dealing multi-billion dollar monthly blow to Egypt's Suez Canal revenues.",
         "France24", "https://france24.com", "2023-11-20T11:30:00Z", "Egypt", "Warfare", 88, "CRITICAL",
         ["Houthis", "Suez Canal / Sinai", "Egypt GIS"], "Precedent: 1967 Suez closure and Tanker War of the 1980s.",
         "Urgent international naval task forces formed; severe inflation on European-Asian supply chains."),

        ("Germany Deploys Air-Defense Frigate 'Hessen' Under EU Maritime Security Mission Aspides in Red Sea",
         "Bundeswehr and BND monitor anti-drone defense corridors protecting international merchant vessels.",
         "Deutsche Welle (DW)", "https://dw.com", "2023-12-18T15:00:00Z", "Germany / Middle East", "Warfare", 72, "HIGH",
         ["Germany BND", "Houthis"], "First German naval kinetic engagements since World War II.",
         "Cementing German military presence in southern Red Sea chokepoints and European supply security."),

        ("Egypt Hosts Cairo International Peace Summit to Mediate Humanitarian Corridors and De-escalation",
         "President Sisi and GIS Chief convene regional leaders, firmly rejecting forced displacement into Sinai.",
         "Ahram Online", "https://ahram.org.eg", "2023-10-21T13:45:00Z", "Egypt", "Diplomacy", 65, "HIGH",
         ["Egypt GIS", "Suez Canal / Sinai"], "Camp David foundational peace obligations and Sinai sovereignty guarantees.",
         "Establishment of intensive Cairo mediation axis involving CIA, Mossad, and Egyptian General Intelligence.")
    ]

    for title, desc, src, link, pub_at, country, cat, score, ulevel, ents, hist, fut in historical_articles:
        art_hash = hashlib.sha256(f"{title.strip().lower()}|{link.strip().lower()}".encode("utf-8")).hexdigest()
        try:
            cursor.execute("""
                INSERT OR IGNORE INTO articles (
                    hash, title, description, source, link, published_at, fetched_at,
                    country, category, urgency_score, urgency_level, entities,
                    historical_link, future_projection, notified
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            """, (
                art_hash, title, desc, src, link, pub_at, pub_at,
                country, cat, score, ulevel, json.dumps(ents), hist, fut
            ))
            art_id = cursor.lastrowid
            if art_id:
                node_id = f"art:{art_id}"
                label = title[:58] + ("..." if len(title) > 58 else "")
                year_tag = pub_at[:4]
                cursor.execute("""
                    INSERT OR IGNORE INTO graph_nodes (node_id, node_type, label, country, category, details, urgency_level, timestamp, metadata)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    node_id, "past" if year_tag in ["2022", "2023"] else "current",
                    label, country, cat, desc, ulevel, year_tag,
                    json.dumps({"year": year_tag, "link": link, "source": src, "historical": True})
                ))
        except Exception:
            pass

    conn.commit()

def compute_article_hash(title, link):
    text = f"{title.strip().lower()}|{link.strip().lower()}"
    return hashlib.sha256(text.encode("utf-8")).hexdigest()

def insert_article(article_dict):
    conn = get_connection()
    cursor = conn.cursor()
    art_hash = article_dict.get("hash") or compute_article_hash(article_dict["title"], article_dict.get("link", ""))
    
    try:
        cursor.execute("""
            INSERT INTO articles (
                hash, title, description, source, link, published_at, fetched_at,
                country, category, urgency_score, urgency_level, entities,
                historical_link, future_projection, notified
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            art_hash,
            article_dict["title"],
            article_dict.get("description", ""),
            article_dict.get("source", "OSINT Feed"),
            article_dict.get("link", ""),
            article_dict.get("published_at", datetime.now(timezone.utc).isoformat()),
            datetime.now(timezone.utc).isoformat(),
            article_dict.get("country", "Regional"),
            article_dict.get("category", "General"),
            article_dict.get("urgency_score", 0),
            article_dict.get("urgency_level", "LOW"),
            json.dumps(article_dict.get("entities", [])),
            article_dict.get("historical_link", ""),
            article_dict.get("future_projection", ""),
            0
        ))
        conn.commit()
        article_id = cursor.lastrowid
        conn.close()
        return article_id
    except sqlite3.IntegrityError:
        conn.close()
        return None

def build_year_filter_clause(year=None, from_year=None, to_year=None):
    """Construct SQL filter clause for flexible year and range queries."""
    clause = ""
    params = []

    if from_year and to_year and from_year != "All" and to_year != "All":
        clause += " AND substr(published_at, 1, 4) >= ? AND substr(published_at, 1, 4) <= ?"
        params.extend([str(from_year).strip(), str(to_year).strip()])
    elif from_year and from_year != "All":
        clause += " AND substr(published_at, 1, 4) >= ?"
        params.append(str(from_year).strip())
    elif to_year and to_year != "All":
        clause += " AND substr(published_at, 1, 4) <= ?"
        params.append(str(to_year).strip())
    elif year and year != "All":
        clause += " AND published_at LIKE ?"
        params.append(f"{year}%")

    return clause, params

def get_articles(limit=30, offset=0, country=None, category=None, min_urgency=None,
                 search=None, year=None, from_year=None, to_year=None, order_by="time_desc"):
    """Query articles with pagination, flexible year ranges, and customizable sorting."""
    conn = get_connection()
    cursor = conn.cursor()
    query = "SELECT * FROM articles WHERE 1=1"
    params = []

    if country and country != "All":
        query += " AND country LIKE ?"
        params.append(f"%{country}%")
    if category and category != "All":
        query += " AND category = ?"
        params.append(category)
    if min_urgency is not None and int(min_urgency) > 0:
        query += " AND urgency_score >= ?"
        params.append(int(min_urgency))

    time_clause, time_params = build_year_filter_clause(year, from_year, to_year)
    query += time_clause
    params.extend(time_params)

    if search:
        query += " AND (title LIKE ? OR description LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%"])

    # Sorting / Rearranging Order
    if order_by == "time_asc":
        query += " ORDER BY published_at ASC, id ASC"
    elif order_by == "severity_desc":
        query += " ORDER BY urgency_score DESC, published_at DESC, id DESC"
    elif order_by == "severity_asc":
        query += " ORDER BY urgency_score ASC, published_at DESC, id DESC"
    elif order_by == "country":
        query += " ORDER BY country ASC, published_at DESC"
    else:  # time_desc (Default)
        query += " ORDER BY published_at DESC, id DESC"

    query += " LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    cursor.execute(query, params)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def count_articles(country=None, category=None, min_urgency=None, search=None,
                   year=None, from_year=None, to_year=None):
    """Get total matching articles count for pagination checks."""
    conn = get_connection()
    cursor = conn.cursor()
    query = "SELECT COUNT(*) as total FROM articles WHERE 1=1"
    params = []

    if country and country != "All":
        query += " AND country LIKE ?"
        params.append(f"%{country}%")
    if category and category != "All":
        query += " AND category = ?"
        params.append(category)
    if min_urgency is not None and int(min_urgency) > 0:
        query += " AND urgency_score >= ?"
        params.append(int(min_urgency))

    time_clause, time_params = build_year_filter_clause(year, from_year, to_year)
    query += time_clause
    params.extend(time_params)

    if search:
        query += " AND (title LIKE ? OR description LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%"])

    cursor.execute(query, params)
    total = cursor.fetchone()["total"]
    conn.close()
    return total

def get_unnotified_urgent_articles(threshold=75):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM articles 
        WHERE urgency_score >= ? AND notified = 0
        ORDER BY urgency_score DESC, id DESC
    """, (threshold,))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def mark_article_notified(article_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE articles SET notified = 1 WHERE id = ?", (article_id,))
    conn.commit()
    conn.close()

def log_notification(article_id, channel, status, title, score, details=""):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO notifications (article_id, channel, status, title, urgency_score, sent_at, details)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        article_id, channel, status, title, score,
        datetime.now(timezone.utc).isoformat(), details
    ))
    conn.commit()
    conn.close()

def get_recent_notifications(limit=30):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM notifications ORDER BY id DESC LIMIT ?", (limit,))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def get_settings():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT key, value FROM settings")
    settings = {r["key"]: r["value"] for r in cursor.fetchall()}
    conn.close()
    return settings

def update_settings(updates: dict):
    conn = get_connection()
    cursor = conn.cursor()
    for k, v in updates.items():
        cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (k, str(v)))
    conn.commit()
    conn.close()

def mask_credential(val: str) -> str:
    """Mask credentials so tokens/passwords never leak in public views."""
    if not val:
        return ""
    if len(val) <= 8:
        return "••••••••"
    return val[:6] + "••••••••" + val[-4:]

# User Profiles Management
def get_user_profile(username: str, mask: bool = False):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM user_profiles WHERE username = ?", (username.strip(),))
    row = cursor.fetchone()
    if row:
        profile = dict(row)
        conn.close()
        if mask and profile.get("telegram_bot_token"):
            profile["telegram_bot_token_masked"] = mask_credential(profile["telegram_bot_token"])
        return profile
    
    # Create new profile if not found
    default_profile = {
        "username": username.strip(),
        "display_name": username.strip(),
        "telegram_bot_token": "",
        "telegram_chat_id": "",
        "telegram_enabled": 0,
        "email_recipient": "",
        "email_enabled": 0,
        "urgency_threshold": 75,
        "poll_interval_minutes": 10,
        "theme_preference": "dark",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    cursor.execute("""
        INSERT INTO user_profiles (
            username, display_name, telegram_bot_token, telegram_chat_id,
            telegram_enabled, email_recipient, email_enabled, urgency_threshold,
            poll_interval_minutes, theme_preference, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        default_profile["username"], default_profile["display_name"],
        default_profile["telegram_bot_token"], default_profile["telegram_chat_id"],
        default_profile["telegram_enabled"], default_profile["email_recipient"],
        default_profile["email_enabled"], default_profile["urgency_threshold"],
        default_profile["poll_interval_minutes"], default_profile["theme_preference"],
        default_profile["created_at"]
    ))
    conn.commit()
    conn.close()
    return default_profile

def save_user_profile(username: str, data: dict):
    conn = get_connection()
    cursor = conn.cursor()
    existing = get_user_profile(username, mask=False)
    
    # If received token is masked (contains bullet '•'), preserve existing raw token
    new_token = data.get("telegram_bot_token", "")
    if new_token and "••" not in new_token:
        tg_token = new_token.strip()
    else:
        tg_token = existing.get("telegram_bot_token", "")

    tg_chat = data.get("telegram_chat_id", existing.get("telegram_chat_id", "")).strip()
    tg_en = 1 if str(data.get("telegram_enabled", existing.get("telegram_enabled"))).lower() in ["true", "1"] else 0
    urgency = int(data.get("urgency_threshold", existing.get("urgency_threshold", 75)))
    poll = int(data.get("poll_interval_minutes", existing.get("poll_interval_minutes", 10)))
    theme = data.get("theme_preference", existing.get("theme_preference", "dark"))
    email_rec = data.get("email_recipient", existing.get("email_recipient", "")).strip()
    email_en = 1 if str(data.get("email_enabled", existing.get("email_enabled"))).lower() in ["true", "1"] else 0

    cursor.execute("""
        UPDATE user_profiles
        SET telegram_bot_token = ?, telegram_chat_id = ?, telegram_enabled = ?,
            urgency_threshold = ?, poll_interval_minutes = ?, theme_preference = ?,
            email_recipient = ?, email_enabled = ?
        WHERE username = ?
    """, (tg_token, tg_chat, tg_en, urgency, poll, theme, email_rec, email_en, username.strip()))

    if username.strip().lower() in ["hossam", "admin"]:
        update_settings({
            "telegram_bot_token": tg_token,
            "telegram_chat_id": tg_chat,
            "telegram_enabled": "true" if tg_en else "false",
            "urgency_threshold": str(urgency),
            "poll_interval_minutes": str(poll)
        })

    conn.commit()
    conn.close()
    return get_user_profile(username, mask=True)

def get_stats(year=None, from_year=None, to_year=None):
    conn = get_connection()
    cursor = conn.cursor()

    time_clause, time_params = build_year_filter_clause(year, from_year, to_year)

    cursor.execute(f"SELECT COUNT(*) as total FROM articles WHERE 1=1 {time_clause}", time_params)
    total_articles = cursor.fetchone()["total"]

    cursor.execute(f"SELECT COUNT(*) as critical FROM articles WHERE urgency_level = 'CRITICAL' {time_clause}", time_params)
    critical_articles = cursor.fetchone()["critical"]

    cursor.execute(f"SELECT COUNT(*) as high FROM articles WHERE urgency_level = 'HIGH' {time_clause}", time_params)
    high_articles = cursor.fetchone()["high"]

    cursor.execute("SELECT COUNT(*) as total_nodes FROM graph_nodes")
    total_nodes = cursor.fetchone()["total_nodes"]

    cursor.execute("SELECT COUNT(*) as total_edges FROM graph_edges")
    total_edges = cursor.fetchone()["total_edges"]

    cursor.execute("SELECT COUNT(*) as alerts_sent FROM notifications WHERE status = 'sent'")
    alerts_sent = cursor.fetchone()["alerts_sent"]

    cursor.execute(f"SELECT country, COUNT(*) as count FROM articles WHERE 1=1 {time_clause} GROUP BY country ORDER BY count DESC", time_params)
    by_country = {r["country"]: r["count"] for r in cursor.fetchall()}

    cursor.execute(f"SELECT category, COUNT(*) as count FROM articles WHERE 1=1 {time_clause} GROUP BY category ORDER BY count DESC", time_params)
    by_category = {r["category"]: r["count"] for r in cursor.fetchall()}

    conn.close()
    return {
        "total_articles": total_articles,
        "critical_articles": critical_articles,
        "high_articles": high_articles,
        "total_nodes": total_nodes,
        "total_edges": total_edges,
        "alerts_sent": alerts_sent,
        "by_country": by_country,
        "by_category": by_category,
        "time_range": f"{from_year}-{to_year}" if from_year and to_year else (year or "All")
    }
