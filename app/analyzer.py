import re
import json

COUNTRY_PATTERNS = {
    "Iran": [
        r"\biran\b", r"\biranian\b", r"\btehran\b", r"\birgc\b", r"\bquds force\b",
        r"\bkhamenei\b", r"\bpezeshkian\b", r"\bnatanz\b", r"\bfordow\b", r"\bisfahan\b",
        r"\bshahed\b", r"\bfattah\b", r"\bpars\b"
    ],
    "Israel": [
        r"\bisrael\b", r"\bisraeli\b", r"\btel aviv\b", r"\bjerusalem\b", r"\bmossad\b",
        r"\bidf\b", r"\bshin bet\b", r"\bshabak\b", r"\bnetanyahu\b", r"\bair defense\b",
        r"\biron dome\b", r"\barrow-?3\b", r"\bdavid's sling\b", r"\bgaza\b", r"\bwest bank\b"
    ],
    "Egypt": [
        r"\begypt\b", r"\begyptian\b", r"\bcairo\b", r"\bsisi\b", r"\bsinai\b",
        r"\bsuez\b", r"\brafah\b", r"\bphiladelphi\b", r"\bgis\b", r"\bmukhabarat\b",
        r"\bred sea border\b"
    ],
    "Germany": [
        r"\bgermany\b", r"\bgerman\b", r"\bberlin\b", r"\bbnd\b", r"\bbundeswehr\b",
        r"\bscholz\b", r"\bbaerbock\b", r"\brheinmetall\b", r"\biris-t\b"
    ]
}

CATEGORY_KEYWORDS = {
    "Nuclear": [
        "nuclear", "uranium", "centrifuge", "enrichment", "iaea", "natanz", "fordow",
        "dimona", "warhead", "fissile", "heavy water", "breakout capacity", "atomic"
    ],
    "Cyber": [
        "cyber", "cyberattack", "hack", "hacker", "malware", "stuxnet", "unit 8200",
        "espionage group", "ddos", "ransomware", "telecom breach", "scada"
    ],
    "Intelligence": [
        "mossad", "irgc", "bnd", "intelligence", "spy", "spies", "espionage", "covert",
        "assassination", "assassinated", "informant", "agent", "sabotage", "infiltrat",
        "shin bet", "gis", "mukhabarat", "undercover", "covert operation"
    ],
    "Warfare": [
        "strike", "airstrike", "missile", "rocket", "drone", "bomb", "killed", "clash",
        "artillery", "offensive", "battle", "casualt", "interception", "ballistic",
        "ground operation", "shelling", "uav", "hypersonic", "combat"
    ],
    "Arms": [
        "air defense", "iron dome", "arrow 3", "patriot", "iris-t", "weapons delivery",
        "arms export", "munition", "torpedo", "radar", "procurement", "shahed-136"
    ],
    "Diplomacy": [
        "ceasefire", "negotiation", "treaty", "sanctions", "summit", "envoy", "un security council",
        "hostage talks", "peace deal", "bilateral talks", "diplomat"
    ]
}

CRITICAL_TERMS = [
    ("breaking", 25),
    ("ballistic missile", 35),
    ("hypersonic", 35),
    ("assassinated", 40),
    ("assassination", 35),
    ("nuclear enrichment", 35),
    ("nuclear breakout", 40),
    ("airstrike kills", 35),
    ("red alert", 30),
    ("airspace closed", 35),
    ("war declared", 45),
    ("retaliatory barrage", 40),
    ("covert sabotage", 35),
    ("explosion rocks", 30),
    ("direct attack", 35),
    ("mobilization", 30),
    ("sinking", 30),
    ("casualty count", 25),
    ("state of emergency", 30),
    ("cyberattack cripples", 35),
    ("border breakthrough", 35)
]

HIGH_TERMS = [
    ("missile", 20),
    ("airstrike", 20),
    ("drone attack", 20),
    ("intercepted", 15),
    ("mossad", 20),
    ("irgc", 20),
    ("bnd", 15),
    ("gis", 15),
    ("clashes", 15),
    ("covert", 18),
    ("intel leak", 20),
    ("hostages", 18),
    ("weapons shipment", 18),
    ("escalation", 15),
    ("retaliation", 20),
    ("evacuation", 15),
    ("underground bunker", 20)
]

def analyze_article(title: str, description: str = "", source: str = "") -> dict:
    """Analyze article content, score urgency, detect entities, categories, and generate future forecast."""
    text = f"{title} {description}".lower()
    
    # 1. Detect Countries
    detected_countries = []
    for country, patterns in COUNTRY_PATTERNS.items():
        for pat in patterns:
            if re.search(pat, text, re.IGNORECASE):
                if country not in detected_countries:
                    detected_countries.append(country)
                break
                
    primary_country = detected_countries[0] if detected_countries else "Regional"
    if len(detected_countries) > 1:
        if "Iran" in detected_countries and "Israel" in detected_countries:
            primary_country = "Iran / Israel"
        elif "Egypt" in detected_countries and "Israel" in detected_countries:
            primary_country = "Egypt / Israel"
        elif "Germany" in detected_countries and ("Iran" in detected_countries or "Israel" in detected_countries):
            primary_country = "Germany / Middle East"

    # 2. Detect Category
    category_scores = {cat: 0 for cat in CATEGORY_KEYWORDS}
    for cat, keywords in CATEGORY_KEYWORDS.items():
        for kw in keywords:
            if kw in text:
                category_scores[cat] += 1
                
    best_cat = max(category_scores, key=category_scores.get)
    primary_category = best_cat if category_scores[best_cat] > 0 else "Warfare"

    # 3. Urgency & Severity Scoring
    score = 20  # baseline
    matched_reasons = []

    for term, weight in CRITICAL_TERMS:
        if term in text:
            score += weight
            matched_reasons.append(f"Critical term: '{term}' (+{weight})")

    for term, weight in HIGH_TERMS:
        if term in text:
            score += weight
            matched_reasons.append(f"Key indicator: '{term}' (+{weight})")

    # Multi-country confrontation multiplier
    if len(detected_countries) >= 2:
        score += 15
        matched_reasons.append("Multi-state escalation intersection (+15)")

    if "Iran" in detected_countries and "Israel" in detected_countries:
        score += 15
        matched_reasons.append("Direct Iran-Israel confrontation axis (+15)")

    if "Nuclear" in primary_category or "nuclear" in text:
        score += 15
        matched_reasons.append("Nuclear dimension alert (+15)")

    # Bound score between 10 and 100
    score = min(max(score, 10), 100)

    # Classify Urgency Level
    if score >= 75:
        urgency_level = "CRITICAL"
    elif score >= 55:
        urgency_level = "HIGH"
    elif score >= 35:
        urgency_level = "MEDIUM"
    else:
        urgency_level = "LOW"

    # 4. Extract Entities (Key actors, agencies, locations)
    entities = []
    entity_catalog = {
        "Mossad": ["mossad"],
        "IDF": ["idf", "israeli army", "israeli military"],
        "IRGC": ["irgc", "revolutionary guard", "quds force"],
        "Shin Bet": ["shin bet", "shabak"],
        "Egypt GIS": ["gis", "general intelligence service", "mukhabarat"],
        "Germany BND": ["bnd", "bundesnachrichtendienst"],
        "German Foreign Office": ["baerbock", "scholz", "berlin"],
        "AEOI Nuclear": ["natanz", "fordow", "atomic energy organization of iran", "enrichment"],
        "Hezbollah": ["hezbollah", "nasrallah"],
        "Houthis": ["houthi", "ansarallah", "red sea drone"],
        "Suez Canal / Sinai": ["suez canal", "sinai", "philadelphi corridor", "rafah crossing"]
    }
    for ent_name, aliases in entity_catalog.items():
        if any(alias in text for alias in aliases):
            entities.append(ent_name)

    # 5. Connect to Historical Precedents & Future Forecasts
    historical_link, future_projection = generate_causal_forecast(
        title, text, detected_countries, primary_category, entities, score
    )

    return {
        "country": primary_country,
        "category": primary_category,
        "urgency_score": score,
        "urgency_level": urgency_level,
        "entities": entities,
        "historical_link": historical_link,
        "future_projection": future_projection,
        "matched_reasons": matched_reasons
    }

def generate_causal_forecast(title, text, countries, category, entities, score):
    """Synthesize connection from past precedents to future projections."""
    historical_link = ""
    future_projection = ""

    # Nuclear & Preemptive Sabotage
    if "Nuclear" in category or "natanz" in text or "fordow" in text or "enrichment" in text:
        historical_link = "Tied to the Stuxnet / Operation Olympic Games sabotage precedent and 2024 Fordow centrifuge expansion."
        future_projection = "High likelihood of preemptive covert cyber/kinetic disruption against enrichment cascades; risk of immediate IAEA emergency session and reciprocal retaliatory missile alerts."

    # Direct Iran - Israel Clash
    elif ("Iran" in countries and "Israel" in countries) or ("irgc" in text and "idf" in text):
        historical_link = "Echoes the 2024 direct missile-and-drone retaliatory cycles (Operation True Promise vs IDF Days of Repentance)."
        future_projection = "Forecast indicates 72-hour window of proxy missile barrages, GPS jamming in Gulf/Levant, and targeted strikes against radar/air-defense installations."

    # Egypt / Border / Sinai / Suez
    elif "Egypt" in countries or "suez" in text or "sinai" in text or "rafah" in text:
        historical_link = "Rooted in the 1979 Camp David Security Annexes and subsequent Philadelphi Corridor border control protocols."
        future_projection = "Anticipate emergency Egyptian GIS mediation with Cairo security delegations, coupled with enhanced Egyptian 2nd & 3rd Field Army readiness along the eastern borders."

    # Germany / European Intelligence / Arms Exports
    elif "Germany" in countries or "bnd" in text or "berlin" in text:
        historical_link = "Follows historical German-Israeli strategic defense cooperation (Arrow-3 air defense procurement) and BND counter-proliferation interdictions."
        future_projection = "Expected tightening of dual-use European export controls on drone components; Berlin diplomatic pressure in Brussels for heightened IRGC sanctions."

    # Intelligence & Covert Ops
    elif "Intelligence" in category or "mossad" in text or "assassin" in text:
        historical_link = "Draws on legacy asymmetric intelligence warfare and covert asset recruitment within adversary security apparatuses."
        future_projection = "Heightened counter-espionage sweeps, security protocol overhauls for senior commanders, and asymmetric retaliatory plots in neutral third countries."

    # Default Tactical Warfare Forecast
    else:
        historical_link = "Linked to ongoing regional deterrence dynamics and localized attritional military engagements."
        future_projection = "Expect localized kinetic escalation, reinforcement of forward air defense batteries, and tactical surveillance drone sorties."

    return historical_link, future_projection
