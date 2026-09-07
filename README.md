---
title: Middle East Intel Sentinel
emoji: 🛡️
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
---

# 🛡️ Middle East Intelligence Sentinel (OSINT & Threat Forecast Network)

[![Python 3.11+](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg)](https://fastapi.tiangolo.com/)
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Hossam77i/mideast-intel-sentinel)

**Middle East Intelligence Sentinel** is an automated, lifetime threat intelligence tracking, analysis, and forecasting platform. It focuses specifically on military developments, wars, covert actions, and intelligence operations involving:
- 🇮🇷 **Iran** (IRGC, Quds Force, nuclear centrifuges, ballistic & drone arsenals, proxy coordination)
- 🇮🇱 **Israel** (IDF, Mossad, Shin Bet, multi-tier air defense, precision strikes)
- 🇪🇬 **Egypt** (GIS Mukhabarat, Sinai & Rafah border security, Suez Canal & Red Sea maritime routes)
- 🇩🇪 **Germany** (BND foreign intelligence, EU sanctions enforcement, Red Sea Aspides naval missions, Arrow-3 strategic defense ties)

---

## 🌟 Key Features

1. **Multi-Source Real-Time Ingestion Engine**:
   - Automated continuous polling across tailored Google News intelligence queries, BBC World Middle East, Deutsche Welle (DW), France24, and optional NewsAPI.org.
   - SHA-256 content deduplication preventing repeated alerts.

2. **Automated Intelligence & Urgency Scoring Engine**:
   - Classifies articles into **Kinetic Warfare**, **Intelligence / Espionage**, **Nuclear & Proliferation**, **Cyber & Electronic Warfare**, **Arms & Air Defense**, and **Diplomacy**.
   - Calculates **Urgency Score (0 - 100)** based on kinetic terminology, high-value target assassinations, missile strikes, and multi-state escalation axes.
   - Triggers `CRITICAL FLASH` alerts for severe developments.

3. **Instant Mobile Phone Notifications (Lifetime 24/7)**:
   - **Telegram Bot**: Direct push notifications formatted with priority badges, actor identification, intelligence summaries, historical precedents, future threat forecasts, and source links.
   - **Email / SMTP**: HTML intelligence alerts for desktop and phone email clients.
   - Built-in test dispatcher to verify delivery on your phone with a single click.

4. **Interactive Knowledge Graph & Future Forecast Network**:
   - High-performance force-directed graph (Vis.js Network) that visually maps:
     - 🏛️ **Past Precedents**: Historical foundational events (Stuxnet, 2024 direct missile barrages, Camp David accords, BND counter-proliferation).
     - 🎯 **State Entities & Intelligence Agencies**: Mossad, IRGC, Egypt GIS, Germany BND, IDF.
     - ⚡ **Current Breaking Incidents**: Live nodes colored by urgency.
     - 🔮 **Future Strategic Projections ("Future News")**: Dynamically forecasted downstream threats and risks.
   - Interactive node inspector showing causal antecedents and projected cascades.

5. **24/7 Background Lifetime Daemon**:
   - Runs continuously in the background.
   - Configurable polling intervals (2 min flash, 5 min rapid, 10 min balanced).
   - Includes a one-step `systemd` service installer (`scripts/install_service.sh`) for permanent lifetime operation across reboots.

---

## 🚀 Quick Start Guide

### 1. Launch the Server

```bash
cd /home/aclies/Projects/mideast-intel-sentinel
./scripts/start.sh
```
The web dashboard will be available at: **`http://localhost:8000`**

### 2. Configure Telegram Phone Notifications

1. Open Telegram on your phone and search for **`@BotFather`**.
2. Send `/newbot`, choose a name and username, and copy the **HTTP API Bot Token** (e.g. `123456789:AAHk...`).
3. Search for **`@userinfobot`** on Telegram and click `Start` to see your numerical **Chat ID** (e.g. `987654321`).
4. In the Sentinel Dashboard under **"Phone Alerts & System Setup"**:
   - Check **Enable Telegram Alerts**.
   - Paste your **Bot Token** and **Chat ID**.
   - Click **Send Test to My Phone** to verify.

### 3. Install 24/7 Lifetime System Service

To keep Sentinel monitoring and sending phone alerts 24/7 continuously without keeping a terminal open:

```bash
sudo ./scripts/install_service.sh
```

To manage the service:
```bash
sudo systemctl status mideast-sentinel
sudo systemctl restart mideast-sentinel
sudo systemctl stop mideast-sentinel
```

---

## 💻 CLI Commands

You can also operate Sentinel directly from the terminal:

```bash
# Display intelligence metrics & breakdown
python3 scripts/cli.py stats

# Run immediate feed scan & dispatch critical alerts
python3 scripts/cli.py scan

# Show latest dispatches
python3 scripts/cli.py latest --limit 5

# Show only critical flash alerts
python3 scripts/cli.py latest --critical

# View predictive causal chains (Past -> Present -> Future)
python3 scripts/cli.py forecasts

# Send test notification to your phone
python3 scripts/test_telegram.py
```

---

## 🏗️ Architecture Directory Structure

```
/home/aclies/Projects/mideast-intel-sentinel/
├── app/
│   ├── __init__.py
│   ├── database.py       # SQLite schema, baseline historical seeding, CRUD
│   ├── analyzer.py       # Geopolitical NLP, urgency scoring, causal forecasting
│   ├── collector.py      # Multi-feed RSS, Google News, DW, BBC, NewsAPI
│   ├── notifier.py       # Telegram Bot API & SMTP email dispatchers
│   ├── graph_engine.py   # Vis.js network data generator & causal chain synthesis
│   ├── daemon.py         # 24/7 background scheduler & polling thread
│   └── main.py           # FastAPI server, REST API endpoints, static file mount
├── data/
│   └── sentinel.db       # SQLite database (articles, graph, alerts, settings)
├── scripts/
│   ├── start.sh          # One-click start script
│   ├── install_service.sh# Systemd service installer for lifetime 24/7 operation
│   ├── test_telegram.py  # Telegram notification tester
│   └── cli.py            # Terminal management CLI
├── static/
│   ├── index.html        # Modern Dark-Mode Command Center UI
│   ├── styles.css        # OSINT Threat Operations theme
│   ├── app.js            # Vis.js network controller, real-time feed manager
│   └── vis-network.min.js# Offline independent interactive graph engine
├── requirements.txt
└── README.md
```
