// --- LIVE BACKEND RESOLUTION & MULTI-TUNNEL AUTO-DISCOVERY ---
const APP_NAME = "darkweb";
const STORAGE_BACKEND_KEY = "darkweb_sentinel_backend_url";
localStorage.removeItem("sentinel_backend_url");

const KNOWN_BACKENDS = [
  "https://cordless-display-dressing-bookmarks.trycloudflare.com",
  "https://rhode-mono-sally-angle.trycloudflare.com"
];

let API_BASE = "";
if (window.location.hostname.includes("github.io")) {
  API_BASE = localStorage.getItem(STORAGE_BACKEND_KEY) || KNOWN_BACKENDS[0];
} else if (window.location.pathname.startsWith("/darkweb") || window.location.pathname.startsWith("/static/darkweb")) {
  API_BASE = "https://darkweb-sentinel.vercel.app";
}

async function apiFetch(url, options = {}) {
  const fullUrl = (API_BASE && url.startsWith("/")) ? (API_BASE + url) : url;
  options.headers = options.headers || {};
  const userTorProxy = localStorage.getItem("darkweb_tor_proxy_url");
  if (userTorProxy) {
    if (options.headers instanceof Headers) {
      options.headers.set("X-Tor-Proxy", userTorProxy);
    } else {
      options.headers["X-Tor-Proxy"] = userTorProxy;
    }
  }
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

// --- TOR NETWORK PROXY & GATEWAY CONTROLLER ---
const STORAGE_TOR_PROXY_KEY = "darkweb_tor_proxy_url";

window.openTorModal = async function() {
  const modal = document.getElementById("torModal");
  const input = document.getElementById("torProxyInput");
  const res = document.getElementById("torTestResult");
  if (modal) modal.classList.remove("hidden");
  if (res) { res.className = "tor-test-box hidden"; res.innerHTML = ""; }

  const localSaved = localStorage.getItem(STORAGE_TOR_PROXY_KEY);
  if (localSaved) {
    if (input) input.value = localSaved;
    window.selectTorMode(localSaved === "tor2web" ? "tor2web" : "custom");
  } else {
    try {
      const resp = await apiFetch("/api/tor/config");
      if (resp.ok) {
        const cfg = await resp.json();
        if (input) input.value = cfg.proxy_url || "socks5h://127.0.0.1:9050";
        window.selectTorMode(cfg.mode === "tor2web" ? "tor2web" : "custom");
      }
    } catch (e) {
      if (input) input.value = "socks5h://127.0.0.1:9050";
    }
  }
};

window.closeTorModal = function() {
  const modal = document.getElementById("torModal");
  if (modal) modal.classList.add("hidden");
};

window.selectTorMode = function(mode) {
  const customBtn = document.getElementById("torModeCustomBtn");
  const gatewayBtn = document.getElementById("torModeGatewayBtn");
  const inputGroup = document.getElementById("torProxyInputGroup");
  const input = document.getElementById("torProxyInput");

  if (mode === "tor2web") {
    if (gatewayBtn) gatewayBtn.classList.add("active-mode");
    if (customBtn) customBtn.classList.remove("active-mode");
    if (input) input.value = "tor2web";
    if (inputGroup) inputGroup.style.opacity = "0.6";
  } else {
    if (customBtn) customBtn.classList.add("active-mode");
    if (gatewayBtn) gatewayBtn.classList.remove("active-mode");
    if (input && input.value === "tor2web") input.value = "socks5h://127.0.0.1:9050";
    if (inputGroup) inputGroup.style.opacity = "1";
  }
};

window.setTorPreset = function(preset) {
  const input = document.getElementById("torProxyInput");
  if (input) input.value = preset;
  window.selectTorMode(preset === "tor2web" ? "tor2web" : "custom");
};

window.resetTorDefault = function() {
  window.setTorPreset("socks5h://127.0.0.1:9050");
  const res = document.getElementById("torTestResult");
  if (res) { res.className = "tor-test-box hidden"; res.innerHTML = ""; }
};

window.testTorConnection = async function() {
  const input = document.getElementById("torProxyInput");
  const res = document.getElementById("torTestResult");
  const proxy = input ? input.value.trim() : "socks5h://127.0.0.1:9050";

  if (res) {
    res.className = "tor-test-box";
    res.innerHTML = `⏳ Testing connection to Tor Network via <code>${proxy}</code>...`;
  }

  try {
    const resp = await apiFetch("/api/tor/status?proxy_url=" + encodeURIComponent(proxy), {
      method: "GET"
    });
    const data = await resp.json();
    if (data.success && data.is_tor) {
      if (res) {
        res.className = "tor-test-box success";
        res.innerHTML = `
          <div style="font-weight:600;color:var(--accent-green);margin-bottom:4px;">🟢 Tor Circuit Verified & Operational!</div>
          <div><strong>Routing Mode:</strong> ${data.mode || 'Active'}</div>
          <div><strong>Exit Relay IP:</strong> <code>${data.exit_ip || 'Hidden Relay'}</code></div>
          <div><strong>Tor Latency:</strong> <code>${data.latency_ms} ms</code></div>
        `;
      }
    } else {
      if (res) {
        res.className = "tor-test-box error";
        res.innerHTML = `
          <div style="font-weight:600;color:var(--accent-red);margin-bottom:4px;">🔴 Tor Connection Failed</div>
          <div style="margin-bottom:4px;"><strong>Diagnostic:</strong> ${data.error || 'Connection timed out'}</div>
          <div style="font-size:0.75rem;opacity:0.85;">💡 <em>${data.tip || 'Tip: If using local Tor Browser, set to socks5h://127.0.0.1:9150, or choose Tor2Web Cloud Gateway.'}</em></div>
        `;
      }
    }
  } catch (err) {
    if (res) {
      res.className = "tor-test-box error";
      res.innerHTML = `<div style="font-weight:600;color:var(--accent-red);">🔴 Error querying backend:</div> ${err.message}`;
    }
  }
};

window.saveTorConfig = async function() {
  const input = document.getElementById("torProxyInput");
  const saveBtn = document.getElementById("saveTorBtn");
  const proxy = input ? input.value.trim() : "socks5h://127.0.0.1:9050";

  if (saveBtn) saveBtn.textContent = "Saving...";

  try {
    localStorage.setItem(STORAGE_TOR_PROXY_KEY, proxy);
    await apiFetch("/api/tor/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proxy_url: proxy })
    });
    showToast(`✓ Tor Network configured: ${proxy}`, true);
    window.closeTorModal();
    if (typeof checkTorStatus === "function") checkTorStatus();
  } catch (err) {
    localStorage.setItem(STORAGE_TOR_PROXY_KEY, proxy);
    showToast(`✓ Saved locally: ${proxy}`, true);
    window.closeTorModal();
    if (typeof checkTorStatus === "function") checkTorStatus();
  } finally {
    if (saveBtn) saveBtn.textContent = "💾 Save & Connect";
  }
};
// --- END TOR NETWORK CONTROLLER ---

/**
 * Egypt Black Wolf | Dark Web Sentinel v2.1
 * High-Speed OSINT Recon, Directory Deep Inspector & Ransomware DLS Monitor
 */

document.addEventListener("DOMContentLoaded", () => {
  // Global Application State
  const state = {
    theme: localStorage.getItem("theme") || "dark",
    activeTab: "searchTab",
    // Global Filter Bar
    timeRange: "All",
    customYearStart: null,
    customYearEnd: null,
    sortOrder: "time_desc",
    // Search Tab
    searchMode: "threat_intel",
    searchQuery: "",
    searchCountry: "All",
    searchCategory: "All",
    searchOffset: 0,
    searchLimit: 15,
    searchTotal: 0,
    searchExtended: false,
    currentSearchResults: [],
    // Leaks Tab
    leakCountry: "All",
    leakSearch: "",
    leakForumType: "All",
    leaksOffset: 0,
    leaksLimit: 12,
    leaksTotal: 0,
    currentLeaks: [],
    threatGraphActive: false,
    threatGraphNodes: [],
    threatGraphLinks: [],
    exportContext: "leaks",
    harvestedLinksCache: [],
    // Targets Tab
    targetCategory: "All",
    targetStatus: "All",
    // Discovery Tab
    discoveryStatus: "All",
    // Recon Tab
    reconQuery: "radio",
    reconScope: "All Active Engines",
    currentReconResults: [],
    discoveredEnginesMap: {},
    inspectedEngine: null,
    // Directory Catalog Tab
    selectedDirectory: "FCZ7 Master Index",
    dirCategory: "All",
    dirSearch: "",
    dirOffset: 0,
    dirLimit: 100,
    dirTotal: 0,
    currentDirLinks: []
  };

  // --- INITIALIZATION ---
  initTheme();
  bindGlobalEvents();
  restoreSavedPreferences();
  loadStats();
  checkTorStatus();
  loadWatchdogStatus();
  loadWatchlistKeywords();
  loadThreatGroups();
  executeSearch(true);
  loadLeaks(true);
  loadTargets();
  loadDiscoveryQueue();
  loadDiscoveredEngines();
  loadReconHistory();
  loadDirectorySummary();
  loadDirectoryLinks(true);
  loadTelegramChannels();
  loadSettings();
  loadTunnelsAndCrossLinks();
  setInterval(loadTunnelsAndCrossLinks, 30000);

  function restoreSavedPreferences() {
    try {
      // 1. Time range
      const savedTime = localStorage.getItem("darkweb_time_range");
      const timeSelect = document.getElementById("globalTimeSelect");
      const customYearWrap = document.getElementById("customYearRangeWrap");
      if (savedTime && timeSelect) {
        timeSelect.value = savedTime;
        state.timeRange = savedTime;
        if (savedTime === "custom") customYearWrap?.classList.remove("hidden");
      }

      // 2. Sort order
      const savedSort = localStorage.getItem("darkweb_sort_order");
      const sortSelect = document.getElementById("globalSortSelect");
      if (savedSort && sortSelect) {
        sortSelect.value = savedSort;
        state.sortOrder = savedSort;
      }

      // 3. Search category
      const savedCat = localStorage.getItem("darkweb_search_category");
      const searchCat = document.getElementById("searchCategoryFilter");
      if (savedCat && searchCat) {
        searchCat.value = savedCat;
        state.searchCategory = savedCat;
      }

      // 4. Search country
      const savedCountry = localStorage.getItem("darkweb_search_country");
      if (savedCountry) {
        state.searchCountry = savedCountry;
        document.querySelectorAll("#searchCountryFilter .pill").forEach(p => {
          if (p.getAttribute("data-val") === savedCountry) p.classList.add("active");
          else p.classList.remove("active");
        });
      }

      // 5. Search mode
      const savedMode = localStorage.getItem("darkweb_search_mode");
      if (savedMode) {
        setSearchMode(savedMode, false);
      }

      // 6. Recon scope
      const savedScope = localStorage.getItem("darkweb_recon_scope");
      const reconScope = document.getElementById("reconScopeSelect");
      if (savedScope && reconScope) {
        reconScope.value = savedScope;
        state.reconScope = savedScope;
      }

      // 7. Leak forum
      const savedLeakForum = localStorage.getItem("darkweb_leak_forum");
      const leakForum = document.getElementById("leakForumSelect");
      if (savedLeakForum && leakForum) {
        leakForum.value = savedLeakForum;
        state.leakForumType = savedLeakForum;
      }

      // 8. Target category & status
      const savedTargetCat = localStorage.getItem("darkweb_target_category");
      const targetCat = document.getElementById("targetCategoryFilter");
      if (savedTargetCat && targetCat) {
        targetCat.value = savedTargetCat;
        state.targetCategory = savedTargetCat;
      }
      const savedTargetStat = localStorage.getItem("darkweb_target_status");
      const targetStat = document.getElementById("targetStatusFilter");
      if (savedTargetStat && targetStat) {
        targetStat.value = savedTargetStat;
        state.targetStatus = savedTargetStat;
      }

      // 9. Active tab
      const hashTab = window.location.hash ? window.location.hash.substring(1) : null;
      const savedTab = hashTab || localStorage.getItem("darkweb_active_tab");
      if (savedTab && document.getElementById(savedTab)) {
        switchTab(savedTab, false);
      }
    } catch (e) {
      console.warn("Error restoring saved preferences:", e);
    }
  }

  // --- THEME SWITCHER ---
  function initTheme() {
    document.documentElement.setAttribute("data-theme", state.theme);
    updateThemeIcon();
  }

  function toggleTheme() {
    state.theme = state.theme === "dark" ? "light" : "dark";
    localStorage.setItem("theme", state.theme);
    document.documentElement.setAttribute("data-theme", state.theme);
    updateThemeIcon();
  }

  function updateThemeIcon() {
    const icon = document.getElementById("themeIcon");
    if (icon) {
      icon.textContent = state.theme === "dark" ? "☀️" : "🌙";
    }
  }

  function showToast(message, isSuccess = true) {
    const toast = document.getElementById("toastNotification");
    if (!toast) return;
    toast.textContent = message;
    toast.style.borderColor = isSuccess ? "var(--accent-green)" : "var(--accent-red)";
    toast.classList.remove("hidden");
    setTimeout(() => {
      toast.classList.add("hidden");
    }, 4000);
  }

  async function loadTunnelsAndCrossLinks() {
    try {
      const res = await apiFetch("/api/public-url");
      if (!res.ok) return;
      const data = await res.json();
      
      const isRemote = !["localhost", "127.0.0.1"].includes(window.location.hostname);
      const mideastLink = document.getElementById("mideastSentinelLink");
      
      if (mideastLink) {
        if (data && data.mideast_url) {
          mideastLink.href = data.mideast_url;
          mideastLink.title = `Switch to Middle East Sentinel (${data.mideast_url})`;
        } else if (isRemote) {
          mideastLink.href = "https://mideast-intel-sentinel1.vercel.app";
          mideastLink.title = "Switch to Middle East Sentinel";
        } else {
          mideastLink.href = "http://localhost:8000";
          mideastLink.title = "Switch to Middle East Sentinel (http://localhost:8000)";
        }
      }

      const copyBtn = document.getElementById("copyPublicLinkBtn");
      if (copyBtn && data.public_url) {
        copyBtn.classList.remove("hidden");
        copyBtn.onclick = () => {
          navigator.clipboard.writeText(data.public_url);
          showToast(`Copied Public Link: ${data.public_url}`);
        };
      }
    } catch (err) {
      console.warn("Could not load cross-portal tunnel URLs:", err);
    }
  }

  // --- EVENT BINDINGS ---
  function bindGlobalEvents() {
    document.getElementById("themeToggleBtn")?.addEventListener("click", toggleTheme);

    // Tab Navigation
    document.querySelectorAll(".tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const tabId = btn.getAttribute("data-tab");
        switchTab(tabId);
      });
    });

    // Global Time Filter Select
    const timeSelect = document.getElementById("globalTimeSelect");
    const customYearWrap = document.getElementById("customYearRangeWrap");
    timeSelect?.addEventListener("change", (e) => {
      const val = e.target.value;
      localStorage.setItem("darkweb_time_range", val);
      if (val === "custom") {
        customYearWrap?.classList.remove("hidden");
        state.timeRange = "custom";
      } else {
        customYearWrap?.classList.add("hidden");
        state.timeRange = val;
        state.customYearStart = null;
        state.customYearEnd = null;
        refreshActiveViews();
      }
    });

    document.getElementById("applyYearRangeBtn")?.addEventListener("click", () => {
      const start = document.getElementById("customYearStart")?.value;
      const end = document.getElementById("customYearEnd")?.value;
      state.customYearStart = start ? parseInt(start) : null;
      state.customYearEnd = end ? parseInt(end) : null;
      refreshActiveViews();
    });

    // Global Sort Select
    document.getElementById("globalSortSelect")?.addEventListener("change", (e) => {
      state.sortOrder = e.target.value;
      localStorage.setItem("darkweb_sort_order", state.sortOrder);
      refreshActiveViews();
    });

    // Search Mode Toggle
    document.getElementById("modeThreatIntel")?.addEventListener("click", () => setSearchMode("threat_intel"));
    document.getElementById("modeGlobal")?.addEventListener("click", () => setSearchMode("global"));

    // Search Bar
    document.getElementById("searchBtn")?.addEventListener("click", () => executeSearch(true));
    document.getElementById("searchInput")?.addEventListener("keypress", (e) => {
      if (e.key === "Enter") executeSearch(true);
    });

    // Search Country Pills
    document.querySelectorAll("#searchCountryFilter .pill").forEach(pill => {
      pill.addEventListener("click", () => {
        document.querySelectorAll("#searchCountryFilter .pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        state.searchCountry = pill.getAttribute("data-val");
        localStorage.setItem("darkweb_search_country", state.searchCountry);
        executeSearch(true);
      });
    });

    // Search Category
    document.getElementById("searchCategoryFilter")?.addEventListener("change", (e) => {
      state.searchCategory = e.target.value;
      localStorage.setItem("darkweb_search_category", state.searchCategory);
      executeSearch(true);
    });

    // Search Load More
    document.getElementById("searchLoadMoreBtn")?.addEventListener("click", () => {
      state.searchOffset += state.searchLimit;
      executeSearch(false);
    });

    // Recon Launch
    document.getElementById("runReconBtn")?.addEventListener("click", () => runServiceRecon(false));
    document.getElementById("forceReconBtn")?.addEventListener("click", () => runServiceRecon(true));
    document.getElementById("reconQueryInput")?.addEventListener("keypress", (e) => {
      if (e.key === "Enter") runServiceRecon(false);
    });

    // Directory Explorer Category Pills
    document.querySelectorAll("#dirCategoryFilter .pill").forEach(pill => {
      pill.addEventListener("click", () => {
        document.querySelectorAll("#dirCategoryFilter .pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        state.dirCategory = pill.getAttribute("data-val");
        loadDirectoryLinks(true);
      });
    });

    // Directory Search Input
    let dirSearchTimeout = null;
    document.getElementById("dirSearchInput")?.addEventListener("input", (e) => {
      clearTimeout(dirSearchTimeout);
      dirSearchTimeout = setTimeout(() => {
        state.dirSearch = e.target.value.trim();
        loadDirectoryLinks(true);
      }, 300);
    });

    // Directory Batch Actions
    document.getElementById("strongCheckAllVisibleBtn")?.addEventListener("click", runStrongCheckOnVisible);
    document.getElementById("batchAddVisibleBtn")?.addEventListener("click", batchAddVisibleNewSites);

    // Leaks Country Filter
    document.querySelectorAll("#leakCountryFilter .pill").forEach(pill => {
      pill.addEventListener("click", () => {
        document.querySelectorAll("#leakCountryFilter .pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        state.leakCountry = pill.getAttribute("data-val");
        loadLeaks(true);
      });
    });

    // Leaks Load More
    document.getElementById("leaksLoadMoreBtn")?.addEventListener("click", () => {
      state.leaksOffset += state.leaksLimit;
      loadLeaks(false);
    });

    // Directory Links Load More (Fixed!)
    document.getElementById("directoryLoadMoreBtn")?.addEventListener("click", () => {
      state.dirOffset += state.dirLimit;
      loadDirectoryLinks(false);
    });

    // Targets Filter
    document.getElementById("targetCategoryFilter")?.addEventListener("change", (e) => {
      state.targetCategory = e.target.value;
      localStorage.setItem("darkweb_target_category", state.targetCategory);
      loadTargets();
    });
    document.getElementById("targetStatusFilter")?.addEventListener("change", (e) => {
      state.targetStatus = e.target.value;
      localStorage.setItem("darkweb_target_status", state.targetStatus);
      loadTargets();
    });

    // Discovery Filter
    document.querySelectorAll("#discoveryFilterPills .pill").forEach(pill => {
      pill.addEventListener("click", () => {
        document.querySelectorAll("#discoveryFilterPills .pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        state.discoveryStatus = pill.getAttribute("data-val");
        loadDiscoveryQueue();
      });
    });

    document.getElementById("batchValidateBtn")?.addEventListener("click", runBatchValidation);

    // Modals Open/Close
    document.getElementById("openAddTargetModalBtn")?.addEventListener("click", () => openModal("addTargetModal"));
    document.getElementById("openAddLeakModalBtn")?.addEventListener("click", () => openModal("addLeakModal"));
    document.getElementById("harvestModalBtn")?.addEventListener("click", () => openModal("harvestModal"));
    document.getElementById("btnOpenAddEngineModal")?.addEventListener("click", () => openModal("addEngineModal"));
    document.getElementById("openAddTelegramModalBtn")?.addEventListener("click", () => openModal("addTelegramModal"));
    document.getElementById("btnOpenAddTelegramModalQuick")?.addEventListener("click", () => openModal("addTelegramModal"));
    document.getElementById("btnScanAllTelegramChannels")?.addEventListener("click", handleScanAllTelegramChannels);
    document.getElementById("btnToggleTelegramGrid")?.addEventListener("click", () => {
      const grid = document.getElementById("telegramChannelsGrid");
      if (grid) grid.classList.toggle("hidden");
    });

    document.querySelectorAll(".close-modal-btn, [data-close]").forEach(btn => {
      btn.addEventListener("click", () => {
        const modalId = btn.getAttribute("data-close") || btn.closest(".modal-backdrop")?.id;
        if (modalId) closeModal(modalId);
      });
    });

    // Form Submissions
    document.getElementById("addTargetForm")?.addEventListener("submit", handleAddTarget);
    document.getElementById("addLeakForm")?.addEventListener("submit", handleAddLeak);
    document.getElementById("harvestForm")?.addEventListener("submit", handleHarvest);
    document.getElementById("addEngineForm")?.addEventListener("submit", handleAddCustomEngine);
    document.getElementById("addTelegramForm")?.addEventListener("submit", handleAddTelegramChannel);
    document.getElementById("settingsForm")?.addEventListener("submit", handleSaveSettings);
    document.getElementById("testTgAlertBtn")?.addEventListener("click", handleTestAlert);
    document.getElementById("refreshTorBtn")?.addEventListener("click", checkTorStatus);

    // Engine Review Actions in Modal
    document.getElementById("confirmAddEngineBtn")?.addEventListener("click", confirmAddDiscoveredEngine);
    document.getElementById("dismissEngineBtn")?.addEventListener("click", dismissDiscoveredEngine);

    // Eye toggles for credentials
    document.getElementById("toggleBotTokenEye")?.addEventListener("click", () => toggleInputEye("tgBotTokenInput"));
    document.getElementById("toggleChatIdEye")?.addEventListener("click", () => toggleInputEye("tgChatIdInput"));

    // Point 3: Tor Circuit Rotation
    document.getElementById("btnRotateTorCircuit")?.addEventListener("click", rotateTorCircuit);

    // Cache Clearing Actions
    document.getElementById("btnClearCacheBtn")?.addEventListener("click", () => promptClearCache("all"));
    document.getElementById("clearReconCacheBtn")?.addEventListener("click", () => promptClearCache("recon"));
    document.getElementById("clearIndexedCacheBtn")?.addEventListener("click", () => promptClearCache("indexed"));
    document.getElementById("clearDiscoveryCacheBtn")?.addEventListener("click", () => promptClearCache("discovery"));
    document.getElementById("clearAllCacheBtn")?.addEventListener("click", () => promptClearCache("all"));
    document.getElementById("confirmClearCacheBtn")?.addEventListener("click", executeClearCache);

    // Point 1: One-Click OSINT Dossier Exporters
    document.getElementById("btnExportLeaksDossier")?.addEventListener("click", () => openExportModal("leaks"));
    document.getElementById("btnExportSearchDossier")?.addEventListener("click", () => openExportModal("search"));
    document.getElementById("btnExportReconDossier")?.addEventListener("click", () => openExportModal("recon"));
    document.getElementById("exportHtmlCard")?.addEventListener("click", () => triggerDossierDownload("html"));
    document.getElementById("exportCsvCard")?.addEventListener("click", () => triggerDossierDownload("csv"));
    document.getElementById("exportJsonCard")?.addEventListener("click", () => triggerDossierDownload("json"));

    // Tab 3: Recursive Expansion Circuit Harvester
    document.getElementById("btnHarvestLists")?.addEventListener("click", () => harvestLinkLists(null));
    document.getElementById("btnCrawlListUrl")?.addEventListener("click", () => {
      const u = document.getElementById("harvestCustomUrlInput")?.value.trim();
      if (u) harvestLinkLists(u);
    });
    document.getElementById("btnIngestAllHarvested")?.addEventListener("click", ingestAllHarvestedLinks);
    document.getElementById("btnCloseHarvested")?.addEventListener("click", () => {
      document.getElementById("harvestedResultsBox")?.classList.add("hidden");
    });

    // Tab 4: In-Leaks Search & Forum Category Filter
    let leakSearchTimer = null;
    document.getElementById("leakSearchInput")?.addEventListener("input", (e) => {
      clearTimeout(leakSearchTimer);
      leakSearchTimer = setTimeout(() => {
        state.leakSearch = e.target.value.trim();
        loadLeaks(true);
      }, 300);
    });

    document.getElementById("leakForumSelect")?.addEventListener("change", (e) => {
      state.leakForumType = e.target.value;
      loadLeaks(true);
    });

    document.getElementById("openAddForumModalBtn")?.addEventListener("click", () => openModal("addForumModal"));
    document.getElementById("addForumForm")?.addEventListener("submit", handleAddForumTarget);

    // Point 5: Threat Entity Graph Controls
    document.getElementById("btnToggleThreatGraph")?.addEventListener("click", toggleThreatGraphView);
    document.getElementById("closeGraphViewBtn")?.addEventListener("click", toggleThreatGraphView);
    document.getElementById("resetGraphViewBtn")?.addEventListener("click", initThreatEntityGraph);
    document.getElementById("closeGraphDetailBtn")?.addEventListener("click", () => {
      document.getElementById("threatGraphDetailCard")?.classList.add("hidden");
    });

    // Point 2: 24/7 Watchdog Controls & Watchlist
    document.getElementById("toggleWatchdogBtn")?.addEventListener("click", toggleWatchdog);
    document.getElementById("triggerWatchdogNowBtn")?.addEventListener("click", triggerWatchdogNow);
    document.getElementById("watchdogIntervalSelect")?.addEventListener("change", async (e) => {
      const newInterval = parseInt(e.target.value || "900");
      localStorage.setItem("darkweb_watchdog_interval", String(newInterval));
      const isActive = localStorage.getItem("darkweb_watchdog_active") !== "false";
      _applyWatchdogUI(isActive, Math.round(newInterval / 60));
      try {
        await apiFetch("/api/watchdog/toggle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: isActive, interval_seconds: newInterval })
        });
        showToast(`✓ Watchdog interval updated to ${Math.round(newInterval / 60)}m.`, true);
      } catch (err) {
        console.warn("Error updating interval:", err);
      }
    });
    document.getElementById("addWatchlistForm")?.addEventListener("submit", handleAddWatchlistKeyword);

    // Point 4: Deep Onion Inspector View Tabs
    document.getElementById("inspTabHtmlBtn")?.addEventListener("click", () => {
      document.getElementById("inspTabHtmlBtn")?.classList.add("active");
      document.getElementById("inspTabTechBtn")?.classList.remove("active");
      document.getElementById("inspHtmlView")?.classList.remove("hidden");
      document.getElementById("inspTechView")?.classList.add("hidden");
    });

    document.getElementById("inspTabTechBtn")?.addEventListener("click", () => {
      document.getElementById("inspTabTechBtn")?.classList.add("active");
      document.getElementById("inspTabHtmlBtn")?.classList.remove("active");
      document.getElementById("inspTechView")?.classList.remove("hidden");
      document.getElementById("inspHtmlView")?.classList.add("hidden");
      if (state.inspectedEngine && state.inspectedEngine.url) {
        loadOnionTechnicalFingerprint(state.inspectedEngine.url);
      }
    });

    document.getElementById("copyShodanQueryBtn")?.addEventListener("click", () => {
      const q = document.getElementById("fpMurmurHash")?.getAttribute("data-query");
      if (q) copyToClipboard(q);
    });

    document.getElementById("copyPgpBtn")?.addEventListener("click", () => {
      const block = document.getElementById("fpPgpBlock")?.textContent;
      if (block && !block.includes("No ASCII")) copyToClipboard(block);
    });
  }

  function toggleInputEye(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.type = input.type === "password" ? "text" : "password";
  }

  function switchTab(tabId, updateHash = true) {
    if (!tabId) return;
    state.activeTab = tabId;
    localStorage.setItem("darkweb_active_tab", tabId);
    if (updateHash) {
      try {
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, null, `#${tabId}`);
        }
      } catch (_) {}
    }

    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

    document.querySelector(`[data-tab="${tabId}"]`)?.classList.add("active");
    document.getElementById(tabId)?.classList.add("active");
  }

  function refreshActiveViews() {
    if (state.activeTab === "searchTab") {
      executeSearch(true);
    } else if (state.activeTab === "leaksTab") {
      loadLeaks(true);
    } else if (state.activeTab === "directoryTab") {
      loadDirectoryLinks(true);
    }
  }

  function setSearchMode(mode, triggerSearch = true) {
    state.searchMode = mode;
    localStorage.setItem("darkweb_search_mode", mode);
    const btnThreat = document.getElementById("modeThreatIntel");
    const btnGlobal = document.getElementById("modeGlobal");
    const helper = document.getElementById("modeHelperText");

    if (mode === "threat_intel") {
      btnThreat?.classList.add("active");
      btnGlobal?.classList.remove("active");
      if (helper) helper.textContent = "Focuses on military, espionage, zero-days, SCADA, and leaked data (score ≥ 25).";
    } else {
      btnGlobal?.classList.add("active");
      btnThreat?.classList.remove("active");
      if (helper) helper.textContent = "Broad indexing across all darknet services, radios, media, forums, and mirrors.";
    }
    if (triggerSearch) executeSearch(true);
  }

  // --- STATS & TOR DIAGNOSTICS ---
  async function loadStats() {
    try {
      const res = await apiFetch("/api/stats");
      const data = await res.json();
      if (data.success) {
        const s = data.stats;
        document.getElementById("statTargets").textContent = s.total_targets || 0;
        document.getElementById("statOnline").textContent = `${s.online_targets || 0} Active Online`;
        document.getElementById("statLeaks").textContent = s.total_leaks || 0;
        document.getElementById("statReconOps").textContent = s.total_recon_ops || 0;
        document.getElementById("statCatalogLinks").textContent = s.total_catalog_links || 349;
        document.getElementById("statIndexedPages").textContent = s.indexed_pages || 0;

        document.getElementById("targetsCountBadge").textContent = s.total_targets || 0;
        document.getElementById("leaksCountBadge").textContent = s.total_leaks || 0;
        document.getElementById("discoveryBadge").textContent = s.discovered_links || 0;
        document.getElementById("directoryBadge").textContent = s.total_catalog_links || 349;

        const pendingEngines = s.pending_discovered_engines || 0;
        const engineBadge = document.getElementById("newEnginesBadge");
        if (engineBadge) {
          engineBadge.textContent = `${pendingEngines} New`;
          engineBadge.style.display = pendingEngines > 0 ? "inline-block" : "none";
        }
      }
    } catch (e) {
      console.warn("Error loading stats:", e);
    }
  }

  async function checkTorStatus() {
    const badge = document.getElementById("torStatusBadge");
    const text = document.getElementById("torStatusText");
    const cardBadge = document.getElementById("torCardBadge");
    const infoRouting = document.getElementById("torInfoRouting");
    const infoExitIp = document.getElementById("torInfoExitIp");
    const infoLatency = document.getElementById("torInfoLatency");

    if (text) text.textContent = "Checking Tor Circuit...";

    try {
      const res = await apiFetch("/api/tor/status");
      const data = await res.json();
      if (data.success && data.is_tor) {
        if (badge) badge.className = "tor-badge operational";
        const label = data.proxy_url === "tor2web" ? "Tor2Web Relay" : (data.mode && data.mode.includes("Personal") ? "My Tor Proxy" : "Tor Online");
        if (text) text.textContent = `${label} (${data.latency_ms}ms)`;
        if (cardBadge) {
          cardBadge.textContent = "Operational";
          cardBadge.className = "badge badge-success";
        }
        if (infoRouting) infoRouting.textContent = `Active (${data.proxy_url || "socks5h://127.0.0.1:9050"})`;
        if (infoExitIp) infoExitIp.textContent = data.exit_ip || "Tor Exit Node Active";
        if (infoLatency) infoLatency.textContent = `${data.latency_ms} ms`;
      } else {
        if (badge) badge.className = "tor-badge degraded";
        if (text) text.textContent = "Tor Offline (Click to Connect)";
        if (cardBadge) {
          cardBadge.textContent = "Offline";
          cardBadge.className = "badge badge-danger";
        }
        if (infoRouting) infoRouting.textContent = "Offline (Click Connect My Tor Network)";
        if (infoExitIp) infoExitIp.textContent = "None";
        if (infoLatency) infoLatency.textContent = "-- ms";
      }
    } catch (e) {
      if (badge) badge.className = "tor-badge degraded";
      if (text) text.textContent = "Tor Offline (Click to Connect)";
    }
  }

  // --- TAB 1: DARKNET SEARCH ENGINE ---
  async function executeSearch(reset = true) {
    const input = document.getElementById("searchInput");
    const query = input ? input.value.trim() : "";
    state.searchQuery = query;

    if (reset) {
      state.searchOffset = 0;
      state.currentSearchResults = [];
    }

    const listContainer = document.getElementById("searchResultsList");
    const summaryText = document.getElementById("searchResultsSummary");
    const latencyText = document.getElementById("searchLatency");
    const loadMoreBtn = document.getElementById("searchLoadMoreBtn");
    const telemetryText = document.getElementById("searchTelemetryText");

    if (reset && listContainer) {
      listContainer.innerHTML = '<div class="loading-placeholder"><div class="spinner"></div><span>Querying BM25 darknet index...</span></div>';
    }

    const startT = performance.now();
    try {
      const params = new URLSearchParams({
        q: state.searchQuery,
        mode: state.searchMode,
        category: state.searchCategory,
        country: state.searchCountry,
        sort_by: state.sortOrder,
        offset: state.searchOffset,
        limit: state.searchLimit
      });

        params.append("extended", state.searchExtended ? "true" : "false");

      if (state.timeRange !== "All" && state.timeRange !== "custom") {
        params.append("year_start", state.timeRange);
        params.append("year_end", state.timeRange);
      } else if (state.timeRange === "custom") {
        if (state.customYearStart) params.append("year_start", state.customYearStart);
        if (state.customYearEnd) params.append("year_end", state.customYearEnd);
      }

      const res = await apiFetch(`/api/search?${params.toString()}`);
      const data = await res.json();
      const elapsed = Math.round(performance.now() - startT);
      if (latencyText) latencyText.textContent = `${elapsed} ms`;

      if (data.success) {
        state.searchTotal = data.total_results || 0;
        if (reset) {
          state.currentSearchResults = data.results || [];
        } else {
          state.currentSearchResults = state.currentSearchResults.concat(data.results || []);
        }

        renderSearchResults(state.currentSearchResults, data.matching_leaks);

        const loaded = state.currentSearchResults.length;
        const total = state.searchTotal;
        const remaining = Math.max(0, total - loaded);

        if (summaryText) {
          summaryText.textContent = query 
            ? `Results for "${query}" (${total} total in ${state.searchMode === "threat_intel" ? "Threat Mode" : "Global Mode"})`
            : `Indexed Darknet Intelligence (${total} total records)`;
        }

        if (loadMoreBtn) {
          if (remaining > 0) {
            loadMoreBtn.classList.remove("hidden");
            loadMoreBtn.textContent = `⬇️ Show More Results (${remaining} remaining)`;
          } else {
            loadMoreBtn.classList.add("hidden");
          }
        }

        if (telemetryText) {
          telemetryText.innerHTML = total > 0 
            ? `⚡ Queried <strong>10 Darknet Search Engines & Directories</strong> (${data.active_engines || 5} active sources) • Showing ${loaded} of ${total} records`
            : "No indexed darknet records match this query and filter criteria.";
        }
      }
    } catch (e) {
      console.error("Search error:", e);
      if (listContainer) {
        listContainer.innerHTML = '<div class="empty-state">Failed to query search engine. Please check connection.</div>';
      }
    }
  }

  function renderSearchResults(results, matchingLeaks) {
    const listContainer = document.getElementById("searchResultsList");
    if (!listContainer) return;

    if (!results || results.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <h4>No Records Found for "${escapeHtml(state.searchQuery)}"</h4>
          <p class="text-muted">Try switching to <strong>Global Darknet Search Mode</strong> or launch a <strong>Deep Service Recon</strong> query across live onion engines.</p>
          <div style="margin-top: 1rem;">
            <button class="primary-btn" onclick="quickLaunchDeepRecon('${escapeHtml(state.searchQuery)}')">
              ⚡ Launch Deep Recon on "${escapeHtml(state.searchQuery)}"
            </button>
          </div>
        </div>
      `;
      return;
    }

    let html = "";
    if (matchingLeaks && matchingLeaks.length > 0) {
      html += `
        <div class="matching-leaks-alert">
          <div class="alert-header">
            <span>🚨 Associated Data Leak Disclosures (${matchingLeaks.length} Breaches Detected)</span>
          </div>
          <div class="alert-body">
            ${matchingLeaks.map(l => `
              <div class="mini-leak-item">
                <strong>${escapeHtml(l.threat_group)}:</strong> ${escapeHtml(l.victim_name)} 
                <span class="badge badge-accent">${escapeHtml(l.victim_country)} • ${escapeHtml(l.victim_sector)}</span>
                <span class="text-sub">(${l.file_size_gb}GB • Score: ${l.urgency_score})</span>
              </div>
            `).join("")}
          </div>
        </div>
      `;
    }

    html += results.map(item => {
      const year = item.indexed_at ? item.indexed_at.substring(0, 4) : "2026";
      const snippet = item.match_snippet || item.snippet || "No preview snippet available.";
      const srcName = item.source || "Indexed Record";
      return `
        <article class="result-card">
          <div class="result-header">
            <div>
              <h4 class="result-title">${escapeHtml(item.title)}</h4>
              <span class="badge badge-source" style="margin-top: 4px; display: inline-block;">📡 ${escapeHtml(srcName)}</span>
            </div>
            <div class="result-badges">
              <span class="badge">${escapeHtml(item.category || "General")}</span>
              <span class="badge badge-accent">${year}</span>
              <span class="relevance-score" title="Intelligence Relevance Score">Score: ${item.relevance_score || 50}</span>
            </div>
          </div>
          <div class="result-url"><code>${escapeHtml(item.url)}</code></div>
          <p class="result-snippet">${snippet}</p>
          <div class="result-footer">
            <span class="text-sub">Indexed: ${formatDate(item.indexed_at)}</span>
            <div class="card-actions">
              <button class="pill-btn" onclick="copyToClipboard('${escapeHtml(item.url)}')">📋 Copy Onion</button>
            </div>
          </div>
        </article>
      `;
    }).join("");

    // Extended search prompt when top 10 finished results
    if (state.searchTotal > 0 && !state.searchExtended) {
      html += `
        <div class="extended-search-box">
          <div class="ext-search-info">
            <span class="ext-icon">⚡</span>
            <div>
              <strong>Queried Top 10 Darknet Search Engines & Directories (${state.searchTotal} Hits)</strong>
              <p class="text-sub">Want to search across 10+ extended darknet archives, deep indexes, and Tor mirrors?</p>
            </div>
          </div>
          <button class="ext-btn" onclick="triggerExtendedSearch()">
            🔄 Deep-Probe Extended Darknet Engines & Archives
          </button>
        </div>
      `;
    } else if (state.searchExtended && state.searchTotal > 0) {
      html += `
        <div class="extended-search-box active-ext">
          <div class="ext-search-info">
            <span class="ext-icon">✅</span>
            <div>
              <strong>Extended Darknet Deep-Probe Active (${state.searchTotal} Total Hits)</strong>
              <p class="text-sub">Results aggregated across all 10+ deep darknet search archives and directory indexes.</p>
            </div>
          </div>
        </div>
      `;
    }

    listContainer.innerHTML = html;
  }

  window.triggerExtendedSearch = function() {
    state.searchExtended = true;
    showToast("🔍 Launching Extended Darknet Search across 10+ archives & directories...", true);
    executeSearch(true);
  };

  // --- TAB 2: DEEP RECON & SERVICE DISCOVERY ---
  async function runServiceRecon(forceFresh = false) {
    const input = document.getElementById("reconQueryInput");
    const query = input ? input.value.trim() : "";
    if (!query) return;

    state.reconQuery = query;
    const scopeSelect = document.getElementById("reconScopeSelect");
    state.reconScope = scopeSelect ? scopeSelect.value : "All Active Engines";

    const progressWrap = document.getElementById("reconProgressWrap");
    const progressStatus = document.getElementById("reconProgressStatus");
    const cacheBar = document.getElementById("reconCacheBar");
    const cacheText = document.getElementById("reconCacheText");
    const resultsContainer = document.getElementById("reconResultsList");
    const summaryText = document.getElementById("reconResultsSummary");
    const durationText = document.getElementById("reconDuration");

    if (progressWrap) progressWrap.classList.remove("hidden");
    if (progressStatus) progressStatus.textContent = forceFresh 
      ? `Conducting fresh live parallel Tor probe across ${state.reconScope} for '${query}'...`
      : `Checking operations cache and probing candidate darknet services for '${query}'...`;

    const startT = performance.now();
    try {
      const res = await apiFetch("/api/recon/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: state.reconQuery,
          force_fresh: forceFresh,
          scope: state.reconScope
        })
      });

      const data = await res.json();
      const elapsed = Math.round(performance.now() - startT);
      if (durationText) durationText.textContent = `${data.duration_ms || elapsed} ms`;

      if (progressWrap) progressWrap.classList.add("hidden");

      if (data.success) {
        state.currentReconResults = data.results || [];
        
        if (data.cached && cacheBar) {
          cacheBar.classList.remove("hidden");
          if (cacheText) {
            cacheText.textContent = `⚡ Loaded from persistent search operations cache (Timestamp: ${formatDate(data.timestamp)} • ${data.sites_live} of ${data.sites_found} sites live).`;
          }
        } else if (cacheBar) {
          cacheBar.classList.add("hidden");
        }

        renderReconResults(state.currentReconResults, query);

        if (data.discovered_engines && data.discovered_engines.length > 0) {
          showDiscoveredEnginesAlert(data.discovered_engines);
        }

        if (summaryText) {
          summaryText.textContent = `Verified Service Discoveries for "${query}" (${data.sites_live} online of ${data.sites_found} found)`;
        }

        // Persist operation locally for immediate access across serverless restarts
        try {
          let localOps = [];
          const localRaw = localStorage.getItem("darkweb_local_recon_ops");
          if (localRaw) localOps = JSON.parse(localRaw);
          localOps = localOps.filter(o => (o.query || "").toLowerCase() !== query.toLowerCase());
          localOps.unshift({
            id: data.cached ? "CACHE" : "LIVE",
            query: query,
            search_scope: state.reconScope || "All Active Engines",
            timestamp: data.timestamp || new Date().toISOString(),
            sites_found: data.sites_found || (data.results ? data.results.length : 0),
            sites_live: data.sites_live || 0,
            duration_ms: data.duration_ms || 120
          });
          if (localOps.length > 25) localOps = localOps.slice(0, 25);
          localStorage.setItem("darkweb_local_recon_ops", JSON.stringify(localOps));
        } catch (_) {}

        loadStats();
        loadReconHistory();
        loadDiscoveredEngines();
      }
    } catch (e) {
      console.error("Recon error:", e);
      if (progressWrap) progressWrap.classList.add("hidden");
      if (resultsContainer) {
        resultsContainer.innerHTML = '<div class="empty-state">Recon probe failed. Check Tor connection and try again.</div>';
      }
    }
  }

  function renderReconResults(results, query) {
    const container = document.getElementById("reconResultsList");
    if (!container) return;

    if (!results || results.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📡</div>
          <h4>No Service Matches Found for "${escapeHtml(query)}"</h4>
          <p class="text-muted">No candidate sites responded over Tor. Try a broader search term or explore curated directories.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = results.map(item => {
      const pClass = `priority-${item.priority || 3}`;
      return `
        <article class="recon-card ${pClass}">
          <div class="recon-card-header">
            <div>
              <h4 class="recon-title">${escapeHtml(item.title)}</h4>
              <span class="badge badge-source" style="margin-top: 4px; display: inline-block;">📡 ${escapeHtml(item.source || 'Darknet Discovery')}</span>
            </div>
            <span class="badge ${item.badge_class || 'badge-info'}">${escapeHtml(item.rank_label)}</span>
          </div>
          <div class="recon-url"><code>${escapeHtml(item.url)}</code></div>
          <div class="recon-evidence">
            <strong>Factual Verification:</strong> ${escapeHtml(item.evidence)}
          </div>
          <p class="recon-snippet">${escapeHtml(item.snippet)}</p>
          <div class="recon-card-footer">
            <span class="text-sub">
              ${item.is_online ? `🟢 Online (${item.latency_ms}ms)` : '🔴 Offline / Circuit Unreachable'}
            </span>
            <div class="card-actions">
              <button class="pill-btn" onclick="copyToClipboard('${escapeHtml(item.url)}')">📋 Copy Onion</button>
            </div>
          </div>
        </article>
      `;
    }).join("");
  }

  window.quickLaunchDeepRecon = function(query) {
    if (!query) return;
    switchTab("reconTab");
    const input = document.getElementById("reconQueryInput");
    if (input) {
      input.value = query;
    }
    runServiceRecon(true);
  };

  function compressOnionUrl(url) {
    if (!url) return "";
    try {
      const u = url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      if (u.length > 26) {
        return u.substring(0, 12) + "..." + u.substring(u.length - 10);
      }
      return u;
    } catch (e) {
      return url.length > 28 ? url.substring(0, 24) + "..." : url;
    }
  }

  // --- DISCOVERED SEARCH ENGINES: ROBUST EVENT-DRIVEN WORKFLOW ---
  function showDiscoveredEnginesAlert(engines) {
    const alertBox = document.getElementById("discoveredEnginesAlert");
    const listContainer = document.getElementById("discoveredEnginesList");
    if (!alertBox || !listContainer) return;

    if (!engines || engines.length === 0) {
      alertBox.classList.add("hidden");
      return;
    }

    // Deduplicate engines by normalized title & base onion domain (keep 1 live)
    const seenTitles = new Set();
    const seenDomains = new Set();
    const uniqueEngines = [];
    engines.forEach(eng => {
      const titleKey = (eng.name || "").toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 25);
      const domMatch = (eng.url || "").match(/[a-z2-7]{16,56}\.onion/);
      const domKey = domMatch ? domMatch[0] : eng.url;
      if (!seenTitles.has(titleKey) && !seenDomains.has(domKey)) {
        seenTitles.add(titleKey);
        seenDomains.add(domKey);
        uniqueEngines.push(eng);
      }
    });

    if (uniqueEngines.length === 0) {
      alertBox.classList.add("hidden");
      return;
    }

    alertBox.classList.remove("hidden");

    // Store in state map by ID and URL
    uniqueEngines.forEach(eng => {
      const key = eng.id || eng.url;
      state.discoveredEnginesMap[key] = eng;
    });

    listContainer.innerHTML = uniqueEngines.map(eng => {
      const key = eng.id || eng.url;
      return `
        <div class="engine-card" id="engineCard_${eng.id || 0}">
          <div class="engine-card-header">
            <div class="engine-info">
              <div class="engine-name">${escapeHtml(eng.name || "Discovered Portal")}</div>
              <div class="engine-url-wrap">
                <code class="compressed-onion-url" title="${escapeHtml(eng.url)}">${compressOnionUrl(eng.url)}</code>
                <button class="copy-sm-btn" onclick="copyToClipboard('${escapeHtml(eng.url)}')" title="Copy Onion Link">📋</button>
              </div>
            </div>
            <span class="badge badge-accent">${escapeHtml(eng.engine_type || "Search Engine")}</span>
          </div>
          <p class="engine-snippet text-muted">${escapeHtml(eng.snippet || "Identified during darknet scan.")}</p>
          <div class="engine-card-actions">
            <button class="pill-btn btn-inspect-engine" data-engine-key="${escapeHtml(String(key))}">
              🔍 Check by Myself
            </button>
            <button class="pill-btn primary btn-add-engine" data-engine-id="${eng.id || 0}" data-engine-url="${escapeHtml(eng.url)}">
              ⚡ Add Directly
            </button>
            <button class="pill-btn secondary btn-ignore-engine" data-engine-id="${eng.id || 0}" data-engine-url="${escapeHtml(eng.url)}">
              🚫 Ignore
            </button>
          </div>
        </div>
      `;
    }).join("");

    // Attach robust event listeners
    listContainer.querySelectorAll(".btn-inspect-engine").forEach(btn => {
      btn.addEventListener("click", () => {
        const key = btn.getAttribute("data-engine-key");
        const eng = state.discoveredEnginesMap[key];
        if (eng) handleInspectEngine(eng);
      });
    });

    listContainer.querySelectorAll(".btn-add-engine").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = parseInt(btn.getAttribute("data-engine-id") || "0");
        const url = btn.getAttribute("data-engine-url");
        await handleQuickAddEngine(id, url);
      });
    });

    listContainer.querySelectorAll(".btn-ignore-engine").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = parseInt(btn.getAttribute("data-engine-id") || "0");
        const url = btn.getAttribute("data-engine-url");
        await handleIgnoreEngine(id, url);
      });
    });
  }

  async function handleIgnoreEngine(id, url) {
    try {
      const res = await apiFetch("/api/recon/approve-engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engine_id: id,
          url: url,
          action: "ignore"
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast("✓ Ignored and dismissed portal", true);
        loadDiscoveredEngines();
        loadStats();
      }
    } catch (e) {
      showToast("Error ignoring engine: " + e.message, false);
    }
  }

  async function loadDiscoveredEngines() {
    try {
      const res = await apiFetch("/api/recon/discovered-engines?reviewed=0");
      const data = await res.json();
      if (data.success && data.engines && data.engines.length > 0) {
        showDiscoveredEnginesAlert(data.engines);
      } else {
        document.getElementById("discoveredEnginesAlert")?.classList.add("hidden");
      }
    } catch (e) {
      console.warn("Error loading discovered engines:", e);
    }
  }

  function handleInspectEngine(eng) {
    state.inspectedEngine = eng;
    document.getElementById("inspectEngineType").textContent = eng.engine_type || "Search Engine";
    document.getElementById("inspectEngineTitle").textContent = eng.name || "Darknet Search Portal";
    document.getElementById("inspectEngineUrl").textContent = eng.url;
    document.getElementById("inspectEngineLatency").textContent = `${eng.latency_ms || 0} ms`;
    document.getElementById("inspectEngineSnippet").textContent = eng.snippet || eng.raw_snippet || "Discovered search portal.";
    document.getElementById("inspectAssignCategory").value = eng.engine_type || "Search Engine";
    openModal("inspectEngineModal");
  }

  async function handleQuickAddEngine(id, url) {
    try {
      const res = await apiFetch("/api/recon/approve-engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engine_id: id,
          url: url,
          action: "add_directly",
          category: "Search Engine"
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`✓ Added ${data.engine?.name || url} directly to monitored targets!`, true);
        loadDiscoveredEngines();
        loadTargets();
        loadStats();
      }
    } catch (e) {
      showToast("Error adding engine: " + e.message, false);
    }
  }

  async function confirmAddDiscoveredEngine() {
    if (!state.inspectedEngine) return;
    const cat = document.getElementById("inspectAssignCategory")?.value || "Search Engine";
    try {
      const res = await apiFetch("/api/recon/approve-engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engine_id: state.inspectedEngine.id || 0,
          url: state.inspectedEngine.url,
          action: "add_directly",
          category: cat
        })
      });
      const data = await res.json();
      if (data.success) {
        closeModal("inspectEngineModal");
        showToast(`✓ Added ${state.inspectedEngine.name || state.inspectedEngine.url} to active project targets!`, true);
        loadDiscoveredEngines();
        loadTargets();
        loadStats();
      }
    } catch (e) {
      showToast("Failed to add target: " + e.message, false);
    }
  }

  async function dismissDiscoveredEngine() {
    if (!state.inspectedEngine) return;
    try {
      await apiFetch("/api/recon/approve-engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engine_id: state.inspectedEngine.id || 0,
          url: state.inspectedEngine.url,
          action: "dismiss"
        })
      });
      closeModal("inspectEngineModal");
      showToast("Dismissed portal from review queue.", true);
      loadDiscoveredEngines();
      loadStats();
    } catch (e) {
      console.warn("Dismiss error:", e);
    }
  }

  // --- TAB 2 HISTORY: PAST RECON OPERATIONS ---
  async function loadReconHistory() {
    const tableBody = document.getElementById("reconHistoryTableBody");
    if (!tableBody) return;

    let ops = [];
    try {
      const res = await apiFetch("/api/recon/operations?limit=25");
      const data = await res.json();
      if (data.success && data.operations) {
        ops = data.operations;
      }
    } catch (e) {
      console.warn("Error loading recon history from API:", e);
    }

    // Merge with any locally stored user recon operations
    try {
      const localRaw = localStorage.getItem("darkweb_local_recon_ops");
      if (localRaw) {
        const localOps = JSON.parse(localRaw);
        const existingQueries = new Set(ops.map(o => (o.query || "").toLowerCase()));
        for (const lo of localOps) {
          if (!existingQueries.has((lo.query || "").toLowerCase())) {
            ops.push(lo);
          }
        }
      }
    } catch (_) {}

    if (ops.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="8" class="text-muted text-center" style="padding:1.5rem;">No past search operations recorded yet.</td></tr>';
      return;
    }

    tableBody.innerHTML = ops.map(op => `
      <tr>
        <td><code>#${op.id || "REC"}</code></td>
        <td><strong>${escapeHtml(op.query)}</strong></td>
        <td><span class="badge">${escapeHtml(op.search_scope || "All Active Engines")}</span></td>
        <td>${formatDate(op.timestamp)}</td>
        <td>${op.sites_found}</td>
        <td><span class="text-accent-green font-bold">${op.sites_live} Live</span></td>
        <td>${op.duration_ms} ms</td>
        <td>
          <button class="pill-btn primary" onclick="reloadReconOperation('${escapeHtml(op.query)}')">
            ⚡ View Cache
          </button>
        </td>
      </tr>
    `).join("");
  }

  window.reloadReconOperation = function(query) {
    const input = document.getElementById("reconQueryInput");
    if (input) input.value = query;
    runServiceRecon(false);
  };

  // --- TAB 3: DIRECTORIES & MASTER LISTS EXPLORER (NEW) ---
  async function loadDirectorySummary() {
    const grid = document.getElementById("directoryCardsGrid");
    if (!grid) return;

    try {
      const res = await apiFetch("/api/directories/summary");
      const data = await res.json();
      if (data.success && data.directories) {
        grid.innerHTML = data.directories.map(dir => {
          const isActive = dir.directory_name === state.selectedDirectory;
          return `
            <div class="directory-card ${isActive ? 'active' : ''}" data-dirname="${escapeHtml(dir.directory_name)}">
              <div class="dir-card-header">
                <span class="dir-name">📁 ${escapeHtml(dir.directory_name)}</span>
                <span class="badge badge-accent">${dir.total_links} Links</span>
              </div>
              <code class="text-mono" style="font-size:0.72rem; color:var(--accent-blue); word-break:break-all;">${escapeHtml(dir.directory_url)}</code>
              <div class="dir-card-stats">
                <span class="badge badge-engine">🔍 ${dir.engine_count} Engines</span>
                <span class="badge badge-forum">💬 ${dir.forum_count} Forums</span>
                <span class="badge badge-leak">🚨 ${dir.leak_count} Leaks</span>
              </div>
            </div>
          `;
        }).join("");

        grid.querySelectorAll(".directory-card").forEach(card => {
          card.addEventListener("click", () => {
            const dirName = card.getAttribute("data-dirname");
            state.selectedDirectory = dirName;
            grid.querySelectorAll(".directory-card").forEach(c => c.classList.remove("active"));
            card.classList.add("active");

            const title = document.getElementById("currentDirectoryTitle");
            if (title) title.textContent = `${dirName} Links`;

            loadDirectoryLinks(true);
          });
        });
      }
    } catch (e) {
      console.warn("Error loading directory summary:", e);
    }
  }

  async function loadDirectoryLinks(reset = true) {
    if (reset) {
      state.dirOffset = 0;
      state.currentDirLinks = [];
    }

    const tableBody = document.getElementById("directoryTableBody");
    const loadMoreBtn = document.getElementById("directoryLoadMoreBtn");
    const telemetryText = document.getElementById("directoryTelemetryText");

    if (reset && tableBody) {
      tableBody.innerHTML = '<tr><td colspan="6" class="text-muted text-center" style="padding:1.5rem;"><div class="spinner" style="margin:0 auto 0.5rem;"></div>Filtering directory links...</td></tr>';
    }

    try {
      const params = new URLSearchParams({
        directory_name: state.selectedDirectory,
        category: state.dirCategory,
        search: state.dirSearch,
        offset: state.dirOffset,
        limit: state.dirLimit
      });

      const res = await apiFetch(`/api/directories/links?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        state.dirTotal = data.total || 0;
        if (reset) {
          state.currentDirLinks = data.links || [];
        } else {
          state.currentDirLinks = state.currentDirLinks.concat(data.links || []);
        }

        renderDirectoryLinks(state.currentDirLinks);

        const loaded = state.currentDirLinks.length;
        const total = state.dirTotal;
        const remaining = Math.max(0, total - loaded);

        if (loadMoreBtn) {
          if (remaining > 0) {
            loadMoreBtn.classList.remove("hidden");
            loadMoreBtn.textContent = `⬇️ Show More Directory Links (${remaining} remaining)`;
          } else {
            loadMoreBtn.classList.add("hidden");
          }
        }

        if (telemetryText) {
          telemetryText.textContent = total > 0
            ? `Showing ${loaded} of ${total} links from ${state.selectedDirectory} ${remaining === 0 ? "• All records displayed" : ""}`
            : `No links found matching category and search filter in ${state.selectedDirectory}.`;
        }
      }
    } catch (e) {
      console.error("Directory links error:", e);
      if (tableBody) tableBody.innerHTML = '<tr><td colspan="6" class="empty-state">Failed to load directory links.</td></tr>';
    }
  }

  function renderDirectoryLinks(links) {
    const tableBody = document.getElementById("directoryTableBody");
    if (!tableBody) return;

    if (!links || links.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6" class="text-muted text-center" style="padding:1.5rem;">No onion links found in this directory matching criteria.</td></tr>';
      return;
    }

    tableBody.innerHTML = links.map(item => {
      const inProject = item.already_in_targets === 1;
      const statusClass = item.status === "ONLINE" ? "status-online" : (item.status === "OFFLINE" ? "status-offline" : "status-unknown");
      const statusText = item.status === "ONLINE" ? `🟢 Online (${item.latency_ms}ms)` : (item.status === "OFFLINE" ? "🔴 Offline" : "⚪ Unknown");

      return `
        <tr id="dirRow_${item.id}">
          <td>
            <strong>${escapeHtml(item.title || "Onion Link")}</strong>
            <div style="font-size:0.75rem; color:var(--accent-blue); font-family:var(--font-mono); margin-top:2px;">
              ${escapeHtml(item.target_url)}
            </div>
          </td>
          <td><span class="badge">${escapeHtml(item.category)}</span></td>
          <td class="text-muted" style="max-width:280px; font-size:0.8rem;">${escapeHtml(item.description || "Curated link listing.")}</td>
          <td>
            ${inProject 
              ? '<span class="badge badge-project-active">✅ In Project</span>' 
              : '<span class="badge badge-project-new">✨ New Discovered</span>'}
          </td>
          <td><span class="status-indicator ${statusClass}" id="livenessPill_${item.id}">${statusText}</span></td>
          <td>
            <div class="card-actions">
              <button class="pill-btn btn-strong-probe" data-id="${item.id}" data-url="${escapeHtml(item.target_url)}">
                ⚡ Strong Probe
              </button>
              ${inProject 
                ? '<button class="pill-btn" disabled style="opacity:0.5;">✓ Tracked</button>' 
                : `<button class="pill-btn primary btn-add-catalog" data-id="${item.id}" data-title="${escapeHtml(item.title)}">➕ Add to Project</button>`}
            </div>
          </td>
        </tr>
      `;
    }).join("");

    // Bind row action listeners
    tableBody.querySelectorAll(".btn-strong-probe").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = parseInt(btn.getAttribute("data-id"));
        const url = btn.getAttribute("data-url");
        probeSingleDirectoryLink(id, url, btn);
      });
    });

    tableBody.querySelectorAll(".btn-add-catalog").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = parseInt(btn.getAttribute("data-id"));
        const title = btn.getAttribute("data-title");
        addDirectoryItemToProject(id, title, btn);
      });
    });
  }

  async function probeSingleDirectoryLink(catalogId, url, btnElement) {
    if (btnElement) btnElement.textContent = "⏳ Probing...";
    const pill = document.getElementById(`livenessPill_${catalogId}`);

    try {
      const res = await apiFetch("/api/directories/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalog_id: catalogId, url: url })
      });
      const data = await res.json();
      if (btnElement) btnElement.textContent = "⚡ Strong Probe";
      if (data.success && pill) {
        if (data.status === "ONLINE") {
          pill.className = "status-indicator status-online";
          pill.textContent = `🟢 Online (${data.latency_ms}ms)`;
          showToast(`✓ Link ${url} is ONLINE (${data.latency_ms}ms)`, true);
        } else {
          pill.className = "status-indicator status-offline";
          pill.textContent = "🔴 Offline";
          showToast(`Link ${url} is OFFLINE or unreachable.`, false);
        }
      }
    } catch (e) {
      if (btnElement) btnElement.textContent = "⚡ Strong Probe";
      showToast("Probe failed: " + e.message, false);
    }
  }

  async function addDirectoryItemToProject(catalogId, title, btnElement) {
    if (btnElement) btnElement.textContent = "Adding...";
    try {
      const res = await apiFetch("/api/directories/add-to-targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalog_id: catalogId })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`✓ Added ${title || "link"} to your monitored target matrix!`, true);
        loadDirectoryLinks(false);
        loadTargets();
        loadStats();
      }
    } catch (e) {
      showToast("Failed to add target: " + e.message, false);
    }
  }

  async function runStrongCheckOnVisible() {
    const btn = document.getElementById("strongCheckAllVisibleBtn");
    if (btn) btn.textContent = "⏳ Probing Links over Tor...";

    const rows = document.querySelectorAll("#directoryTableBody tr");
    let checked = 0;
    for (const r of rows) {
      const probeBtn = r.querySelector(".btn-strong-probe");
      if (probeBtn && checked < 15) {
        const id = parseInt(probeBtn.getAttribute("data-id"));
        const url = probeBtn.getAttribute("data-url");
        await probeSingleDirectoryLink(id, url, probeBtn);
        checked++;
      }
    }

    if (btn) btn.textContent = "⚡ Run Strong Check on Visible Links";
    showToast(`Completed strong Tor probe across ${checked} links!`, true);
  }

  async function batchAddVisibleNewSites() {
    const newBtns = document.querySelectorAll("#directoryTableBody .btn-add-catalog");
    const ids = [];
    newBtns.forEach(b => {
      const id = parseInt(b.getAttribute("data-id"));
      if (id) ids.push(id);
    });

    if (ids.length === 0) {
      showToast("All visible links are already added to your project targets!", true);
      return;
    }

    try {
      const res = await apiFetch("/api/directories/batch-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalog_ids: ids.slice(0, 20) })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`✓ Added ${data.added_count} new sites to your active target matrix!`, true);
        loadDirectoryLinks(false);
        loadTargets();
        loadStats();
      }
    } catch (e) {
      showToast("Batch add error: " + e.message, false);
    }
  }

  // --- TAB 4: DATA LEAKS & BREACHES ---
  async function loadLeaks(reset = true) {
    if (reset) {
      state.leaksOffset = 0;
      state.currentLeaks = [];
    }

    const grid = document.getElementById("leaksGrid");
    const loadMoreBtn = document.getElementById("leaksLoadMoreBtn");
    const telemetryText = document.getElementById("leaksTelemetryText");

    if (reset && grid) {
      grid.innerHTML = '<div class="loading-placeholder"><div class="spinner"></div><span>Loading data leaks matrix...</span></div>';
    }

    try {
      const params = new URLSearchParams({
        country: state.leakCountry,
        sort_by: state.sortOrder,
        offset: state.leaksOffset,
        limit: state.leaksLimit
      });

      if (state.leakSearch) params.append("search", state.leakSearch);
      if (state.leakForumType && state.leakForumType !== "All") {
        if (state.leakForumType === "ransomware" || state.leakForumType === "pwn_forums" || state.leakForumType === "cyberwarfare") {
          params.append("forum_type", state.leakForumType);
        } else {
          params.append("threat_group", state.leakForumType);
        }
      }

      if (state.timeRange !== "All" && state.timeRange !== "custom") {
        params.append("year_start", state.timeRange);
        params.append("year_end", state.timeRange);
      } else if (state.timeRange === "custom") {
        if (state.customYearStart) params.append("year_start", state.customYearStart);
        if (state.customYearEnd) params.append("year_end", state.customYearEnd);
      }

      const res = await apiFetch(`/api/leaks?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        state.leaksTotal = data.total || 0;
        if (reset) {
          state.currentLeaks = data.leaks || [];
        } else {
          state.currentLeaks = state.currentLeaks.concat(data.leaks || []);
        }

        renderLeaks(state.currentLeaks);

        const loaded = state.currentLeaks.length;
        const total = state.leaksTotal;
        const remaining = Math.max(0, total - loaded);

        if (loadMoreBtn) {
          if (remaining > 0) {
            loadMoreBtn.classList.remove("hidden");
            loadMoreBtn.textContent = `⬇️ Show Previous Leaks (${remaining} remaining)`;
          } else {
            loadMoreBtn.classList.add("hidden");
          }
        }

        if (telemetryText) {
          telemetryText.textContent = total > 0
            ? `Showing ${loaded} of ${total} recorded disclosures ${remaining === 0 ? "• All historical leaks loaded" : ""}`
            : "No breach disclosures found for this filter criteria.";
        }
      }
    } catch (e) {
      console.error("Leaks error:", e);
      if (grid) grid.innerHTML = '<div class="empty-state">Failed to load data leaks.</div>';
    }
  }

  function renderLeaks(leaks) {
    const grid = document.getElementById("leaksGrid");
    if (!grid) return;

    if (!leaks || leaks.length === 0) {
      grid.innerHTML = '<div class="empty-state">No ransomware disclosures match the selected country/year filter.</div>';
      return;
    }

    grid.innerHTML = leaks.map(leak => {
      const year = leak.leak_date ? leak.leak_date.substring(0, 4) : "2026";
      return `
        <article class="leak-card">
          <div class="leak-card-header">
            <div>
              <span class="threat-group-tag">${escapeHtml(leak.threat_group)}</span>
              <h4 class="victim-title">${escapeHtml(leak.victim_name)}</h4>
            </div>
            <div class="urgency-badge" title="Urgency Score">${leak.urgency_score || 75}</div>
          </div>
          <div class="leak-meta-row">
            <span class="badge badge-accent">${escapeHtml(leak.victim_country || "Regional")}</span>
            <span class="badge">${escapeHtml(leak.victim_sector || "Enterprise")}</span>
            <span class="badge">${year}</span>
            <span class="text-sub font-mono">${leak.file_size_gb || 0} GB</span>
          </div>
          <p class="leak-desc">${escapeHtml(leak.description)}</p>
          <div class="leak-evidence-box">
            <span class="text-sub">Evidence Onion:</span>
            <code class="evidence-url">${escapeHtml(leak.evidence_url || "N/A")}</code>
          </div>
          <div class="leak-footer">
            <span class="text-sub">Date: ${leak.leak_date || "2026-08"}</span>
            <button class="pill-btn" onclick="copyToClipboard('${escapeHtml(leak.evidence_url)}')">📋 Copy Proof</button>
          </div>
        </article>
      `;
    }).join("");
  }

  // --- TAB 5: TARGETS MATRIX ---
  async function loadTargets() {
    const tableBody = document.getElementById("targetsTableBody");
    if (!tableBody) return;

    try {
      const params = new URLSearchParams({
        category: state.targetCategory,
        status: state.targetStatus,
        limit: 150
      });
      const res = await apiFetch(`/api/targets?${params.toString()}`);
      const data = await res.json();
      if (data.success && data.targets) {
        tableBody.innerHTML = data.targets.map(t => {
          const statusClass = t.status === "ONLINE" ? "status-online" : (t.status === "OFFLINE" ? "status-offline" : "status-unknown");
          return `
            <tr>
              <td><strong>${escapeHtml(t.name || "Onion Target")}</strong></td>
              <td><span class="badge">${escapeHtml(t.category)}</span></td>
              <td><span class="status-indicator ${statusClass}">${t.status}</span></td>
              <td>${t.latency_ms ? t.latency_ms + " ms" : "--"}</td>
              <td><span class="relevance-score">${t.relevance_score || 50}</span></td>
              <td><code class="text-mono">${escapeHtml(t.url)}</code></td>
              <td>
                <button class="pill-btn" onclick="probeSingleTarget('${escapeHtml(t.url)}')">⚡ Probe</button>
                <button class="pill-btn" onclick="copyToClipboard('${escapeHtml(t.url)}')">📋 Copy</button>
              </td>
            </tr>
          `;
        }).join("");
      }
    } catch (e) {
      console.warn("Targets error:", e);
    }
  }

  window.probeSingleTarget = async function(url) {
    try {
      const res = await apiFetch("/api/targets/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url, timeout: 15 })
      });
      const data = await res.json();
      showToast(`Probe: ${url} is ${data.status} (${data.latency_ms}ms)`, data.status === "ONLINE");
      loadTargets();
      loadStats();
    } catch (e) {
      showToast("Probe failed: " + e.message, false);
    }
  };

  // --- TAB 6: DISCOVERY CANDIDATE QUEUE ---
  async function loadDiscoveryQueue() {
    const tableBody = document.getElementById("discoveryTableBody");
    if (!tableBody) return;

    try {
      const res = await apiFetch(`/api/discovery?status=${state.discoveryStatus}&limit=50`);
      const data = await res.json();
      if (data.success && data.queue) {
        if (data.queue.length === 0) {
          tableBody.innerHTML = '<tr><td colspan="5" class="text-muted text-center" style="padding:1.5rem;">Queue empty. Click "Harvest from Onion Directory" to extract candidates.</td></tr>';
          return;
        }

        tableBody.innerHTML = data.queue.map(item => `
          <tr>
            <td><code class="text-mono">${escapeHtml(item.url)}</code></td>
            <td><span class="badge">${item.status}</span></td>
            <td>${item.relevance_score || 0}</td>
            <td class="text-muted">${escapeHtml(item.rejection_reason || "Admitted to active index")}</td>
            <td>
              <button class="pill-btn" onclick="copyToClipboard('${escapeHtml(item.url)}')">📋 Copy</button>
            </td>
          </tr>
        `).join("");
      }
    } catch (e) {
      console.warn("Discovery queue error:", e);
    }
  }

  async function runBatchValidation() {
    const btn = document.getElementById("batchValidateBtn");
    if (btn) btn.textContent = "⏳ Inspecting Candidates Over Tor...";
    try {
      const res = await apiFetch("/api/discovery/validate-batch?limit=5", { method: "POST" });
      const data = await res.json();
      if (btn) btn.textContent = "⚡ Run Anti-Noise Inspection Batch";
      loadDiscoveryQueue();
      loadStats();
      loadTargets();
      showToast(`Processed ${data.processed || 0} candidate links through anti-noise filter.`, true);
    } catch (e) {
      if (btn) btn.textContent = "⚡ Run Anti-Noise Inspection Batch";
      showToast("Batch validation error: " + e.message, false);
    }
  }

  // --- TAB 7: SETTINGS & CREDENTIAL SECURITY ---
  async function loadSettings() {
    try {
      const res = await apiFetch("/api/settings");
      const data = await res.json();
      const tokenInput = document.getElementById("tgBotTokenInput");
      const chatInput = document.getElementById("tgChatIdInput");
      const thresholdInput = document.getElementById("alertThresholdInput");
      const cutoffInput = document.getElementById("relevanceCutoffInput");
      const badge = document.getElementById("tgConfiguredBadge");

      if (tokenInput) tokenInput.placeholder = data.telegram_bot_token_masked || "••••••••••••••••";
      if (chatInput) chatInput.value = data.telegram_chat_id_masked || "7195••••";
      if (thresholdInput) thresholdInput.value = data.alert_threshold || 75;
      if (cutoffInput) cutoffInput.value = data.relevance_min_score || 25;

      const savedCustom = localStorage.getItem("darkweb_saved_settings");
      if (savedCustom) {
        try {
          const parsed = JSON.parse(savedCustom);
          if (parsed.alert_threshold && thresholdInput) thresholdInput.value = parsed.alert_threshold;
          if (parsed.relevance_min_score && cutoffInput) cutoffInput.value = parsed.relevance_min_score;
        } catch (_) {}
      }

      if (badge && data.is_configured) {
        badge.textContent = "✓ Protected & Configured";
        badge.className = "badge badge-success";
      }
    } catch (e) {
      console.warn("Settings error:", e);
    }
  }

  async function handleSaveSettings(e) {
    e.preventDefault();
    const tokenVal = document.getElementById("tgBotTokenInput")?.value.trim();
    const chatVal = document.getElementById("tgChatIdInput")?.value.trim();
    const thresholdVal = document.getElementById("alertThresholdInput")?.value;
    const cutoffVal = document.getElementById("relevanceCutoffInput")?.value;
    const statusMsg = document.getElementById("tgStatusMsg");

    const payload = {};
    if (tokenVal && !tokenVal.includes("••••")) payload.telegram_bot_token = tokenVal;
    if (chatVal && !chatVal.includes("••••")) payload.telegram_chat_id = chatVal;
    if (thresholdVal) payload.alert_threshold = parseInt(thresholdVal);
    if (cutoffVal) payload.relevance_min_score = parseInt(cutoffVal);

    try {
      localStorage.setItem("darkweb_saved_settings", JSON.stringify(payload));
      const res = await apiFetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        if (statusMsg) {
          statusMsg.textContent = "✓ Configurations securely updated on local server.";
          statusMsg.className = "status-msg text-accent-green";
        }
        showToast("Settings saved successfully!", true);
        loadSettings();
      }
    } catch (err) {
      if (statusMsg) {
        statusMsg.textContent = "Failed to save: " + err.message;
        statusMsg.className = "status-msg text-accent-red";
      }
    }
  }

  async function handleTestAlert() {
    const btn = document.getElementById("testTgAlertBtn");
    const statusMsg = document.getElementById("tgStatusMsg");
    if (btn) btn.textContent = "📲 Sending...";

    try {
      const res = await apiFetch("/api/test-telegram", { method: "POST" });
      const data = await res.json();
      if (btn) btn.textContent = "📲 Dispatch Test Alert";
      if (data.success) {
        if (statusMsg) {
          statusMsg.textContent = "✓ Test alert dispatched to @egyblackwolfbot! Check Telegram.";
          statusMsg.className = "status-msg text-accent-green";
        }
        showToast("✓ Dispatched alert to @egyblackwolfbot!", true);
      } else {
        if (statusMsg) {
          statusMsg.textContent = "Delivery error: " + (data.error || "Unknown");
          statusMsg.className = "status-msg text-accent-red";
        }
      }
    } catch (e) {
      if (btn) btn.textContent = "📲 Dispatch Test Alert";
      if (statusMsg) {
        statusMsg.textContent = "Failed to send alert: " + e.message;
        statusMsg.className = "status-msg text-accent-red";
      }
    }
  }

  // --- FORMS & MODAL HANDLERS ---
  async function handleAddTarget(e) {
    e.preventDefault();
    const url = document.getElementById("newTargetUrl")?.value.trim();
    const name = document.getElementById("newTargetName")?.value.trim();
    const category = document.getElementById("newTargetCategory")?.value;
    const probeNow = document.getElementById("probeOnAdd")?.checked;

    try {
      const res = await apiFetch("/api/targets/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, name, category, probe_now: probeNow })
      });
      const data = await res.json();
      if (data.success) {
        closeModal("addTargetModal");
        document.getElementById("addTargetForm").reset();
        loadTargets();
        loadStats();
        showToast(`✓ Added ${url} (Status: ${data.status})`, true);
      }
    } catch (err) {
      showToast("Failed to add target: " + err.message, false);
    }
  }

  async function handleAddLeak(e) {
    e.preventDefault();
    const threat_group = document.getElementById("leakThreatGroup")?.value.trim();
    const victim_name = document.getElementById("leakVictimName")?.value.trim();
    const victim_country = document.getElementById("leakCountry")?.value;
    const victim_sector = document.getElementById("leakSector")?.value;
    const file_size_gb = parseFloat(document.getElementById("leakSize")?.value || "0");
    const urgency_score = parseInt(document.getElementById("leakScore")?.value || "75");
    const evidence_url = document.getElementById("leakEvidenceUrl")?.value.trim();
    const description = document.getElementById("leakDescription")?.value.trim();
    const notify_telegram = document.getElementById("leakNotifyTg")?.checked;

    try {
      const res = await apiFetch("/api/leaks/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threat_group, victim_name, victim_country, victim_sector,
          file_size_gb, urgency_score, evidence_url, description, notify_telegram
        })
      });
      const data = await res.json();
      if (data.success) {
        closeModal("addLeakModal");
        document.getElementById("addLeakForm").reset();
        loadLeaks(true);
        loadStats();
        showToast(`✓ Logged breach for ${victim_name}! Alert dispatched.`, true);
      }
    } catch (err) {
      showToast("Failed to log leak: " + err.message, false);
    }
  }

  async function handleHarvest(e) {
    e.preventDefault();
    const url = document.getElementById("harvestSourceUrl")?.value.trim();
    const btn = document.getElementById("startHarvestBtn");
    if (btn) btn.textContent = "Scraping over Tor...";

    try {
      const res = await apiFetch("/api/discovery/harvest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url })
      });
      const data = await res.json();
      if (btn) btn.textContent = "Start Harvesting";
      closeModal("harvestModal");
      loadDiscoveryQueue();
      loadStats();
      showToast(`Harvested ${data.new_links_queued || 0} candidate links!`, true);
    } catch (err) {
      if (btn) btn.textContent = "Start Harvesting";
      showToast("Harvesting error: " + err.message, false);
    }
  }

  function openModal(id) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.add("open");
      el.classList.add("active");
    }
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove("open");
      el.classList.remove("active");
    }
  }

  window.copyToClipboard = function(text) {
    navigator.clipboard.writeText(text).then(() => {
      showToast("✓ Copied to clipboard: " + text, true);
    }).catch(() => {
      prompt("Copy onion link:", text);
    });
  };

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatDate(isoStr) {
    if (!isoStr) return "--";
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return isoStr.substring(0, 10);
    }
  }

  // ========================================================
  // POINT 3: TOR CIRCUIT ROTATION (SIGNAL NEWNYM)
  // ========================================================
  async function rotateTorCircuit() {
    const btn = document.getElementById("btnRotateTorCircuit");
    const orig = btn ? btn.innerHTML : "🔄 Rotate Circuit";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = "⏳ Rotating Circuit...";
    }
    showToast("Rotating Tor circuit via ControlPort SIGNAL NEWNYM...", true);

    try {
      const res = await apiFetch("/api/tor/rotate", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        showToast(`✓ New Tor Circuit Active! Exit IP: ${data.exit_ip} (${data.latency_ms}ms)`, true);
        const stText = document.getElementById("torStatusText");
        if (stText) stText.textContent = `Tor Online (${data.latency_ms}ms) • IP: ${data.exit_ip}`;
        const infoIp = document.getElementById("torInfoExitIp");
        if (infoIp) infoIp.textContent = data.exit_ip;
        const infoLat = document.getElementById("torInfoLatency");
        if (infoLat) infoLat.textContent = `${data.latency_ms} ms`;
      } else {
        showToast("Circuit rotation notice: " + (data.control_message || "Completed"), false);
      }
    } catch (e) {
      showToast("Tor rotation failed: " + e.message, false);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = orig;
      }
    }
  }

  // ========================================================
  // CACHE & MEMORY MANAGEMENT
  // ========================================================
  let selectedCacheTarget = "all";
  function promptClearCache(target = "all") {
    selectedCacheTarget = target;
    const txt = document.getElementById("clearCacheModalText");
    if (txt) {
      const labels = {
        recon: "Purge all cached deep recon operations history and reset search_operations.json?",
        indexed: "Flush the BM25 full-text search index and cached indexed pages?",
        discovery: "Purge pending unvalidated links and rejected noise queues?",
        all: "Perform a complete system cache flush (recon ops, BM25 indices, and noise queues)?"
      };
      txt.textContent = labels[target] || labels.all;
    }
    openModal("clearCacheModal");
  }

  async function executeClearCache() {
    const btn = document.getElementById("confirmClearCacheBtn");
    if (btn) btn.textContent = "Purging...";
    try {
      const res = await apiFetch("/api/cache/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: selectedCacheTarget })
      });
      const data = await res.json();
      if (data.success) {
        closeModal("clearCacheModal");
        showToast(`✓ Intelligence cache (${selectedCacheTarget}) purged successfully!`, true);
        loadStats();
        loadReconHistory();
        loadDiscoveryQueue();
        if (selectedCacheTarget === "indexed" || selectedCacheTarget === "all") {
          executeSearch(true);
        }
      }
    } catch (e) {
      showToast("Cache purge error: " + e.message, false);
    } finally {
      if (btn) btn.textContent = "Yes, Purge Cache";
    }
  }

  // ========================================================
  // POINT 1: ONE-CLICK OSINT DOSSIER EXPORTER
  // ========================================================
  function openExportModal(context = "leaks") {
    state.exportContext = context;
    openModal("exportDossierModal");
  }

  function triggerDossierDownload(format) {
    closeModal("exportDossierModal");
    let url = `/api/export/dossier?type=${state.exportContext}&format=${format}`;
    if (state.exportContext === "leaks") {
      if (state.leakCountry && state.leakCountry !== "All") url += `&country=${encodeURIComponent(state.leakCountry)}`;
      if (state.leakSearch) url += `&query=${encodeURIComponent(state.leakSearch)}`;
      if (state.leakForumType && state.leakForumType !== "All") url += `&forum_type=${encodeURIComponent(state.leakForumType)}`;
    } else {
      if (state.searchQuery) url += `&query=${encodeURIComponent(state.searchQuery)}`;
      if (state.searchCountry && state.searchCountry !== "All") url += `&country=${encodeURIComponent(state.searchCountry)}`;
    }

    if (format === "html") {
      window.open(url, "_blank");
    } else {
      const a = document.createElement("a");
      a.href = url;
      a.download = `blackwolf_${state.exportContext}_dossier.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    showToast(`✓ Generating ${format.toUpperCase()} Intelligence Dossier...`, true);
  }

  // ========================================================
  // POINT 2: 24/7 AUTONOMOUS WATCHDOG DAEMON
  // ========================================================
  function _applyWatchdogUI(isActive, intervalMins = 15, statusText = "ARMED") {
    const pillText = document.getElementById("watchdogHeaderText");
    if (pillText) {
      pillText.textContent = isActive ? `24/7 Watchdog: Armed (${intervalMins}m)` : "24/7 Watchdog: Paused";
    }
    const cardBadge = document.getElementById("watchdogStatusCardBadge");
    if (cardBadge) {
      cardBadge.textContent = isActive ? `● Running Autonomous Polling (${statusText})` : "○ Watchdog Paused";
      cardBadge.className = isActive ? "badge badge-success" : "badge badge-warning";
    }
    const toggleBtn = document.getElementById("toggleWatchdogBtn");
    if (toggleBtn) {
      toggleBtn.textContent = isActive ? "Pause Watchdog" : "Resume Watchdog";
      toggleBtn.className = isActive ? "pill-btn danger" : "pill-btn primary";
    }
  }

  async function loadWatchdogStatus() {
    // 1. Instant local restore to guarantee zero reset on page refresh
    const localActive = localStorage.getItem("darkweb_watchdog_active");
    const localInterval = localStorage.getItem("darkweb_watchdog_interval");
    if (localInterval) {
      const intervalSelect = document.getElementById("watchdogIntervalSelect");
      if (intervalSelect) intervalSelect.value = localInterval;
    }
    if (localActive !== null) {
      const isActive = localActive === "true";
      const mins = localInterval ? Math.round(parseInt(localInterval) / 60) : 15;
      _applyWatchdogUI(isActive, mins, "ARMED");
    }

    // 2. Query authoritative backend status
    try {
      const res = await apiFetch("/api/watchdog/status");
      const data = await res.json();
      if (data.success && data.watchdog) {
        const w = data.watchdog;
        let finalActive = w.active;
        if (localActive !== null) {
          finalActive = localActive === "true";
        } else {
          localStorage.setItem("darkweb_watchdog_active", w.active ? "true" : "false");
        }
        const mins = w.interval_minutes || (localInterval ? Math.round(parseInt(localInterval) / 60) : 15);
        const finalStatus = finalActive ? (w.status && w.status !== "PAUSED" ? w.status : "ARMED") : "PAUSED";
        _applyWatchdogUI(finalActive, mins, finalStatus);

        if (localActive !== null && (localActive === "true") !== w.active) {
          apiFetch("/api/watchdog/toggle", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: finalActive, interval_seconds: parseInt(localInterval || "900") })
          }).catch(console.warn);
        }

        const cycles = document.getElementById("watchdogTotalCycles");
        if (cycles) cycles.textContent = w.total_scans_executed || 0;
        const alerts = document.getElementById("watchdogAlertsSent");
        if (alerts) alerts.textContent = w.total_alerts_dispatched || 0;
        const lastRun = document.getElementById("watchdogLastRunTime");
        if (lastRun) lastRun.textContent = w.last_run_time ? formatDate(w.last_run_time) : "Just initialized";
      }
    } catch (e) {
      console.warn("Watchdog status error:", e);
    }
  }

  async function toggleWatchdog() {
    const isCurrentlyResume = document.getElementById("toggleWatchdogBtn")?.textContent.includes("Resume");
    const willBeActive = isCurrentlyResume;
    const interval = parseInt(document.getElementById("watchdogIntervalSelect")?.value || "900");

    // Immediately update local storage and UI
    localStorage.setItem("darkweb_watchdog_active", willBeActive ? "true" : "false");
    localStorage.setItem("darkweb_watchdog_interval", String(interval));
    _applyWatchdogUI(willBeActive, Math.round(interval / 60), willBeActive ? "ARMED" : "PAUSED");

    try {
      const res = await apiFetch("/api/watchdog/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: willBeActive, interval_seconds: interval })
      });
      const data = await res.json();
      if (data.success) {
        showToast(willBeActive ? "✓ 24/7 Autonomous Watchdog resumed." : "Watchdog paused.", true);
        loadWatchdogStatus();
      }
    } catch (e) {
      showToast("Failed to toggle watchdog: " + e.message, false);
    }
  }

  async function triggerWatchdogNow() {
    const btn = document.getElementById("triggerWatchdogNowBtn");
    if (btn) btn.textContent = "⚡ Polling Forums...";
    showToast("Triggering instant 24/7 watchdog scan across monitored DLS/breach forums...", true);
    try {
      const res = await apiFetch("/api/watchdog/trigger-now", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        showToast("✓ Watchdog scan cycle dispatched across forums and targets.", true);
        setTimeout(() => {
          if (btn) btn.textContent = "⚡ Run Instant Scan Cycle";
          loadWatchdogStatus();
          loadLeaks(true);
          loadStats();
        }, 4000);
      }
    } catch (e) {
      if (btn) btn.textContent = "⚡ Run Instant Scan Cycle";
      showToast("Error triggering watchdog: " + e.message, false);
    }
  }

  // ========================================================
  // WATCHLIST KEYWORDS MANAGEMENT
  // ========================================================
  async function loadWatchlistKeywords() {
    const grid = document.getElementById("watchlistKeywordsGrid");
    if (!grid) return;
    try {
      const res = await apiFetch("/api/watchlist/keywords");
      const data = await res.json();
      if (data.success && data.keywords) {
        grid.innerHTML = data.keywords.map(kw => `
          <div class="keyword-tag">
            <span>🎯 <strong>${escapeHtml(kw.keyword)}</strong></span>
            <span class="text-sub" style="font-size:0.7rem;">(${escapeHtml(kw.category)})</span>
            <span class="del-kw" onclick="deleteWatchlistKeyword(${kw.id}, "${escapeHtml(kw.keyword)}")">&times;</span>
          </div>
        `).join("");
      }
    } catch (e) {
      console.warn("Watchlist load error:", e);
    }
  }

  async function handleAddWatchlistKeyword(e) {
    e.preventDefault();
    const input = document.getElementById("newKeywordInput");
    const catInput = document.getElementById("newKeywordCategory");
    const val = input ? input.value.trim() : "";
    const cat = catInput ? catInput.value.trim() : "Critical Infrastructure";
    if (!val) return;

    try {
      const res = await apiFetch("/api/watchlist/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: val, category: cat, notify_telegram: true })
      });
      const data = await res.json();
      if (data.success) {
        input.value = "";
        showToast(`✓ Added "${val}" to proactive threat watchlist!`, true);
        loadWatchlistKeywords();
      } else {
        showToast(data.error || "Failed to add keyword", false);
      }
    } catch (e) {
      showToast("Error adding keyword: " + e.message, false);
    }
  }

  window.deleteWatchlistKeyword = async function(id, name) {
    try {
      const res = await apiFetch(`/api/watchlist/keywords/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        showToast(`Removed "${name}" from watchlist.`, true);
        loadWatchlistKeywords();
      }
    } catch (e) {
      showToast("Failed to delete keyword: " + e.message, false);
    }
  };

  // ========================================================
  // TAB 3: RECURSIVE EXPANSION CIRCUIT HARVESTER
  // ========================================================
  async function harvestLinkLists(customUrl = null) {
    const kwInput = document.getElementById("harvestKeywordInput");
    const kw = customUrl ? "" : (kwInput ? kwInput.value.trim() : "directory");
    const btn = customUrl ? document.getElementById("btnCrawlListUrl") : document.getElementById("btnHarvestLists");
    const origText = btn ? btn.textContent : "";
    if (btn) btn.textContent = "⏳ Crawling over Tor...";

    showToast(customUrl ? "Probing custom list URL over Tor..." : `Discovering darknet lists matching "${kw}"...`, true);

    try {
      const res = await apiFetch("/api/directories/harvest-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: kw, custom_url: customUrl })
      });
      const data = await res.json();
      if (btn) btn.textContent = origText;

      const box = document.getElementById("harvestedResultsBox");
      const title = document.getElementById("harvestedTitle");
      const enginesFound = document.getElementById("harvestedEnginesFound");
      const tbody = document.getElementById("harvestedTableBody");

      if (data.links && data.links.length > 0) {
        state.harvestedLinksCache = data.links;
        if (box) box.classList.remove("hidden");
        if (title) title.textContent = `Extracted Darknet Links (${data.links.length} Candidates from ${customUrl || "Tor Lists"})`;
        if (enginesFound) enginesFound.textContent = `${data.search_engines_found || 0} Search Engines Identified`;

        if (tbody) {
          tbody.innerHTML = data.links.map(l => `
            <tr>
              <td><code>${escapeHtml(l.domain || l.url)}</code></td>
              <td><strong>${escapeHtml(l.title)}</strong></td>
              <td><span class="badge">${escapeHtml(l.category)}</span></td>
              <td>
                ${l.is_search_engine ? "<span class='badge badge-accent'>🔍 Engine</span>" : (l.is_directory ? "<span class='badge badge-warning'>📂 Directory</span>" : "<span class='text-sub'>Service</span>")}
              </td>
              <td class="text-muted" style="max-width:240px; font-size:0.75rem;">${escapeHtml(l.snippet || "")}</td>
            </tr>
          `).join("");
        }
        showToast(`✓ Extracted ${data.links.length} links! ${data.search_engines_found || 0} search engines detected.`, true);
      } else if (data.lists && data.lists.length > 0) {
        showToast(`Discovered ${data.lists.length} darknet list pages. Crawling the primary list...`, true);
        await harvestLinkLists(data.lists[0].url);
      } else {
        showToast("No child links found on this page over Tor circuit.", false);
      }
    } catch (e) {
      if (btn) btn.textContent = origText;
      showToast("List harvesting error: " + e.message, false);
    }
  }

  async function ingestAllHarvestedLinks() {
    if (!state.harvestedLinksCache || state.harvestedLinksCache.length === 0) return;
    const btn = document.getElementById("btnIngestAllHarvested");
    if (btn) btn.textContent = "Ingesting...";

    try {
      const res = await apiFetch("/api/directories/ingest-harvested", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          links: state.harvestedLinksCache,
          source_name: "Darknet Recursive Harvester"
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`⚡ Ingestion Complete! Added ${data.ingested_catalog} links to catalog and ${data.engines_registered} search engines to federation queue!`, true);
        loadDirectorySummary();
        loadDirectoryLinks(true);
        loadDiscoveredEngines();
        loadStats();
        document.getElementById("harvestedResultsBox")?.classList.add("hidden");
      }
    } catch (e) {
      showToast("Ingestion failed: " + e.message, false);
    } finally {
      if (btn) btn.textContent = "⚡ Ingest All to Master Catalog & Engine Pipeline";
    }
  }

  // ========================================================
  // TAB 4: THREAT GROUPS & ADD FORUM TARGET
  // ========================================================
  async function loadThreatGroups() {
    try {
      const res = await apiFetch("/api/leaks/threat-groups");
      const data = await res.json();
      if (data.success && data.groups) {
        const select = document.getElementById("leakForumSelect");
        if (select) {
          const customGroups = data.groups.map(g => `<option value="${escapeHtml(g)}">🎯 ${escapeHtml(g)}</option>`).join("");
          select.innerHTML = `
            <option value="All">All Darknet & Threat Sources (${state.leaksTotal || 55} Disclosures)</option>
            <option value="telegram">📱 Telegram Disclosures Only (Active Threat Channels)</option>
            <option value="ransomware">Ransomware DLS Only (LockBit, RansomHub, Akira, etc.)</option>
            <option value="pwn_forums">Breach & Pwn Forums Only (BreachForums, Exploit.in, Pwned)</option>
            <option value="cyberwarfare">Cyber Warfare & State Disclosures (Tenebris, DarkFox, IRGC)</option>
            ${customGroups}
          `;
        }
      }
    } catch (e) {
      console.warn("Threat groups error:", e);
    }
  }

  async function handleAddForumTarget(e) {
    e.preventDefault();
    const name = document.getElementById("newForumName")?.value.trim();
    const url = document.getElementById("newForumUrl")?.value.trim();
    const cat = document.getElementById("newForumCategory")?.value;
    const score = parseInt(document.getElementById("newForumScore")?.value || "90");
    const country = document.getElementById("newForumCountry")?.value;
    const sector = document.getElementById("newForumSector")?.value;

    if (!name || !url) return;

    try {
      const res = await apiFetch("/api/leaks/add-forum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name,
          url: url,
          category: cat,
          urgency_score: score,
          focus_country: country,
          focus_sector: sector
        })
      });
      const data = await res.json();
      if (data.success) {
        closeModal("addForumModal");
        document.getElementById("addForumForm")?.reset();
        showToast(`✓ Registered new threat forum target: ${name}! Initial Tor probe launched.`, true);
        loadTargets();
        loadThreatGroups();
        loadStats();
      }
    } catch (e) {
      showToast("Failed to add forum: " + e.message, false);
    }
  }

  // ========================================================
  // CUSTOM SEARCH ENGINE / DIRECTORY REGISTRATION
  // ========================================================
  async function handleAddCustomEngine(e) {
    e.preventDefault();
    const name = document.getElementById("newEngineName")?.value.trim();
    const url = document.getElementById("newEngineUrl")?.value.trim();
    const type = document.getElementById("newEngineType")?.value || "Search Engine";
    const desc = document.getElementById("newEngineDesc")?.value.trim() || "";
    const federate = document.getElementById("newEngineFederate")?.checked ?? true;

    if (!name || !url) return;

    try {
      const res = await apiFetch("/api/directories/add-custom-engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name,
          url: url,
          engine_type: type,
          description: desc,
          federate_immediately: federate
        })
      });
      const data = await res.json();
      if (data.success) {
        closeModal("addEngineModal");
        document.getElementById("addEngineForm")?.reset();
        showToast(`✓ Registered custom ${type}: "${name}"! Active in federated matrix.`, true);
        loadDirectorySummary();
        loadDirectoryLinks(true);
        loadTargets();
        loadDiscoveredEngines();
        loadStats();
      } else {
        showToast(data.error || "Failed to register engine", false);
      }
    } catch (e) {
      showToast("Error adding engine: " + e.message, false);
    }
  }

  // ========================================================
  // TELEGRAM LEAK & THREAT CHANNELS MONITOR
  // ========================================================
  async function loadTelegramChannels() {
    const grid = document.getElementById("telegramChannelsGrid");
    const countBadge = document.getElementById("tgChannelsCountBadge");
    if (!grid) return;

    try {
      const res = await apiFetch("/api/telegram/channels");
      const data = await res.json();
      if (data.success && data.channels) {
        if (countBadge) countBadge.textContent = `${data.channels.length} Channels`;
        grid.innerHTML = data.channels.map(ch => {
          const isPriv = ch.is_private === 1;
          const statusClass = isPriv ? "badge-tg-private" : "badge-tg-active";
          const statusText = isPriv ? "🔒 Private Invite Tracked" : "🟢 Active Stream";
          const handleUrl = ch.handle_or_url.startsWith("http") ? ch.handle_or_url : `https://t.me/${ch.channel_handle}`;

          return `
            <div class="tg-channel-card" id="tgCard_${ch.id}">
              <div>
                <div class="tg-card-header">
                  <span class="tg-card-name">${escapeHtml(ch.channel_name)}</span>
                  <span class="badge ${statusClass}">${statusText}</span>
                </div>
                <div class="tg-card-handle">
                  <a href="${escapeHtml(handleUrl)}" target="_blank" rel="noopener noreferrer" style="color:#38bdf8; text-decoration:none;">
                    🔗 ${escapeHtml(ch.channel_handle.startsWith("+") ? "Private Invite Hash" : "@" + ch.channel_handle)}
                  </a>
                </div>
              </div>
              <div class="tg-card-meta">
                <span class="badge" style="background:rgba(56,189,248,0.1); color:#38bdf8; font-size:0.7rem;">👥 ${escapeHtml(ch.subscribers || "Active")}</span>
                <span class="badge badge-tg-leaks" style="font-size:0.7rem;">🚨 ${ch.total_leaks_found || 0} Leaks Discovered</span>
                <span class="badge" style="font-size:0.7rem;">📂 ${escapeHtml(ch.category || "Threat Intel")}</span>
              </div>
              <div class="text-muted" style="font-size:0.75rem; line-height:1.3;">
                ${escapeHtml(ch.notes || "Monitored Telegram leak & threat intelligence source.")}
              </div>
              <div class="tg-card-footer">
                <span class="text-sub" style="font-size:0.7rem;">
                  🕒 ${ch.last_scraped_at ? ch.last_scraped_at.substring(0, 16).replace("T", " ") : "Pending Scan"}
                </span>
                <div class="tg-card-actions">
                  <button class="pill-btn primary btn-sm" onclick="scanSingleTelegramChannel(${ch.id}, this)">
                    ⚡ Scan
                  </button>
                  <button class="pill-btn secondary btn-sm" onclick="deleteTelegramChannel(${ch.id}, '${escapeHtml(ch.channel_name)}')">
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          `;
        }).join("");
      }
    } catch (e) {
      console.warn("Failed to load Telegram channels:", e);
    }
  }

  async function handleAddTelegramChannel(e) {
    e.preventDefault();
    const name = document.getElementById("newTgName")?.value.trim();
    const handle = document.getElementById("newTgHandle")?.value.trim();
    const cat = document.getElementById("newTgCategory")?.value;
    const isPriv = parseInt(document.getElementById("newTgIsPrivate")?.value || "0");
    const notes = document.getElementById("newTgNotes")?.value.trim() || "";

    if (!handle) return;

    try {
      const res = await apiFetch("/api/telegram/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name,
          url_or_handle: handle,
          category: cat,
          is_private: isPriv,
          notes: notes
        })
      });
      const data = await res.json();
      if (data.success) {
        closeModal("addTelegramModal");
        document.getElementById("addTelegramForm")?.reset();
        showToast(`✓ Monitored Telegram channel "${name || handle}" registered!`, true);
        loadTelegramChannels();
      } else {
        showToast(data.error || "Failed to add channel", false);
      }
    } catch (e) {
      showToast("Error adding Telegram channel: " + e.message, false);
    }
  }

  async function handleScanAllTelegramChannels() {
    const btn = document.getElementById("btnScanAllTelegramChannels");
    const origText = btn ? btn.textContent : "";
    if (btn) btn.textContent = "⚡ Scraping Telegram Streams...";
    showToast("Scraping public posts across all monitored threat channels...", true);

    try {
      const res = await apiFetch("/api/telegram/scan", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        showToast(`✓ Telegram Sweep Complete! Extracted ${data.total_new_leaks || 0} new disclosures across ${data.scanned_channels} channels.`, true);
        loadTelegramChannels();
        loadLeaks(true);
        loadStats();
      }
    } catch (e) {
      showToast("Telegram scan error: " + e.message, false);
    } finally {
      if (btn) btn.textContent = origText || "⚡ Scan Telegram Channels Now";
    }
  }

  window.scanSingleTelegramChannel = async function(id, btn) {
    const origText = btn ? btn.textContent : "";
    if (btn) btn.textContent = "⏳...";
    try {
      const res = await apiFetch(`/api/telegram/channels/${id}/scan`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        const found = data.result?.new_leaks_found || 0;
        showToast(`✓ Channel scan complete! Found ${found} new disclosures.`, true);
        loadTelegramChannels();
        if (found > 0) loadLeaks(true);
      }
    } catch (e) {
      showToast("Channel scan error: " + e.message, false);
    } finally {
      if (btn) btn.textContent = origText;
    }
  };

  window.deleteTelegramChannel = async function(id, name) {
    if (!confirm(`Stop monitoring Telegram channel "${name}"?`)) return;
    try {
      const res = await apiFetch(`/api/telegram/channels/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        showToast(`Removed "${name}" from monitored threat channels.`, true);
        loadTelegramChannels();
      }
    } catch (e) {
      showToast("Failed to delete channel: " + e.message, false);
    }
  };

  // ========================================================
  // POINT 5: INTERACTIVE THREAT ENTITY RELATIONSHIP GRAPH
  // ========================================================
  let graphAnimationId = null;
  let graphNodes = [];
  let graphLinks = [];
  let draggedNode = null;
  let hoveredNode = null;

  async function toggleThreatGraphView() {
    const wrap = document.getElementById("threatGraphWrap");
    const grid = document.getElementById("leaksGrid");
    const btn = document.getElementById("btnToggleThreatGraph");
    if (!wrap || !grid) return;

    state.threatGraphActive = !state.threatGraphActive;
    if (state.threatGraphActive) {
      wrap.classList.remove("hidden");
      grid.classList.add("hidden");
      if (btn) btn.textContent = "📋 Disclosures Table View";
      await initThreatEntityGraph();
    } else {
      wrap.classList.add("hidden");
      grid.classList.remove("hidden");
      if (btn) btn.textContent = "🕸️ Threat Entity Graph";
      if (graphAnimationId) cancelAnimationFrame(graphAnimationId);
    }
  }

  async function initThreatEntityGraph() {
    const canvas = document.getElementById("threatGraphCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    canvas.width = canvas.parentElement.clientWidth || 900;
    canvas.height = canvas.parentElement.clientHeight || 480;

    showToast("Mapping Darknet Threat Entity Network Graph...", true);

    try {
      let url = `/api/threat-graph/data?country=${encodeURIComponent(state.leakCountry)}`;
      if (state.leakSearch) url += `&search=${encodeURIComponent(state.leakSearch)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success && data.nodes) {
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const total = data.nodes.length;

        graphNodes = data.nodes.map((n, idx) => {
          const angle = (idx / total) * 2 * Math.PI;
          const dist = n.type === "core" ? 0 : (n.type === "threat_group" ? 110 : (n.type === "victim" ? 200 : 280));
          return {
            ...n,
            x: cx + Math.cos(angle) * dist + (Math.random() - 0.5) * 20,
            y: cy + Math.sin(angle) * dist + (Math.random() - 0.5) * 20,
            vx: 0,
            vy: 0,
            radius: n.type === "core" ? 22 : (n.type === "threat_group" ? 15 : (n.type === "victim" ? 12 : 10))
          };
        });

        const nodeMap = {};
        graphNodes.forEach(n => nodeMap[n.id] = n);
        graphLinks = data.links.map(l => ({
          ...l,
          sourceNode: nodeMap[l.source],
          targetNode: nodeMap[l.target]
        })).filter(l => l.sourceNode && l.targetNode);

        startGraphPhysicsLoop(canvas, ctx);
      }
    } catch (e) {
      showToast("Threat graph error: " + e.message, false);
    }
  }

  function startGraphPhysicsLoop(canvas, ctx) {
    if (graphAnimationId) cancelAnimationFrame(graphAnimationId);
    let simTicks = 0;

    function loop() {
      if (!state.threatGraphActive) {
        if (graphAnimationId) cancelAnimationFrame(graphAnimationId);
        return;
      }

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      // 1. Node repulsion
      for (let i = 0; i < graphNodes.length; i++) {
        for (let j = i + 1; j < graphNodes.length; j++) {
          const a = graphNodes[i];
          const b = graphNodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const minDist = (a.radius + b.radius) * 3.5;
          if (dist < minDist) {
            const force = (minDist - dist) / dist * 0.15;
            if (a !== draggedNode && a.type !== "core") { a.x -= dx * force; a.y -= dy * force; }
            if (b !== draggedNode && b.type !== "core") { b.x += dx * force; b.y += dy * force; }
          }
        }
      }

      // 2. Link spring attraction
      graphLinks.forEach(l => {
        const a = l.sourceNode;
        const b = l.targetNode;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const targetDist = l.sourceNode.type === "core" ? 110 : 90;
        const force = (dist - targetDist) * 0.03;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        if (a !== draggedNode && a.type !== "core") { a.x += fx; a.y += fy; }
        if (b !== draggedNode && b.type !== "core") { b.x += fx; b.y += fy; }
      });

      const coreNode = graphNodes.find(n => n.type === "core");
      if (coreNode && coreNode !== draggedNode) {
        coreNode.x = cx;
        coreNode.y = cy;
      }

      graphNodes.forEach(n => {
        if (n !== draggedNode) {
          n.x = Math.max(n.radius + 10, Math.min(canvas.width - n.radius - 10, n.x));
          n.y = Math.max(n.radius + 10, Math.min(canvas.height - n.radius - 10, n.y));
        }
      });

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw Links
      graphLinks.forEach(l => {
        ctx.beginPath();
        ctx.moveTo(l.sourceNode.x, l.sourceNode.y);
        ctx.lineTo(l.targetNode.x, l.targetNode.y);
        ctx.strokeStyle = "rgba(56, 189, 248, 0.25)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      });

      // Draw Nodes
      graphNodes.forEach(n => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, 2 * Math.PI);

        let fillColor = "#38bdf8";
        let strokeColor = "#0284c7";
        if (n.type === "core") {
          fillColor = "#f59e0b";
          strokeColor = "#fbbf24";
        } else if (n.type === "threat_group") {
          fillColor = "#ef4444";
          strokeColor = "#f87171";
        } else if (n.type === "victim") {
          fillColor = "#06b6d4";
          strokeColor = "#22d3ee";
        } else if (n.type === "country") {
          fillColor = "#10b981";
          strokeColor = "#34d399";
        } else if (n.type === "sector") {
          fillColor = "#8b5cf6";
          strokeColor = "#a78bfa";
        } else if (n.type === "onion_mirror") {
          fillColor = "#3b82f6";
          strokeColor = "#60a5fa";
        }

        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.lineWidth = n === hoveredNode ? 3 : 1.5;
        ctx.strokeStyle = strokeColor;
        ctx.stroke();

        ctx.fillStyle = "#e2e8f0";
        ctx.font = n.type === "core" ? "bold 11px monospace" : "10px monospace";
        ctx.textAlign = "center";
        ctx.fillText(n.label, n.x, n.y + n.radius + 12);
        ctx.restore();
      });

      if (simTicks < 120 || draggedNode) {
        simTicks++;
        graphAnimationId = requestAnimationFrame(loop);
      } else {
        graphAnimationId = null;
      }
    }

    loop();

    canvas.onmousedown = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      draggedNode = graphNodes.find(n => Math.hypot(n.x - mx, n.y - my) <= n.radius + 5);
      if (draggedNode && !graphAnimationId) {
        simTicks = 0;
        graphAnimationId = requestAnimationFrame(loop);
      }
    };

    canvas.onmousemove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      if (draggedNode) {
        draggedNode.x = mx;
        draggedNode.y = my;
        if (!graphAnimationId) {
          simTicks = 0;
          graphAnimationId = requestAnimationFrame(loop);
        }
      } else {
        hoveredNode = graphNodes.find(n => Math.hypot(n.x - mx, n.y - my) <= n.radius + 5);
        canvas.style.cursor = hoveredNode ? "pointer" : "grab";
      }
    };

    canvas.onmouseup = () => { draggedNode = null; };

    canvas.onclick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const clicked = graphNodes.find(n => Math.hypot(n.x - mx, n.y - my) <= n.radius + 5);
      if (clicked) showGraphNodeDetails(clicked);
    };
  }

  function showGraphNodeDetails(node) {
    const card = document.getElementById("threatGraphDetailCard");
    const title = document.getElementById("graphDetailTitle");
    const body = document.getElementById("graphDetailBody");
    if (!card || !body) return;

    card.classList.remove("hidden");
    title.textContent = `${node.type.toUpperCase()}: ${node.label}`;
    body.innerHTML = `
      <div style="font-size:0.8rem; color:var(--text-sub); margin-bottom:8px;">
        <div><strong>Node ID:</strong> <code>${node.id}</code></div>
        <div><strong>Threat Score:</strong> <span class="badge badge-danger">${node.score || 75}/100</span></div>
        <div><strong>Classification:</strong> ${node.type}</div>
      </div>
      <button class="pill-btn primary btn-sm" onclick="filterLeaksByEntity("${escapeHtml(node.label)}")">Filter Disclosures by this Node</button>
    `;
  }

  window.filterLeaksByEntity = function(label) {
    const searchInput = document.getElementById("leakSearchInput");
    if (searchInput) {
      searchInput.value = label;
      state.leakSearch = label;
      loadLeaks(true);
      showToast(`Filtering disclosures by "${label}"`, true);
      toggleThreatGraphView();
    }
  };

  // ========================================================
  // POINT 4: ONION TECHNICAL FINGERPRINT & HEADER INSPECTOR
  // ========================================================
  async function loadOnionTechnicalFingerprint(url) {
    const banner = document.getElementById("fpServerBanner");
    const tech = document.getElementById("fpTechStack");
    const hash = document.getElementById("fpMurmurHash");
    const pgp = document.getElementById("fpPgpBlock");
    const headersTable = document.getElementById("fpHeadersTableBody");

    if (banner) banner.textContent = "Probing over Tor SOCKS5h...";
    if (tech) tech.textContent = "Analyzing headers...";
    if (hash) hash.textContent = "Calculating...";
    if (pgp) pgp.textContent = "Scanning for PGP blocks...";

    try {
      const res = await apiFetch(`/api/onion/fingerprint?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (data.success && data.fingerprint) {
        const fp = data.fingerprint;
        if (banner) banner.textContent = fp.server_banner || "Hidden / Not Disclosed";

        if (tech) {
          tech.innerHTML = (fp.technologies && fp.technologies.length > 0)
            ? fp.technologies.map(t => `<span class="badge badge-accent">${escapeHtml(t)}</span>`).join(" ")
            : "<span class='text-sub'>Standard Web Stack</span>";
        }

        if (hash) {
          hash.textContent = fp.favicon_murmur3 !== null ? fp.favicon_murmur3 : "No favicon extracted";
          hash.setAttribute("data-query", fp.shodan_query || "");
        }

        if (pgp) {
          pgp.textContent = fp.pgp_key_detected ? fp.pgp_key_snippet : "No ASCII armored PGP public key detected in root DOM.";
        }

        if (headersTable) {
          const hKeys = Object.keys(fp.headers || {});
          if (hKeys.length === 0) {
            headersTable.innerHTML = "<tr><td colspan='2' class='text-muted'>No response headers returned.</td></tr>";
          } else {
            headersTable.innerHTML = hKeys.map(k => `
              <tr>
                <td><code>${escapeHtml(k)}</code></td>
                <td><code>${escapeHtml(fp.headers[k])}</code></td>
              </tr>
            `).join("");
          }
        }
      }
    } catch (e) {
      if (banner) banner.textContent = "Fingerprint probe error: " + e.message;
    }
  }

});
