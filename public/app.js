// --- LIVE BACKEND RESOLUTION & MULTI-TUNNEL AUTO-DISCOVERY ---
const APP_NAME = "mideast";
const STORAGE_BACKEND_KEY = "mideast_sentinel_backend_url";
localStorage.removeItem("sentinel_backend_url");

const KNOWN_BACKENDS = [
  "https://rhode-mono-sally-angle.trycloudflare.com",
  "https://cordless-display-dressing-bookmarks.trycloudflare.com"
];

let API_BASE = "";
if (window.location.hostname.includes("github.io")) {
  API_BASE = localStorage.getItem(STORAGE_BACKEND_KEY) || KNOWN_BACKENDS[0];
}

async function apiFetch(url, options = {}) {
  const fullUrl = (API_BASE && url.startsWith("/")) ? (API_BASE + url) : url;
  try {
    const res = await fetch(fullUrl, options);
    if (res.ok) {
      updateBackendPill(true);
      return res;
    }
    if (window.location.hostname.includes("github.io") && [502, 503, 504, 530].includes(res.status)) {
      for (const fallback of KNOWN_BACKENDS) {
        if (fallback !== API_BASE) {
          try {
            const fbRes = await fetch(fallback + url, options);
            if (fbRes.ok) {
              API_BASE = fallback;
              localStorage.setItem(STORAGE_BACKEND_KEY, fallback);
              updateBackendPill(true);
              return fbRes;
            }
          } catch (e) {}
        }
      }
    }
    return res;
  } catch (err) {
    if (window.location.hostname.includes("github.io")) {
      for (const fallback of KNOWN_BACKENDS) {
        if (fallback !== API_BASE) {
          try {
            const fbRes = await fetch(fallback + url, options);
            if (fbRes.ok) {
              API_BASE = fallback;
              localStorage.setItem(STORAGE_BACKEND_KEY, fallback);
              updateBackendPill(true);
              return fbRes;
            }
          } catch (e) {}
        }
      }
    }
    updateBackendPill(false, err.message);
    throw err;
  }
}

function updateBackendPill(isOnline, detail = "") {
  const dot = document.getElementById("backendPillDot");
  const text = document.getElementById("backendPillText");
  const pill = document.getElementById("backendPill");
  if (!pill) return;
  if (isOnline) {
    if (dot) { dot.className = "pulse-dot green"; }
    if (text) {
      const host = API_BASE ? new URL(API_BASE).hostname.replace(".trycloudflare.com", "") : "Local";
      text.textContent = `Backend: ${host}`;
    }
  } else {
    if (dot) { dot.className = "pulse-dot offline"; }
    if (text) { text.textContent = "Backend: Offline"; }
  }
}

window.openBackendModal = function() {
  const modal = document.getElementById("backendModal");
  const input = document.getElementById("backendUrlInput");
  const res = document.getElementById("backendPingResult");
  if (modal) modal.classList.remove("hidden");
  if (input) input.value = API_BASE || KNOWN_BACKENDS[0];
  if (res) res.textContent = "";
};

window.closeBackendModal = function() {
  const modal = document.getElementById("backendModal");
  if (modal) modal.classList.add("hidden");
};

window.resetBackendDefault = function() {
  const input = document.getElementById("backendUrlInput");
  if (input) input.value = KNOWN_BACKENDS[0];
};

window.testAndSaveBackend = async function() {
  const input = document.getElementById("backendUrlInput");
  const res = document.getElementById("backendPingResult");
  const url = input ? input.value.trim().replace(/\/$/, "") : "";
  if (!url) {
    if (res) { res.textContent = "❌ Please enter a valid URL."; res.style.color = "var(--accent-red)"; }
    return;
  }
  if (res) { res.textContent = "⏳ Testing connection..."; res.style.color = "var(--accent-blue)"; }
  try {
    const testRes = await fetch(url + "/api/public-url", { method: "GET" });
    if (testRes.ok) {
      API_BASE = url;
      localStorage.setItem(STORAGE_BACKEND_KEY, url);
      updateBackendPill(true);
      if (res) { res.textContent = "✅ Connected successfully! Reloading..."; res.style.color = "var(--accent-green)"; }
      setTimeout(() => {
        window.closeBackendModal();
        window.location.reload();
      }, 1000);
    } else {
      if (res) { res.textContent = `⚠️ Server returned status ${testRes.status}. Saved anyway.`; res.style.color = "var(--accent-yellow)"; }
      API_BASE = url;
      localStorage.setItem(STORAGE_BACKEND_KEY, url);
      updateBackendPill(false);
    }
  } catch (err) {
    if (res) { res.textContent = `❌ Connection failed: ${err.message}`; res.style.color = "var(--accent-red)"; }
  }
};
// --- END CONNECTOR ---

/* ==========================================================================
   SENTINEL OSINT INTELLIGENCE // COMPREHENSIVE CONTROLLER
   ========================================================================== */

let networkInstance = null;
let graphNodesDataSet = null;
let graphEdgesDataSet = null;
let isPhysicsEnabled = true;

// Pagination and Sorting State
let currentOffset = 0;
let currentLimit = 30;
let totalArticlesCount = 0;
let hasMoreArticles = false;
let currentOrderBy = "time_desc";

// Time and User State
let currentYear = "2026";
let customFromYear = null;
let customToYear = null;
let currentUser = localStorage.getItem("sentinel_username") || "Hossam";
let currentTheme = localStorage.getItem("sentinel_theme") || "dark";
let publicShareUrl = "";

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initUser();
  initStats();
  loadPublicUrl();
  resetAndReloadArticles();
  loadSettings();
  loadNotifications();

  setInterval(() => {
    initStats();
  }, 30000);
});

/* ==========================================================================
   THEME TOGGLE (DARK / LIGHT)
   ========================================================================== */
function initTheme() {
  document.documentElement.setAttribute("data-theme", currentTheme);
  updateThemeButtonUI();
}

function toggleTheme() {
  currentTheme = currentTheme === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", currentTheme);
  localStorage.setItem("sentinel_theme", currentTheme);
  updateThemeButtonUI();

  if (networkInstance) {
    refreshGraph();
  }
}

function updateThemeButtonUI() {
  const icon = document.getElementById("theme-icon");
  const text = document.getElementById("theme-text");
  if (icon && text) {
    if (currentTheme === "dark") {
      icon.innerText = "☀️";
      text.innerText = "Light";
    } else {
      icon.innerText = "🌙";
      text.innerText = "Dark";
    }
  }
}

/* ==========================================================================
   CREDENTIAL MASKING & SECURITY
   ========================================================================== */
function toggleTokenVisibility(inputId, btn) {
  const el = document.getElementById(inputId);
  if (!el) return;
  if (el.type === "password") {
    el.type = "text";
    btn.innerText = "🔒 Hide";
  } else {
    el.type = "password";
    btn.innerText = "👁️ Show";
  }
}

/* ==========================================================================
   USER PROFILES (ISOLATED SETTINGS)
   ========================================================================== */
function initUser() {
  const headerName = document.getElementById("header-username");
  const settingsLabel = document.getElementById("settings-username-label");
  if (headerName) headerName.innerText = currentUser;
  if (settingsLabel) settingsLabel.innerText = currentUser;
}

function openProfileModal() {
  document.getElementById("input-profile-username").value = currentUser;
  document.getElementById("profile-modal").classList.remove("hidden");
}

function closeProfileModal() {
  document.getElementById("profile-modal").classList.add("hidden");
}

function confirmUserProfile() {
  const input = document.getElementById("input-profile-username").value.trim();
  if (input) {
    currentUser = input;
    localStorage.setItem("sentinel_username", currentUser);
    initUser();
    closeProfileModal();
    loadSettings();
    alert(`Switched to profile: "${currentUser}".\nYour alert tokens and threshold settings are completely isolated.`);
  }
}

/* ==========================================================================
   PUBLIC URL SHARING
   ========================================================================== */
async function loadPublicUrl() {
  try {
    const res = await apiFetch("/api/public-url");
    const data = await res.json();
    if (data.public_url) {
      publicShareUrl = data.public_url;
      const linkEl = document.getElementById("public-link-url");
      const container = document.getElementById("public-link-container");
      const shareInput = document.getElementById("share-link-input");

      if (linkEl && container) {
        linkEl.href = publicShareUrl;
        linkEl.innerText = publicShareUrl;
        container.classList.remove("hidden");
      }
      if (shareInput) {
        shareInput.value = publicShareUrl;
      }
    }

    const isRemote = !["localhost", "127.0.0.1"].includes(window.location.hostname);
    const darkwebBtn = document.getElementById("darkweb-sentinel-link");
    if (darkwebBtn) {
      if (data && data.darkweb_url) {
        darkwebBtn.href = data.darkweb_url;
        darkwebBtn.title = `Switch to Egypt Black Wolf Darknet Sentinel (${data.darkweb_url})`;
      } else if (isRemote) {
        darkwebBtn.href = "https://darkweb-sentinel.vercel.app";
        darkwebBtn.title = "Switch to Egypt Black Wolf Darknet Sentinel";
      } else {
        darkwebBtn.href = "http://localhost:8080";
        darkwebBtn.title = "Switch to Egypt Black Wolf Darknet Sentinel (http://localhost:8080)";
      }
    }
  } catch (err) {
    console.error("Could not fetch public URL:", err);
  }
}

function copyPublicLink() {
  const url = publicShareUrl || window.location.origin;
  navigator.clipboard.writeText(url).then(() => {
    alert("📋 Shareable link copied to clipboard!\n" + url + "\n\nFriends can view the dashboard with zero installation.");
  }).catch(() => {
    prompt("Copy this link to share with friends:", url);
  });
}

/* ==========================================================================
   GLOBAL TIME RANGE & SORTING (INTERCONNECTED)
   ========================================================================== */
function handleTimeModeChange() {
  const mode = document.getElementById("filter-year-mode").value;
  const customContainer = document.getElementById("custom-range-container");
  const banner = document.getElementById("active-time-banner");
  const bannerText = document.getElementById("banner-year-text");

  if (mode === "custom") {
    customContainer.classList.remove("hidden");
    return; // Wait for applyCustomRange()
  } else {
    customContainer.classList.add("hidden");
    customFromYear = null;
    customToYear = null;
    currentYear = mode;

    if (currentYear !== "2026" && currentYear !== "All") {
      banner.classList.remove("hidden");
      bannerText.innerText = `Year ${currentYear}`;
    } else if (currentYear === "All") {
      banner.classList.remove("hidden");
      bannerText.innerText = "All Archives (2022 - Present)";
    } else {
      banner.classList.add("hidden");
    }

    applyFiltersInterconnected();
  }
}

function applyCustomRange() {
  const fromY = document.getElementById("input-from-year").value.trim();
  const toY = document.getElementById("input-to-year").value.trim();

  if (!fromY || !toY) {
    alert("Please provide both From Year and To Year (e.g. 2020 to 2024).");
    return;
  }

  customFromYear = fromY;
  customToYear = toY;
  currentYear = "custom";

  const banner = document.getElementById("active-time-banner");
  const bannerText = document.getElementById("banner-year-text");
  banner.classList.remove("hidden");
  bannerText.innerText = `Range: ${customFromYear} to ${customToYear}`;

  applyFiltersInterconnected();
}

function resetToLiveTime() {
  document.getElementById("filter-year-mode").value = "2026";
  document.getElementById("custom-range-container").classList.add("hidden");
  customFromYear = null;
  customToYear = null;
  currentYear = "2026";
  document.getElementById("active-time-banner").classList.add("hidden");
  applyFiltersInterconnected();
}

function handleSortChange() {
  currentOrderBy = document.getElementById("filter-order-by").value;
  resetAndReloadArticles();
}

function applyFiltersInterconnected() {
  resetAndReloadArticles();
  initStats();
  if (networkInstance) {
    refreshGraph();
  }
  loadCausalChains();
  updateOsintSearchLinks();
}

function updateOsintSearchLinks() {
  const query = document.getElementById("filter-search").value.trim() || "middle east military intelligence";
  let dateOperator = "";
  if (customFromYear && customToYear) {
    dateOperator = ` after:${customFromYear}-01-01 before:${customToYear}-12-31`;
  } else if (currentYear !== "All" && currentYear !== "2026") {
    dateOperator = ` after:${currentYear}-01-01 before:${currentYear}-12-31`;
  }

  const googleLink = document.getElementById("osint-google");
  if (googleLink) {
    googleLink.href = `https://news.google.com/search?q=${encodeURIComponent(query + dateOperator)}&hl=en-US&gl=US&ceid=US:en`;
  }
}

async function fetchHistoricalArchives() {
  const targetYear = (customFromYear && customToYear) ? `${customFromYear}-${customToYear}` : (currentYear === "All" ? "2022" : currentYear);
  const customQuery = document.getElementById("filter-search").value.trim();
  const btn = event.currentTarget;
  const origText = btn.innerHTML;
  btn.innerHTML = `<span>⏳</span> Querying Archives...`;
  btn.disabled = true;

  try {
    const payload = {
      query: customQuery,
      year: currentYear !== "custom" ? currentYear : null,
      from_year: customFromYear,
      to_year: customToYear
    };
    const res = await apiFetch("/api/collect-historical", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    alert(`📜 Archive Query Complete!\n• Ingested & indexed into graph: ${data.ingested} historical articles`);
    resetAndReloadArticles();
    initStats();
    if (networkInstance) refreshGraph();
  } catch (err) {
    alert("Historical archive query error: " + err.message);
  } finally {
    btn.innerHTML = origText;
    btn.disabled = false;
  }
}

/* ==========================================================================
   TAB NAVIGATION
   ========================================================================== */
function switchTab(tabId) {
  document.querySelectorAll(".nav-tab").forEach(tab => {
    tab.classList.toggle("active", tab.getAttribute("data-tab") === tabId);
  });
  document.querySelectorAll(".tab-pane").forEach(pane => {
    pane.classList.toggle("active", pane.id === tabId);
  });

  if (tabId === "tab-graph") {
    setTimeout(() => {
      if (!networkInstance) {
        initGraph();
      } else {
        networkInstance.fit();
      }
    }, 120);
  } else if (tabId === "tab-forecasts") {
    loadCausalChains();
  } else if (tabId === "tab-settings") {
    loadSettings();
    loadNotifications();
    loadPublicUrl();
  }
}

function filterByCountryDossier(country) {
  const select = document.getElementById("filter-country");
  if (select) {
    select.value = country;
  }
  switchTab("tab-feed");
  resetAndReloadArticles();
}

/* ==========================================================================
   STATS & INGESTION
   ========================================================================== */
async function initStats() {
  try {
    const params = new URLSearchParams();
    if (customFromYear && customToYear) {
      params.append("from_year", customFromYear);
      params.append("to_year", customToYear);
    } else if (currentYear !== "All") {
      params.append("year", currentYear);
    }

    const res = await apiFetch(`/api/stats?${params.toString()}`);
    const data = await res.json();

    const bannerCount = document.getElementById("banner-count-text");
    if (bannerCount) {
      bannerCount.innerText = `(${data.total_articles} records found)`;
    }
  } catch (err) {
    console.error("Failed to load stats:", err);
  }
}

async function triggerIngestion() {
  const btn = document.getElementById("btn-force-scan");
  const origText = btn.innerHTML;
  btn.innerHTML = `<span>⏳</span> Scanning...`;
  btn.disabled = true;

  try {
    const res = await apiFetch("/api/collect", { method: "POST" });
    const data = await res.json();
    initStats();
    resetAndReloadArticles();
    if (networkInstance) {
      refreshGraph();
    }
    alert(`🛰️ Scan Complete!\n• Ingested: ${data.ingestion.new_inserted} new dispatches\n• Critical Flash: ${data.ingestion.critical_count}\n• Dispatched Alerts: ${data.alerts.sent}`);
  } catch (err) {
    alert("Error during feed ingestion: " + err.message);
  } finally {
    btn.innerHTML = origText;
    btn.disabled = false;
  }
}

/* ==========================================================================
   TAB 1: LIVE FEED WITH PAGINATION & LOAD MORE PREVIOUS NEWS
   ========================================================================== */
function handleSearchKey(event) {
  if (event.key === "Enter") {
    resetAndReloadArticles();
    updateOsintSearchLinks();
  }
}

function resetAndReloadArticles() {
  currentOffset = 0;
  loadArticles(false);
}

function loadMoreArticles() {
  currentOffset += currentLimit;
  loadArticles(true);
}

async function loadArticles(append = false) {
  const container = document.getElementById("articles-container");
  const btnMore = document.getElementById("btn-load-more");
  const statusEl = document.getElementById("load-more-status");

  if (!append) {
    container.innerHTML = `<div class="loading-state text-slate-500 py-12 text-center col-span-full">Querying intelligence records...</div>`;
    btnMore.style.display = "none";
  } else {
    btnMore.innerHTML = `<span>⏳</span> Loading previous records...`;
    btnMore.disabled = true;
  }

  const country = document.getElementById("filter-country").value;
  const category = document.getElementById("filter-category").value;
  const urgency = document.getElementById("filter-urgency").value;
  const search = document.getElementById("filter-search").value.trim();

  const params = new URLSearchParams({
    limit: currentLimit,
    offset: currentOffset,
    order_by: currentOrderBy
  });

  if (country !== "All") params.append("country", country);
  if (category !== "All") params.append("category", category);
  if (urgency > 0) params.append("min_urgency", urgency);
  if (customFromYear && customToYear) {
    params.append("from_year", customFromYear);
    params.append("to_year", customToYear);
  } else if (currentYear !== "All") {
    params.append("year", currentYear);
  }
  if (search) params.append("search", search);

  try {
    const res = await apiFetch(`/api/articles?${params.toString()}`);
    const data = await res.json();
    const items = data.articles || [];
    totalArticlesCount = data.total || 0;
    hasMoreArticles = data.has_more || false;

    if (!append) {
      if (items.length === 0) {
        container.innerHTML = `
          <div class="text-center text-slate-500 py-16 col-span-full">
            <p class="text-base font-semibold">No intelligence records match the current criteria.</p>
            <p class="text-xs text-slate-400 mt-1">Try broadening your date range or click "Query Archive" to pull from global news wires.</p>
            <button class="btn btn-outline btn-xs mt-3" onclick="resetFilters()">Reset All Filters</button>
          </div>
        `;
        btnMore.style.display = "none";
        statusEl.innerText = "";
        return;
      }
      container.innerHTML = items.map(renderArticleCard).join("");
    } else {
      const fragment = document.createElement("div");
      fragment.innerHTML = items.map(renderArticleCard).join("");
      while (fragment.firstChild) {
        container.appendChild(fragment.firstChild);
      }
    }

    const currentDisplayed = currentOffset + items.length;
    statusEl.innerText = `Showing ${currentDisplayed} of ${totalArticlesCount} records`;

    if (hasMoreArticles) {
      btnMore.style.display = "inline-flex";
      btnMore.innerHTML = `<span>⬇️</span> Show Previous News (${totalArticlesCount - currentDisplayed} remaining)`;
      btnMore.disabled = false;
    } else {
      btnMore.style.display = "none";
      statusEl.innerText += " • All available historical records loaded.";
    }

  } catch (err) {
    if (!append) {
      container.innerHTML = `<div class="text-rose-400 text-center py-8 col-span-full">Failed to load records: ${err.message}</div>`;
    } else {
      alert("Failed to load previous news: " + err.message);
      btnMore.disabled = false;
    }
  }
}

function resetFilters() {
  document.getElementById("filter-country").value = "All";
  document.getElementById("filter-category").value = "All";
  document.getElementById("filter-urgency").value = "0";
  document.getElementById("filter-year-mode").value = "2026";
  document.getElementById("filter-order-by").value = "time_desc";
  document.getElementById("filter-search").value = "";
  currentOrderBy = "time_desc";
  resetToLiveTime();
}

function renderArticleCard(a) {
  const score = a.urgency_score || 0;
  let severityClass = "low";
  let badgeClass = "badge-low";
  let badgeLabel = `LOW (${score})`;

  if (score >= 75) {
    severityClass = "critical";
    badgeClass = "badge-critical";
    badgeLabel = `🔴 CRITICAL (${score})`;
  } else if (score >= 55) {
    severityClass = "high";
    badgeClass = "badge-high";
    badgeLabel = `⚡ HIGH (${score})`;
  } else if (score >= 35) {
    severityClass = "medium";
    badgeClass = "badge-medium";
    badgeLabel = `MEDIUM (${score})`;
  }

  let entities = [];
  try {
    entities = typeof a.entities === "string" ? JSON.parse(a.entities) : a.entities;
  } catch (e) {
    entities = [];
  }

  const entitiesHtml = (entities && entities.length > 0)
    ? `<div class="entities-row">${entities.map(e => `<span class="entity-tag">🎯 ${escapeHtml(e)}</span>`).join("")}</div>`
    : "";

  const historicalHtml = a.historical_link
    ? `<div class="callout-box historical">
         <div class="callout-title">🏛️ Historical Precedent</div>
         <div>${escapeHtml(a.historical_link)}</div>
       </div>`
    : "";

  const futureHtml = a.future_projection
    ? `<div class="callout-box forecast">
         <div class="callout-title">🔮 Strategic Forecast</div>
         <div>${escapeHtml(a.future_projection)}</div>
       </div>`
    : "";

  const dateStr = a.published_at ? new Date(a.published_at).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Archive Wire";

  return `
    <article class="article-card ${severityClass}">
      <div class="article-header">
        <div class="flex items-center gap-2">
          <span class="badge ${badgeClass}">${badgeLabel}</span>
          <span class="badge badge-country">${escapeHtml(a.country)}</span>
          <span class="badge badge-category">${escapeHtml(a.category)}</span>
        </div>
        <span class="text-xs text-slate-400 font-mono">${dateStr}</span>
      </div>

      <h3 class="article-title">${escapeHtml(a.title)}</h3>
      
      <p class="article-desc">${escapeHtml(a.description || a.title)}</p>

      ${entitiesHtml}
      ${historicalHtml}
      ${futureHtml}

      <div class="article-footer">
        <span>Source: <b>${escapeHtml(a.source || "OSINT Wire")}</b></span>
        <div class="flex items-center gap-3">
          <button class="btn btn-outline btn-xs" onclick="traceArticleInGraph('${a.id}')">Trace in Graph</button>
          <a href="${escapeHtml(a.link)}" target="_blank" rel="noopener noreferrer">Read Source →</a>
        </div>
      </div>
    </article>
  `;
}

function traceArticleInGraph(articleId) {
  switchTab("tab-graph");
  setTimeout(() => {
    const nodeId = `art:${articleId}`;
    if (networkInstance && graphNodesDataSet) {
      const node = graphNodesDataSet.get(nodeId);
      if (node) {
        networkInstance.selectNodes([nodeId]);
        networkInstance.focus(nodeId, { scale: 1.2, animation: true });
        inspectNode(node);
      } else {
        alert("This record is tracked in the feed, but not yet linked as a primary graph node.");
      }
    }
  }, 250);
}

/* ==========================================================================
   TAB 2: KNOWLEDGE & FORECAST GRAPH (INTERCONNECTED RANGE FILTER)
   ========================================================================== */
async function initGraph() {
  const container = document.getElementById("network-container");
  if (!container) return;

  try {
    const params = new URLSearchParams();
    if (customFromYear && customToYear) {
      params.append("from_year", customFromYear);
      params.append("to_year", customToYear);
    } else if (currentYear !== "All") {
      params.append("year", currentYear);
    }

    const res = await apiFetch(`/api/graph?${params.toString()}`);
    const data = await res.json();

    const isDark = currentTheme === "dark";
    const softNodes = data.nodes.map(n => {
      let color = { background: "#1e293b", border: "#334155", highlight: "#475569" };
      if (n.group === "past") {
        color = { background: "#6366f1", border: "#4f46e5", highlight: "#818cf8" };
      } else if (n.group === "entity") {
        color = { background: "#0ea5e9", border: "#0284c7", highlight: "#38bdf8" };
      } else if (n.group === "future") {
        color = { background: "#eab308", border: "#ca8a04", highlight: "#facc15" };
      } else if (n.urgency === "CRITICAL") {
        color = { background: "#f87171", border: "#ef4444", highlight: "#fca5a5" };
      } else if (n.urgency === "HIGH") {
        color = { background: "#fbbf24", border: "#f59e0b", highlight: "#fde68a" };
      } else {
        color = { background: "#38bdf8", border: "#0284c7", highlight: "#7dd3fc" };
      }
      return { ...n, color, font: { color: isDark ? "#e2e8f0" : "#1e293b" } };
    });

    graphNodesDataSet = new vis.DataSet(softNodes);
    graphEdgesDataSet = new vis.DataSet(data.edges);

    const options = {
      nodes: {
        font: { size: 12, face: "-apple-system, sans-serif" },
        borderWidth: 1.5,
        shadow: false
      },
      edges: {
        smooth: { type: "continuous", roundness: 0.15 },
        arrows: { to: { enabled: true, scaleFactor: 0.6 } },
        color: { opacity: 0.6 }
      },
      physics: {
        barnesHut: {
          gravitationalConstant: -2800,
          centralGravity: 0.25,
          springLength: 120,
          springConstant: 0.03,
          damping: 0.09
        },
        stabilization: { iterations: 120 }
      },
      interaction: {
        hover: true,
        tooltipDelay: 150,
        zoomView: true,
        dragView: true
      }
    };

    networkInstance = new vis.Network(container, { nodes: graphNodesDataSet, edges: graphEdgesDataSet }, options);

    networkInstance.on("click", params => {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const node = graphNodesDataSet.get(nodeId);
        inspectNode(node);
      }
    });

  } catch (err) {
    console.error("Failed to initialize graph:", err);
  }
}

async function refreshGraph() {
  const country = document.getElementById("graph-filter-country").value;
  const nodeType = document.getElementById("graph-filter-type").value;

  const params = new URLSearchParams();
  if (country !== "All") params.append("country", country);
  if (nodeType !== "All") params.append("node_type", nodeType);
  if (customFromYear && customToYear) {
    params.append("from_year", customFromYear);
    params.append("to_year", customToYear);
  } else if (currentYear !== "All") {
    params.append("year", currentYear);
  }

  try {
    const res = await apiFetch(`/api/graph?${params.toString()}`);
    const data = await res.json();

    const isDark = currentTheme === "dark";
    const softNodes = data.nodes.map(n => {
      let color = { background: "#1e293b", border: "#334155", highlight: "#475569" };
      if (n.group === "past") {
        color = { background: "#6366f1", border: "#4f46e5", highlight: "#818cf8" };
      } else if (n.group === "entity") {
        color = { background: "#0ea5e9", border: "#0284c7", highlight: "#38bdf8" };
      } else if (n.group === "future") {
        color = { background: "#eab308", border: "#ca8a04", highlight: "#facc15" };
      } else if (n.urgency === "CRITICAL") {
        color = { background: "#f87171", border: "#ef4444", highlight: "#fca5a5" };
      } else if (n.urgency === "HIGH") {
        color = { background: "#fbbf24", border: "#f59e0b", highlight: "#fde68a" };
      } else {
        color = { background: "#38bdf8", border: "#0284c7", highlight: "#7dd3fc" };
      }
      return { ...n, color, font: { color: isDark ? "#e2e8f0" : "#1e293b" } };
    });

    if (graphNodesDataSet && graphEdgesDataSet) {
      graphNodesDataSet.clear();
      graphEdgesDataSet.clear();
      graphNodesDataSet.add(softNodes);
      graphEdgesDataSet.add(data.edges);
      networkInstance.fit();
    }
  } catch (err) {
    console.error("Failed to refresh graph:", err);
  }
}

function fitGraph() {
  if (networkInstance) {
    networkInstance.fit({ animation: true });
  }
}

function togglePhysics() {
  isPhysicsEnabled = !isPhysicsEnabled;
  if (networkInstance) {
    networkInstance.setOptions({ physics: { enabled: isPhysicsEnabled } });
  }
  const btn = document.getElementById("btn-toggle-physics");
  btn.innerText = isPhysicsEnabled ? "Freeze Physics" : "Unfreeze Physics";
}

function inspectNode(node) {
  if (!node) return;

  const inspectorType = document.getElementById("inspector-type");
  const inspectorContent = document.getElementById("inspector-content");

  let typeBadge = "";
  if (node.group === "past") typeBadge = `<span class="badge" style="background:#6366f1;color:#fff;">🏛️ HISTORICAL PRECEDENT</span>`;
  else if (node.group === "future") typeBadge = `<span class="badge" style="background:#eab308;color:#000;font-weight:600;">🔮 STRATEGIC FORECAST</span>`;
  else if (node.group === "entity") typeBadge = `<span class="badge" style="background:#0ea5e9;color:#000;font-weight:600;">🎯 STATE / INTEL AGENCY</span>`;
  else typeBadge = `<span class="badge badge-critical">⚡ ACTIVE INCIDENT (${node.urgency})</span>`;

  inspectorType.innerHTML = typeBadge;

  const connectedEdgeIds = networkInstance.getConnectedEdges(node.id);
  const incoming = [];
  const outgoing = [];

  connectedEdgeIds.forEach(eid => {
    const edge = graphEdgesDataSet.get(eid);
    if (!edge) return;
    if (edge.to === node.id) {
      const fromNode = graphNodesDataSet.get(edge.from);
      incoming.push({ label: edge.label, node: fromNode });
    } else if (edge.from === node.id) {
      const toNode = graphNodesDataSet.get(edge.to);
      outgoing.push({ label: edge.label, node: toNode });
    }
  });

  const incomingHtml = incoming.length > 0
    ? `<div class="dossier-metric">
         <span class="label">Preceded / Triggered By:</span>
         <ul class="text-xs text-slate-400 list-disc pl-4 mt-1 space-y-1">
           ${incoming.map(i => `<li><b>${escapeHtml(i.label)}:</b> ${escapeHtml(i.node ? i.node.label : 'Node')}</li>`).join('')}
         </ul>
       </div>`
    : "";

  const outgoingHtml = outgoing.length > 0
    ? `<div class="dossier-metric">
         <span class="label">Projected Downstream Risks:</span>
         <ul class="text-xs text-amber-400 list-disc pl-4 mt-1 space-y-1">
           ${outgoing.map(o => `<li><b>${escapeHtml(o.label)}:</b> ${escapeHtml(o.node ? o.node.label : 'Node')}</li>`).join('')}
         </ul>
       </div>`
    : "";

  inspectorContent.innerHTML = `
    <div>
      <h4 class="text-sm font-semibold leading-snug">${escapeHtml(node.label)}</h4>
      <div class="flex items-center gap-2 mt-2">
        <span class="badge badge-country">${escapeHtml(node.country)}</span>
        <span class="badge badge-category">${escapeHtml(node.category)}</span>
      </div>
    </div>

    <div class="dossier-metric">
      <span class="label">Intelligence Summary:</span>
      <p class="text-xs text-slate-400 mt-1 leading-relaxed">${escapeHtml(node.details || 'No telemetry recorded.')}</p>
    </div>

    ${incomingHtml}
    ${outgoingHtml}

    ${node.metadata && node.metadata.link ? `
      <div class="mt-2 pt-2 border-t border-slate-800">
        <a href="${escapeHtml(node.metadata.link)}" target="_blank" class="btn btn-primary btn-xs w-full">Read Full Dispatch</a>
      </div>
    ` : ''}
  `;
}

/* ==========================================================================
   TAB 3: CAUSAL CHAINS (INTERCONNECTED RANGE FILTER)
   ========================================================================== */
async function loadCausalChains() {
  const container = document.getElementById("causal-chains-container");
  const timeDesc = (customFromYear && customToYear) ? `${customFromYear}-${customToYear}` : currentYear;
  container.innerHTML = `<div class="loading-state text-slate-500 py-12 text-center">Synthesizing causal trajectories for ${timeDesc}...</div>`;

  try {
    const params = new URLSearchParams();
    if (customFromYear && customToYear) {
      params.append("from_year", customFromYear);
      params.append("to_year", customToYear);
    } else if (currentYear !== "All") {
      params.append("year", currentYear);
    }

    const res = await apiFetch(`/api/causal-chains?${params.toString()}`);
    const chains = await res.json();

    if (chains.length === 0) {
      container.innerHTML = `<div class="text-center text-slate-500 py-12">No active causal chains for ${timeDesc}. Change the time period or run an archive scan.</div>`;
      return;
    }

    container.innerHTML = chains.map(c => `
      <div class="causal-chain-card">
        <!-- Stage 1 -->
        <div class="chain-stage past">
          <div class="stage-header">🏛️ STAGE 1: HISTORICAL PRECEDENT</div>
          <div class="stage-title">${escapeHtml(c.past_label)}</div>
          <div class="stage-desc">${escapeHtml(c.past_details)}</div>
          <span class="text-xs font-mono text-indigo-400 mt-auto">${escapeHtml(c.past_time || "Foundational Context")}</span>
        </div>

        <div class="chain-arrow">➔</div>

        <!-- Stage 2 -->
        <div class="chain-stage current">
          <div class="stage-header flex items-center justify-between">
            <span>⚡ STAGE 2: BREAKING INCIDENT</span>
            <span class="badge badge-critical">${escapeHtml(c.current_urgency)}</span>
          </div>
          <div class="stage-title">${escapeHtml(c.current_label)}</div>
          <div class="stage-desc">${escapeHtml(c.current_details)}</div>
          <span class="text-xs text-slate-400 mt-auto">Theatre: <b>${escapeHtml(c.current_country)}</b></span>
        </div>

        <div class="chain-arrow">➔</div>

        <!-- Stage 3 -->
        <div class="chain-stage future">
          <div class="stage-header">🔮 STAGE 3: STRATEGIC FORECAST</div>
          <div class="stage-title text-amber-400">Downstream Threat Vector</div>
          <div class="stage-desc">${escapeHtml(c.future_details)}</div>
          <span class="text-xs font-semibold text-yellow-400 mt-auto">STATUS: ELEVATED WATCH</span>
        </div>
      </div>
    `).join("");

  } catch (err) {
    container.innerHTML = `<div class="text-rose-400 text-center py-8">Failed to synthesize causal chains: ${err.message}</div>`;
  }
}

/* ==========================================================================
   TAB 5: SETTINGS & NOTIFICATIONS (ISOLATED PER USER & MASKED CREDENTIALS)
   ========================================================================== */
async function loadSettings() {
  try {
    const res = await apiFetch(`/api/settings?username=${encodeURIComponent(currentUser)}`);
    const s = await res.json();

    document.getElementById("setting-tg-enabled").checked = s.telegram_enabled;
    document.getElementById("setting-tg-chatid").value = s.telegram_chat_id || "";

    const tokenInput = document.getElementById("setting-tg-token");
    const tokenBadge = document.getElementById("tg-token-badge");

    if (s.has_token) {
      tokenInput.value = "";
      tokenInput.placeholder = "•••••••••••••••••••• (Configured & Protected)";
      if (tokenBadge) tokenBadge.classList.remove("hidden");
    } else {
      tokenInput.value = "";
      tokenInput.placeholder = "Enter Bot Token";
      if (tokenBadge) tokenBadge.classList.add("hidden");
    }

    document.getElementById("setting-urgency-threshold").value = s.urgency_threshold || 75;
    document.getElementById("urgency-val").innerText = s.urgency_threshold || 75;
    document.getElementById("setting-poll-interval").value = s.poll_interval_minutes || 10;
  } catch (err) {
    console.error("Failed to load settings:", err);
  }
}

async function saveSettings() {
  const tokenVal = document.getElementById("setting-tg-token").value.trim();
  const payload = {
    username: currentUser,
    telegram_enabled: document.getElementById("setting-tg-enabled").checked,
    telegram_chat_id: document.getElementById("setting-tg-chatid").value.trim(),
    urgency_threshold: parseInt(document.getElementById("setting-urgency-threshold").value, 10),
    poll_interval_minutes: parseInt(document.getElementById("setting-poll-interval").value, 10),
    theme_preference: currentTheme
  };

  // Only send token if user entered a new raw token
  if (tokenVal && !tokenVal.includes("•")) {
    payload.telegram_bot_token = tokenVal;
  }

  try {
    await apiFetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    alert(`✅ Settings saved securely for profile "${currentUser}"!`);
    loadSettings();
  } catch (err) {
    alert("Failed to save settings: " + err.message);
  }
}

async function testTelegramAlert() {
  const resultDiv = document.getElementById("test-tg-result");
  resultDiv.innerHTML = `<span class="text-cyan-400">Dispatching test alert for ${currentUser}...</span>`;

  const tokenVal = document.getElementById("setting-tg-token").value.trim();
  const payload = {
    username: currentUser,
    chat_id: document.getElementById("setting-tg-chatid").value.trim()
  };
  if (tokenVal && !tokenVal.includes("•")) {
    payload.bot_token = tokenVal;
  }

  try {
    const res = await apiFetch("/api/test-telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      resultDiv.innerHTML = `<span class="text-emerald-400 font-semibold">✅ Delivered! Check your phone.</span>`;
    } else {
      resultDiv.innerHTML = `<span class="text-rose-400 font-semibold">❌ Telegram Error: ${escapeHtml(data.error)}</span>`;
    }
  } catch (err) {
    resultDiv.innerHTML = `<span class="text-rose-400 font-semibold">❌ Request failed: ${err.message}</span>`;
  }
}

async function loadNotifications() {
  const tbody = document.getElementById("notifications-table-body");
  if (!tbody) return;

  try {
    const res = await apiFetch("/api/notifications");
    const notes = await res.json();

    if (notes.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-slate-500">No phone dispatches yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = notes.map(n => `
      <tr>
        <td class="font-mono text-xs">${new Date(n.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
        <td><span class="badge ${n.channel === 'telegram' ? 'badge-medium' : 'badge-low'}">${n.channel.toUpperCase()}</span></td>
        <td><span class="badge ${n.status === 'sent' ? 'badge-high' : 'badge-critical'}">${n.status.toUpperCase()}</span></td>
        <td><span class="font-bold text-rose-400">${n.urgency_score}/100</span></td>
        <td class="truncate max-w-md">${escapeHtml(n.title)}</td>
      </tr>
    `).join("");
  } catch (err) {
    console.error("Failed to load notifications:", err);
  }
}

/* ==========================================================================
   QUICK TEST ALERT MODAL
   ========================================================================== */
function openTestModal() {
  const modal = document.getElementById("test-modal");
  document.getElementById("quick-tg-token").value = "";
  document.getElementById("quick-tg-token").placeholder = "Uses saved profile token";
  document.getElementById("quick-tg-chatid").value = document.getElementById("setting-tg-chatid").value || "";
  document.getElementById("quick-test-result").innerHTML = "";
  modal.classList.remove("hidden");
}

function closeTestModal() {
  document.getElementById("test-modal").classList.add("hidden");
}

async function runQuickTest() {
  const tokenVal = document.getElementById("quick-tg-token").value.trim();
  const chatId = document.getElementById("quick-tg-chatid").value.trim();
  const resDiv = document.getElementById("quick-test-result");

  resDiv.innerHTML = `<span class="text-cyan-400">Dispatching alert...</span>`;

  const payload = { username: currentUser, chat_id: chatId };
  if (tokenVal && !tokenVal.includes("•")) {
    payload.bot_token = tokenVal;
  }

  try {
    const res = await apiFetch("/api/test-telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      resDiv.innerHTML = `<span class="text-emerald-400 font-semibold">✅ Alert received on your phone!</span>`;
      if (tokenVal && !tokenVal.includes("•")) {
        document.getElementById("setting-tg-token").value = tokenVal;
      }
      document.getElementById("setting-tg-chatid").value = chatId;
      document.getElementById("setting-tg-enabled").checked = true;
      saveSettings();
    } else {
      resDiv.innerHTML = `<span class="text-rose-400 font-semibold">❌ ${escapeHtml(data.error)}</span>`;
    }
  } catch (err) {
    resDiv.innerHTML = `<span class="text-rose-400 font-semibold">❌ Request failed: ${err.message}</span>`;
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
