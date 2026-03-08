/**
 * Ghost Job Tracker - Main Popup Logic
 * P2P anonymous company confidence tracking
 */

// Configuration
const CONFIG = {
  REPORTS_PER_DAY: 10,
  POW_DIFFICULTY: 3,
  GUN_PEERS: [
    "https://gun-us.herokuapp.com/gun",
    "https://peer.wallie.io/gun",
    "https://gundb-relay-mlccl.ondigitalocean.app/gun",
  ],
  EXPERIENCE_IMPACTS: {
    ghosted_application: -15,
    ghosted_contact: -10,
    ghosted_interview: -12,
    interviewed_declined: -3,
    excessive_rounds: -8,
    no_show: -20,
    good_communication: 5,
    respectful_process: 10,
    hired: 15,
  },
};

// State
let gun;
let user;
let keypair;
let companies = {};
let myReports = {};
let cacheTimer = null;

/**
 * Debounced save of companies to local storage for content script access
 */
function scheduleCompanyCache() {
  clearTimeout(cacheTimer);
  cacheTimer = setTimeout(() => {
    chrome.storage.local.set({ companiesCache: companies });
  }, 1000);
}

/**
 * Initialize the extension
 */
async function init() {
  console.log("Initializing Ghost Job Tracker...");

  // Initialize Gun.js
  gun = Gun(CONFIG.GUN_PEERS);

  // Load or generate keypair
  await initKeypair();

  // Load local data
  await loadLocalData();

  // Subscribe to P2P data
  subscribeToData();

  // Setup UI
  setupTabs();
  setupReportForm();
  setupSearch();

  // Update UI
  updateUI();
}

/**
 * Initialize or load keypair
 */
async function initKeypair() {
  const stored = await chrome.storage.local.get(["publicKey", "privateKey"]);

  if (stored.publicKey && stored.privateKey) {
    keypair = {
      publicKey: stored.publicKey,
      privateKey: stored.privateKey,
    };

    // Import keys for signing
    const imported = await CryptoUtils.importKeypair(
      stored.privateKey,
      stored.publicKey,
    );
    keypair.privateKeyObj = imported.privateKey;
    keypair.publicKeyObj = imported.publicKey;

    console.log(
      "Loaded existing keypair:",
      CryptoUtils.shortId(keypair.publicKey),
    );
  } else {
    // Generate new keypair
    keypair = await CryptoUtils.generateKeypair();

    await chrome.storage.local.set({
      publicKey: keypair.publicKey,
      privateKey: keypair.privateKey,
    });

    console.log(
      "Generated new keypair:",
      CryptoUtils.shortId(keypair.publicKey),
    );
  }

  document.getElementById("peerId").textContent = keypair.publicKey;
}

/**
 * Load local data from storage
 */
async function loadLocalData() {
  const stored = await chrome.storage.local.get([
    "myReports",
    "lastReportDate",
    "reportsToday",
  ]);

  myReports = stored.myReports || {};

  // Reset daily counter if new day
  const today = new Date().toDateString();
  if (stored.lastReportDate !== today) {
    await chrome.storage.local.set({
      lastReportDate: today,
      reportsToday: 0,
    });
  }
}

/**
 * Subscribe to Gun.js data with connection monitoring
 */
function subscribeToData() {
  let dataReceived = false;

  // Set a timeout for connection check
  setTimeout(() => {
    if (!dataReceived && Object.keys(companies).length === 0) {
      updateStatus("disconnected");
      console.warn("No data received from peers - may be disconnected");
    }
  }, 5000);

  // Subscribe to companies
  gun
    .get("job-confidence")
    .get("companies")
    .map()
    .on((data, companyId) => {
      if (data && typeof data === "object") {
        dataReceived = true;
        updateStatus("connected");
        companies[companyId] = {
          ...data,
          id: companyId,
        };
        scheduleCompanyCache();
        updateCompanyList();
        updateStats();
      }
    });

  // Subscribe to reports for validation
  gun
    .get("job-confidence")
    .get("reports")
    .map()
    .on(async (report, reportId) => {
      if (report && !report._validated) {
        dataReceived = true;
        await validateAndProcessReport(report, reportId);
      }
    });
}

/**
 * Validate and process incoming report
 */
async function validateAndProcessReport(report, reportId) {
  try {
    // Verify signature
    const reportData = {
      companyId: report.companyId,
      experience: report.experience,
      impact: report.impact,
      timestamp: report.timestamp,
      peerId: report.peerId,
    };

    const isValid = await CryptoUtils.verify(
      reportData,
      report.signature,
      report.peerId,
    );

    if (!isValid) {
      console.warn("Invalid signature for report:", reportId);
      return;
    }

    // Verify proof of work
    const powData = { ...reportData, signature: report.signature };
    const powValid = await CryptoUtils.verifyProofOfWork(
      powData,
      report.nonce,
      report.powHash,
      CONFIG.POW_DIFFICULTY,
    );

    if (!powValid) {
      console.warn("Invalid proof of work for report:", reportId);
      return;
    }

    // Mark as validated locally
    report._validated = true;

    console.log("Validated report:", reportId);
  } catch (e) {
    console.error("Error validating report:", e);
  }
}

/**
 * Setup tab navigation
 */
function setupTabs() {
  const tabs = document.querySelectorAll(".tab");
  const contents = document.querySelectorAll(".tab-content");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const targetId = "tab-" + tab.dataset.tab;

      tabs.forEach((t) => t.classList.remove("active"));
      contents.forEach((c) => c.classList.remove("active"));

      tab.classList.add("active");
      document.getElementById(targetId).classList.add("active");
    });
  });
}

/**
 * Setup report form
 */
function setupReportForm() {
  const companyInput = document.getElementById("companyName");
  const experienceOptions = document.querySelectorAll(
    'input[name="experience"]',
  );
  const submitBtn = document.getElementById("submitReport");

  // Enable submit when both fields are filled
  const checkForm = () => {
    const hasCompany = companyInput.value.trim().length > 0;
    const hasExperience = document.querySelector(
      'input[name="experience"]:checked',
    );
    submitBtn.disabled = !(hasCompany && hasExperience);
  };

  companyInput.addEventListener("input", checkForm);
  experienceOptions.forEach((opt) => opt.addEventListener("change", checkForm));

  // Submit handler
  submitBtn.addEventListener("click", submitReport);
}

/**
 * Setup company search/autocomplete
 */
function setupSearch() {
  const searchInput = document.getElementById("searchInput");
  const companyInput = document.getElementById("companyName");
  const suggestions = document.getElementById("suggestions");

  // Search filter
  searchInput.addEventListener("input", () => {
    updateCompanyList(searchInput.value.trim().toLowerCase());
  });

  // Company autocomplete
  companyInput.addEventListener("input", () => {
    const query = companyInput.value.trim().toLowerCase();

    if (query.length < 2) {
      suggestions.classList.remove("show");
      return;
    }

    const matches = Object.values(companies)
      .filter((c) => c.name && c.name.toLowerCase().includes(query))
      .slice(0, 5);

    if (matches.length > 0) {
      suggestions.innerHTML = matches
        .map(
          (c) =>
            `<div class="suggestion-item" data-name="${c.name}">${c.name}</div>`,
        )
        .join("");
      suggestions.classList.add("show");

      // Click handler
      suggestions.querySelectorAll(".suggestion-item").forEach((item) => {
        item.addEventListener("click", () => {
          companyInput.value = item.dataset.name;
          suggestions.classList.remove("show");
          companyInput.dispatchEvent(new Event("input"));
        });
      });
    } else {
      suggestions.classList.remove("show");
    }
  });

  // Hide suggestions on blur
  companyInput.addEventListener("blur", () => {
    setTimeout(() => suggestions.classList.remove("show"), 200);
  });
}

/**
 * Submit a report
 */
async function submitReport() {
  const companyInput = document.getElementById("companyName");
  const experienceInput = document.querySelector(
    'input[name="experience"]:checked',
  );
  const submitBtn = document.getElementById("submitReport");

  if (!companyInput.value.trim() || !experienceInput) return;

  // Check daily limit
  const stored = await chrome.storage.local.get(["reportsToday"]);
  if ((stored.reportsToday || 0) >= CONFIG.REPORTS_PER_DAY) {
    alert("You have reached your daily report limit (10). Try again tomorrow!");
    return;
  }

  const companyName = companyInput.value.trim();
  const experience = experienceInput.value;
  const impact = CONFIG.EXPERIENCE_IMPACTS[experience];
  const companyId = await CryptoUtils.companyId(companyName);

  // Check if already reported this company
  if (myReports[companyId]) {
    alert("You have already reported this company.");
    return;
  }

  // Show loading state
  submitBtn.classList.add("loading");
  submitBtn.disabled = true;

  try {
    const timestamp = Date.now();

    // Create report data
    const reportData = {
      companyId,
      experience,
      impact,
      timestamp,
      peerId: keypair.publicKey,
    };

    // Sign the report
    const signature = await CryptoUtils.sign(reportData, keypair.privateKeyObj);

    // Compute proof of work
    const powData = { ...reportData, signature };
    const pow = await CryptoUtils.computeProofOfWork(
      powData,
      CONFIG.POW_DIFFICULTY,
    );

    // Generate report ID
    const reportId = await CryptoUtils.hash({
      ...reportData,
      signature,
      nonce: pow.nonce,
    });

    // Full report object
    const report = {
      ...reportData,
      signature,
      nonce: pow.nonce,
      powHash: pow.hash,
    };

    // Check if company exists, if not create it
    const existingCompany = companies[companyId];

    if (!existingCompany) {
      // Create new company entry
      const company = {
        name: companyName,
        confidence: 100 + impact, // Start at 100
        reportCount: 1,
        created: timestamp,
        lastReport: timestamp,
      };

      gun.get("job-confidence").get("companies").get(companyId).put(company);
    } else {
      // Update existing company
      const newConfidence = Math.max(
        0,
        Math.min(200, (existingCompany.confidence || 100) + impact),
      );

      gun
        .get("job-confidence")
        .get("companies")
        .get(companyId)
        .put({
          ...existingCompany,
          confidence: newConfidence,
          reportCount: (existingCompany.reportCount || 0) + 1,
          lastReport: timestamp,
        });
    }

    // Store the report
    gun.get("job-confidence").get("reports").get(reportId).put(report);

    // Update local tracking
    myReports[companyId] = reportId;
    await chrome.storage.local.set({
      myReports,
      reportsToday: (stored.reportsToday || 0) + 1,
    });

    // Update UI
    updateReportsToday();
    updateStats();

    // Reset form
    companyInput.value = "";
    experienceInput.checked = false;
    document
      .querySelectorAll('input[name="experience"]')
      .forEach((i) => (i.checked = false));

    // Switch to list tab
    document.querySelector('.tab[data-tab="list"]').click();

    alert("Report submitted successfully!");
  } catch (e) {
    console.error("Error submitting report:", e);
    alert("Error submitting report: " + e.message);
  } finally {
    submitBtn.classList.remove("loading");
    submitBtn.disabled = false;
  }
}

/**
 * Update the company list UI
 */
function updateCompanyList(filter = "") {
  const listEl = document.getElementById("companyList");
  const sortSelect = document.getElementById("sortSelect");

  let sorted = Object.values(companies).filter((c) => c.name);

  // Apply filter
  if (filter) {
    sorted = sorted.filter((c) => c.name.toLowerCase().includes(filter));
  }

  // Apply sort
  switch (sortSelect.value) {
    case "confidence-desc":
      sorted.sort((a, b) => (a.confidence || 100) - (b.confidence || 100));
      break;
    case "confidence-asc":
      sorted.sort((a, b) => (b.confidence || 100) - (a.confidence || 100));
      break;
    case "reports-desc":
      sorted.sort((a, b) => (b.reportCount || 0) - (a.reportCount || 0));
      break;
    case "recent":
      sorted.sort((a, b) => (b.lastReport || 0) - (a.lastReport || 0));
      break;
  }

  if (sorted.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="icon">📋</div>
        <div class="message">No companies yet. Be the first to report!</div>
      </div>
    `;
    return;
  }

  listEl.innerHTML = sorted
    .map((company) => {
      const confidence = company.confidence || 100;
      const level =
        confidence < 50 ? "low" : confidence < 100 ? "medium" : "high";
      const percentage = Math.min(100, Math.max(0, confidence / 2));

      return `
      <div class="company-card">
        <div class="company-header">
          <span class="company-name">${escapeHtml(company.name)}</span>
          <span class="confidence-badge ${level}">${confidence}</span>
        </div>
        <div class="company-meta">
          <span>📊 ${company.reportCount || 0} reports</span>
          <span>📅 ${formatDate(company.lastReport)}</span>
        </div>
        <div class="confidence-bar">
          <div class="confidence-fill ${level}" style="width: ${percentage}%"></div>
        </div>
      </div>
    `;
    })
    .join("");

  // Re-attach sort listener
  sortSelect.onchange = () => updateCompanyList(filter);
}

/**
 * Update stats tab
 */
function updateStats() {
  const companyList = Object.values(companies).filter((c) => c.name);

  document.getElementById("totalCompanies").textContent = companyList.length;
  document.getElementById("totalReports").textContent = companyList.reduce(
    (sum, c) => sum + (c.reportCount || 0),
    0,
  );
  document.getElementById("yourReports").textContent =
    Object.keys(myReports).length;

  // Worst offenders
  const worst = [...companyList]
    .sort((a, b) => (a.confidence || 100) - (b.confidence || 100))
    .slice(0, 5);

  const worstList = document.getElementById("worstList");
  worstList.innerHTML =
    worst
      .map(
        (c) => `
    <div class="worst-item">
      <span class="name">${escapeHtml(c.name)}</span>
      <span class="score">${c.confidence || 100}</span>
    </div>
  `,
      )
      .join("") || '<div class="empty-state">No data yet</div>';
}

/**
 * Update reports today counter
 */
async function updateReportsToday() {
  const stored = await chrome.storage.local.get(["reportsToday"]);
  const count = stored.reportsToday || 0;
  document.getElementById("reportsToday").textContent =
    `Reports today: ${CONFIG.REPORTS_PER_DAY - count}/${CONFIG.REPORTS_PER_DAY}`;
}

/**
 * Update connection status
 */
function updateStatus(status) {
  const el = document.getElementById("peerStatus");
  if (status === "connected") {
    el.textContent = "🟢 Connected";
    el.classList.add("connected");
    el.classList.remove("disconnected");
  } else if (status === "disconnected") {
    el.textContent = "🔴 Disconnected";
    el.classList.remove("connected");
    el.classList.add("disconnected");
  } else {
    el.textContent = "⏳ Connecting...";
    el.classList.remove("connected", "disconnected");
  }
}

/**
 * Update all UI elements
 */
function updateUI() {
  updateCompanyList();
  updateStats();
  updateReportsToday();

  document.getElementById("lastSync").textContent =
    "Synced: " + new Date().toLocaleTimeString();
}

/**
 * Utility: Escape HTML
 */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Utility: Format date
 */
function formatDate(timestamp) {
  if (!timestamp) return "Never";
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", init);
