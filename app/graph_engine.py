import json
import networkx as nx
from .database import get_connection

NODE_COLORS = {
    "past": {"background": "#6366f1", "border": "#4f46e5", "highlight": "#818cf8"},
    "entity": {"background": "#0ea5e9", "border": "#0284c7", "highlight": "#38bdf8"},
    "future": {"background": "#eab308", "border": "#ca8a04", "highlight": "#fde047"},
    "current_critical": {"background": "#f87171", "border": "#ef4444", "highlight": "#fca5a5"},
    "current_high": {"background": "#fbbf24", "border": "#f59e0b", "highlight": "#fde68a"},
    "current_medium": {"background": "#38bdf8", "border": "#0284c7", "highlight": "#7dd3fc"},
    "current_low": {"background": "#64748b", "border": "#475569", "highlight": "#94a3b8"}
}

def get_graph_data(country_filter=None, type_filter=None, year_filter=None, from_year=None, to_year=None):
    """Retrieve graph nodes and edges with flexible year range and filters."""
    conn = get_connection()
    cursor = conn.cursor()

    node_query = "SELECT * FROM graph_nodes WHERE 1=1"
    params = []
    
    if country_filter and country_filter != "All":
        node_query += " AND (country LIKE ? OR country = 'Regional')"
        params.append(f"%{country_filter}%")
    if type_filter and type_filter != "All":
        node_query += " AND node_type = ?"
        params.append(type_filter)

    # Year range filtering
    if from_year and to_year and from_year != "All" and to_year != "All":
        node_query += " AND (node_type = 'entity' OR (substr(timestamp, 1, 4) >= ? AND substr(timestamp, 1, 4) <= ?))"
        params.extend([str(from_year).strip(), str(to_year).strip()])
    elif year_filter and year_filter != "All":
        node_query += " AND (node_type = 'entity' OR timestamp LIKE ? OR metadata LIKE ?)"
        params.extend([f"%{year_filter}%", f"%{year_filter}%"])

    cursor.execute(node_query, params)
    raw_nodes = cursor.fetchall()
    valid_node_ids = set()

    nodes = []
    for r in raw_nodes:
        nid = r["node_id"]
        valid_node_ids.add(nid)
        ntype = r["node_type"]
        urgency = r["urgency_level"] or "MEDIUM"

        if ntype == "past":
            color = NODE_COLORS["past"]
            shape = "diamond"
            size = 24
        elif ntype == "future":
            color = NODE_COLORS["future"]
            shape = "star"
            size = 26
        elif ntype == "entity":
            color = NODE_COLORS["entity"]
            shape = "hexagon"
            size = 30
        else:
            shape = "dot"
            if urgency == "CRITICAL":
                color = NODE_COLORS["current_critical"]
                size = 28
            elif urgency == "HIGH":
                color = NODE_COLORS["current_high"]
                size = 22
            else:
                color = NODE_COLORS["current_medium"]
                size = 18

        meta = {}
        try:
            meta = json.loads(r["metadata"] or "{}")
        except Exception:
            pass

        nodes.append({
            "id": nid,
            "label": r["label"],
            "title": f"<b>[{ntype.upper()}] {r['label']}</b><br/>Axis: {r['country']}<br/>Year: {r['timestamp']}<br/>{r['details']}",
            "group": ntype,
            "country": r["country"],
            "category": r["category"],
            "details": r["details"],
            "urgency": urgency,
            "timestamp": r["timestamp"],
            "color": color,
            "shape": shape,
            "size": size,
            "metadata": meta
        })

    cursor.execute("SELECT * FROM graph_edges")
    raw_edges = cursor.fetchall()
    edges = []

    for e in raw_edges:
        src = e["source_node"]
        tgt = e["target_node"]
        if src in valid_node_ids and tgt in valid_node_ids:
            rel = e["relation"]
            is_forecast = "PROJECT" in rel or "FUTURE" in rel or rel == "PROJECTS_RISK_OF"
            edges.append({
                "from": src,
                "to": tgt,
                "label": rel.replace("_", " "),
                "arrows": "to",
                "color": {"color": "#ca8a04" if is_forecast else "#64748b", "opacity": 0.7},
                "dashes": True if is_forecast else False,
                "width": 1.5,
                "font": {"size": 9, "color": "#94a3b8", "align": "middle"}
            })

    conn.close()
    return {"nodes": nodes, "edges": edges}

def extract_causal_chains(year_filter=None, from_year=None, to_year=None):
    """Extract 3-step predictive chains linking past to future, filtered by year range."""
    conn = get_connection()
    cursor = conn.cursor()

    query = """
        SELECT 
            p.label as past_label, p.details as past_details, p.timestamp as past_time,
            c.label as current_label, c.details as current_details, c.country as current_country, c.urgency_level as current_urgency,
            f.label as future_label, f.details as future_details, f.urgency_level as future_urgency
        FROM graph_edges e1
        JOIN graph_nodes p ON e1.source_node = p.node_id AND p.node_type = 'past'
        JOIN graph_nodes c ON e1.target_node = c.node_id AND c.node_type = 'current'
        JOIN graph_edges e2 ON c.node_id = e2.source_node
        JOIN graph_nodes f ON e2.target_node = f.node_id AND f.node_type = 'future'
    """
    params = []
    if from_year and to_year and from_year != "All" and to_year != "All":
        query += " WHERE (substr(p.timestamp, 1, 4) >= ? AND substr(p.timestamp, 1, 4) <= ?) OR (substr(c.timestamp, 1, 4) >= ? AND substr(c.timestamp, 1, 4) <= ?)"
        params.extend([str(from_year).strip(), str(to_year).strip(), str(from_year).strip(), str(to_year).strip()])
    elif year_filter and year_filter != "All":
        query += " WHERE (p.timestamp LIKE ? OR c.timestamp LIKE ?)"
        params.extend([f"%{year_filter}%", f"%{year_filter}%"])

    query += " LIMIT 25"
    cursor.execute(query, params)
    chains = [dict(r) for r in cursor.fetchall()]

    if not chains:
        art_query = """
            SELECT 
                a.id, a.title, a.description, a.country, a.category, 
                a.urgency_level, a.urgency_score, a.historical_link, a.future_projection, a.published_at
            FROM articles a
            WHERE a.urgency_score >= 50 AND a.future_projection != ''
        """
        art_params = []
        if from_year and to_year and from_year != "All" and to_year != "All":
            art_query += " AND substr(a.published_at, 1, 4) >= ? AND substr(a.published_at, 1, 4) <= ?"
            art_params.extend([str(from_year).strip(), str(to_year).strip()])
        elif year_filter and year_filter != "All":
            art_query += " AND a.published_at LIKE ?"
            art_params.append(f"{year_filter}%")
        
        art_query += " ORDER BY a.urgency_score DESC LIMIT 15"
        cursor.execute(art_query, art_params)
        for a in cursor.fetchall():
            pub_year = (a["published_at"] or "")[:4] or "Historical"
            chains.append({
                "past_label": f"Historical Precedent ({pub_year})",
                "past_details": a["historical_link"] or "Foundational deterrence posture.",
                "past_time": pub_year,
                "current_label": a["title"][:75] + ("..." if len(a["title"]) > 75 else ""),
                "current_details": a["description"],
                "current_country": a["country"],
                "current_urgency": a["urgency_level"],
                "future_label": "STRATEGIC PROJECTION",
                "future_details": a["future_projection"],
                "future_urgency": a["urgency_level"]
            })

    conn.close()
    return chains

def analyze_network_centrality():
    """Calculate threat centrality."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT source_node, target_node FROM graph_edges")
    edges = cursor.fetchall()
    conn.close()

    G = nx.DiGraph()
    for e in edges:
        G.add_edge(e["source_node"], e["target_node"])

    if len(G.nodes) == 0:
        return {}

    deg_centrality = nx.degree_centrality(G)
    sorted_nodes = sorted(deg_centrality.items(), key=lambda x: x[1], reverse=True)[:8]

    return [{"node_id": k, "centrality_score": round(v * 100, 1)} for k, v in sorted_nodes]
