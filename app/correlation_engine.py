import re
import json
import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger('sentinel.correlation')

# Threat Catalog of Darknet Cyber Actors, Pwn Forums & DLS Operators
THREAT_CATALOG = [
    {
        'id': 'tc_handala',
        'name': 'Handala Hack',
        'category': 'Pro-Iran / State-Aligned Cyber Warfare',
        'forum_source': 'Pwn Forum & Telegram Disclosures',
        'countries': ['Israel', 'Iran / Israel'],
        'sectors': ['Defense', 'Nuclear', 'Government'],
        'keywords': ['nuclear', 'dimona', 'soreq', 'scientist', 'defense ministry', 'mossad', 'missile', 'iron dome', 'arrow'],
        'sample_leak': {
            'target': 'Dimona Nuclear Auxiliary SCADA Logs & Contractor Vault',
            'threat_group': 'Handala Hack / Pwn Forum Syndicate',
            'sector': 'Energy / Nuclear',
            'country': 'Israel',
            'file_size_gb': 112.0,
            'urgency_score': 98,
            'evidence_url': 'http://pwnfrm7rbf6kyerigxi677lcz5ifmoagdbqqknwdu2by27wfdst5qmqd.onion/leak/dimona-scada',
            'summary': 'Retaliatory cyber strike disclosing cooling systems SCADA telemetry, vendor credentials, and engineering blueprints.'
        }
    },
    {
        'id': 'tc_cyber_av3ngers',
        'name': 'Cyber Av3ngers',
        'category': 'IRGC-Affiliated Kinetic Retaliation Unit',
        'forum_source': 'Dark Forums & Pwn Forum Repos',
        'countries': ['Israel', 'Iran / Israel'],
        'sectors': ['Energy', 'Logistics', 'Water'],
        'keywords': ['scada', 'water', 'plc', 'unitronics', 'train', 'railway', 'power grid', 'substation', 'israel electric'],
        'sample_leak': {
            'target': 'Israel Regional Water & Pumping Station PLC Logic',
            'threat_group': 'Cyber Av3ngers',
            'sector': 'Energy & SCADA',
            'country': 'Israel',
            'file_size_gb': 38.5,
            'urgency_score': 94,
            'evidence_url': 'http://darkforumy5xq7qrqqwezi3jc6oxpuucu4d5u76iixlaryroszuagwsad.onion/threads/israel-water-scada',
            'summary': 'Programmable Logic Controller (PLC) firmware dumps and remote telemetry endpoints compromised following border escalation.'
        }
    },
    {
        'id': 'tc_pwn_syndicate',
        'name': 'Pwn Forum Syndicate',
        'category': 'Underground Data Brokerage & Leak Syndicate',
        'forum_source': 'Pwn Forum (pwnfrm...onion)',
        'countries': ['Egypt', 'Germany', 'Israel'],
        'sectors': ['Telecom', 'Logistics', 'Finance'],
        'keywords': ['telecom', 'carrier', 'ims', 'volte', 'routing', 'cables', 'red sea', 'suez', 'port', 'frankfurt', 'cargo', 'manifest'],
        'sample_leak': {
            'target': 'Regional Cellular Core IMS/VoLTE Gateway',
            'threat_group': 'Pwn Forum Syndicate',
            'sector': 'Telecom',
            'country': 'Egypt',
            'file_size_gb': 68.0,
            'urgency_score': 93,
            'evidence_url': 'http://pwnfrm7rbf6kyerigxi677lcz5ifmoagdbqqknwdu2by27wfdst5qmqd.onion/leak/ims-gateway',
            'summary': 'Diameter routing configurations, subscriber core keys, and fiber interconnect maps dumped on Pwn Forum.'
        }
    },
    {
        'id': 'tc_dark_forums',
        'name': 'Dark Forums Exclusives',
        'category': 'High-Tier Blackhat & Exploitation Board',
        'forum_source': 'Dark Forums (darkforum...onion)',
        'countries': ['Egypt', 'Iran', 'Regional'],
        'sectors': ['Defense', 'Energy', 'Logistics'],
        'keywords': ['drone', 'uav', 'c2', 'ground station', 'radar', 'telemetry', 'rtsp', 'anti-piracy', 'red sea', 'sinai', 'substation'],
        'sample_leak': {
            'target': 'Cairo Defense Drone Telemetry & Tactical Ground Station Code',
            'threat_group': 'Dark Forums Exclusives',
            'sector': 'Defense',
            'country': 'Egypt',
            'file_size_gb': 64.0,
            'urgency_score': 95,
            'evidence_url': 'http://darkforumy5xq7qrqqwezi3jc6oxpuucu4d5u76iixlaryroszuagwsad.onion/threads/cairo-drone-c2',
            'summary': 'UAV C2 communication protocol specifications, encryption keys, and telemetry server logs leaked in VIP section.'
        }
    },
    {
        'id': 'tc_predatory_sparrow',
        'name': 'Predatory Sparrow (Gonjeshke Darande)',
        'category': 'Pro-Western / Anti-Regime Kinetic Cyber Actor',
        'forum_source': 'BreachForums & Darknet Mirrors',
        'countries': ['Iran', 'Iran / Israel'],
        'sectors': ['Energy', 'Finance', 'Logistics'],
        'keywords': ['iran', 'tehran', 'khuzestan', 'steel', 'gas station', 'fuel pump', 'railway', 'central bank', 'sanctions'],
        'sample_leak': {
            'target': 'Heavy Industrial & SCADA Automation Network',
            'threat_group': 'Predatory Sparrow Ops',
            'sector': 'Energy',
            'country': 'Iran',
            'file_size_gb': 82.0,
            'urgency_score': 90,
            'evidence_url': 'http://darkfoxaqhfpxkrbt7vxns2z2u2k72sgmqbzeorupaiottw3ecm2wgyd.onion',
            'summary': 'Siemens S7-1500 PLC project archives, turbine telemetry dumps, and facility internal network topology.'
        }
    },
    {
        'id': 'tc_lockbit_hub',
        'name': 'LockBit 3.0 / RansomHub Enterprise',
        'category': 'Global Ransomware DLS Operator',
        'forum_source': 'Ransomware Data Leak Site',
        'countries': ['Egypt', 'Germany', 'Israel'],
        'sectors': ['Energy', 'Logistics', 'Finance'],
        'keywords': ['water authority', 'gas processing', 'pipeline', 'container crane', 'hamburg', 'cairo', 'rig', 'mediterranean'],
        'sample_leak': {
            'target': 'Mediterranean Offshore Gas Processing Platform',
            'threat_group': 'RansomHub DLS',
            'sector': 'Energy',
            'country': 'Egypt',
            'file_size_gb': 145.0,
            'urgency_score': 94,
            'evidence_url': 'http://ransomhub734kldm24lkjdf092348skjdfy234lkjsdf092348skjdfad.onion',
            'summary': 'Offshore rig telemetry, SCADA safety interlock logic, pipeline pressure monitoring logs, and employee credentials.'
        }
    }
]

def correlate_article_with_threats(article: Dict[str, Any]) -> Dict[str, Any]:
    """Cross-correlate a geopolitical/military article with darknet threat actors and breach forums."""
    title = (article.get('title') or '').lower()
    desc = (article.get('description') or '').lower()
    country = article.get('country') or 'Regional'
    category = article.get('category') or 'Warfare'
    raw_entities = article.get('entities') or []
    if isinstance(raw_entities, str):
        try:
            entities = json.loads(raw_entities)
        except Exception:
            entities = []
    else:
        entities = raw_entities

    full_text = f"{title} {desc} {' '.join(entities).lower()}"

    matches = []
    for threat in THREAT_CATALOG:
        match_score = 0
        reasons = []

        # Country / Axis matching
        if any(c in country for c in threat['countries']) or country in threat['countries'] or 'Regional' in threat['countries']:
            match_score += 35
            reasons.append(f"Theatre alignment: {country}")

        # Category / Sector matching
        if category in threat['sectors'] or any(s.lower() in full_text for s in threat['sectors']):
            match_score += 25
            reasons.append(f"Sector vulnerability: {threat['sectors']}")

        # Keyword matching
        matched_kws = [kw for kw in threat['keywords'] if kw in full_text]
        if matched_kws:
            match_score += min(40, len(matched_kws) * 15)
            reasons.append(f"Signatures detected: {', '.join(matched_kws[:3]).upper()}")

        if match_score >= 50:
            leak_info = threat['sample_leak']
            matches.append({
                'threat_id': threat['id'],
                'threat_name': threat['name'],
                'threat_category': threat['category'],
                'forum_source': threat['forum_source'],
                'correlation_score': min(98, match_score),
                'reasons': reasons,
                'correlated_leak': leak_info,
                'nexus_type': 'Kinetic Action ➔ Retaliatory Cyber Leak' if 'Warfare' in category else 'Targeted Cyber Espionage Disclosure'
            })

    matches.sort(key=lambda x: x['correlation_score'], reverse=True)

    return {
        'article_id': article.get('id'),
        'article_title': article.get('title'),
        'article_country': country,
        'has_correlations': len(matches) > 0,
        'correlations_count': len(matches),
        'top_threat_actor': matches[0]['threat_name'] if matches else None,
        'top_forum_source': matches[0]['forum_source'] if matches else None,
        'top_correlation_score': matches[0]['correlation_score'] if matches else 0,
        'matches': matches[:3]
    }

def get_all_correlations(articles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Analyze a batch of articles and return high-confidence cyber-kinetic threat correlations."""
    results = []
    for art in articles:
        corr = correlate_article_with_threats(art)
        if corr['has_correlations']:
            results.append(corr)
    results.sort(key=lambda x: x['top_correlation_score'], reverse=True)
    return results
