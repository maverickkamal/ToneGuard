const progressSection = document.getElementById("progress-section");
const readySection = document.getElementById("ready-section");
const errorSection = document.getElementById("error-section");
const errorMessage = document.getElementById("error-message");
const retryBtn = document.getElementById("retry-btn");
const progressBar = document.getElementById("progress-bar");
const progressPercent = document.getElementById("progress-percent");
const progressStatus = document.getElementById("progress-status");
const masterToggle = document.getElementById("master-toggle");
const clustersContainer = document.getElementById("clusters");

const usernameInput = document.getElementById("username-input");
const usernameAddBtn = document.getElementById("username-add-btn");
const usernamePillsContainer = document.getElementById("username-pills");

const keywordInput = document.getElementById("keyword-input");
const keywordAddBtn = document.getElementById("keyword-add-btn");
const keywordPillsContainer = document.getElementById("keyword-pills");

const blacklistInput = document.getElementById("blacklist-input");
const blacklistAddBtn = document.getElementById("blacklist-add-btn");
const blacklistPillsContainer = document.getElementById("blacklist-pills");

const NEGATIVE_EMOTIONS = [
  "anger", "annoyance", "disappointment", "disapproval", "disgust",
  "embarrassment", "fear", "grief", "nervousness", "remorse", "sadness"
];

const STATUS_LABELS = {
  idle: "Waiting to start...",
  initializing: "Initializing model...",
  downloading: "Downloading model...",
  loading: "Loading model into memory...",
  ready: "Model ready"
};

const STORAGE_KEYS = ["masterEnabled", "enabledEmotions", "whitelistedKeywords", "whitelistedUsernames", "blacklistedKeywords"];

function getDefaults() {
  return {
    masterEnabled: true,
    enabledEmotions: [...NEGATIVE_EMOTIONS],
    whitelistedKeywords: [],
    whitelistedUsernames: [],
    blacklistedKeywords: []
  };
}

async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(STORAGE_KEYS, (data) => {
      const defaults = getDefaults();
      const needsInit = data.masterEnabled === undefined || data.enabledEmotions === undefined;

      const settings = {
        masterEnabled: data.masterEnabled ?? defaults.masterEnabled,
        enabledEmotions: data.enabledEmotions || defaults.enabledEmotions,
        whitelistedKeywords: data.whitelistedKeywords || [],
        whitelistedUsernames: data.whitelistedUsernames || [],
        blacklistedKeywords: data.blacklistedKeywords || []
      };

      if (needsInit) {
        chrome.storage.sync.set(settings);
      }

      resolve(settings);
    });
  });
}

function saveSettings(partial) {
  chrome.storage.sync.set(partial);
}

function applySettingsToUI(settings) {
  masterToggle.checked = settings.masterEnabled;
  updateMasterState(settings.masterEnabled);

  const pills = clustersContainer.querySelectorAll(".emotion-pill");
  pills.forEach(pill => {
    const emotion = pill.getAttribute("data-emotion");
    if (settings.enabledEmotions.includes(emotion)) {
      pill.classList.add("active");
    } else {
      pill.classList.remove("active");
    }
  });

  renderUsernamePills(settings.whitelistedUsernames);
  renderKeywordPills(settings.whitelistedKeywords);
  renderBlacklistPills(settings.blacklistedKeywords);
}

function updateMasterState(enabled) {
  const statusText = readySection.querySelector(".status-text");
  if (enabled) {
    readySection.classList.remove("disabled");
    statusText.textContent = "Active";
  } else {
    readySection.classList.add("disabled");
    statusText.textContent = "Paused";
  }
}

function getEnabledEmotionsFromUI() {
  const pills = clustersContainer.querySelectorAll(".emotion-pill.active");
  return Array.from(pills).map(p => p.getAttribute("data-emotion"));
}

masterToggle.addEventListener("change", () => {
  const enabled = masterToggle.checked;
  updateMasterState(enabled);
  saveSettings({
    masterEnabled: enabled,
    enabledEmotions: getEnabledEmotionsFromUI()
  });
});

clustersContainer.addEventListener("click", (e) => {
  const pill = e.target.closest(".emotion-pill");
  if (!pill) return;

  pill.classList.toggle("active");
  saveSettings({
    masterEnabled: masterToggle.checked,
    enabledEmotions: getEnabledEmotionsFromUI()
  });
});

function sanitizeUsername(raw) {
  return raw.replace(/^@+/, "").trim().toLowerCase();
}

function renderUsernamePills(usernames) {
  usernamePillsContainer.innerHTML = "";
  if (usernames.length === 0) {
    const empty = document.createElement("div");
    empty.className = "whitelist-empty";
    empty.textContent = "No users whitelisted";
    usernamePillsContainer.appendChild(empty);
    return;
  }
  usernames.forEach(username => {
    const pill = document.createElement("div");
    pill.className = "whitelist-pill username-pill";

    const text = document.createElement("span");
    text.className = "whitelist-pill-text";
    text.textContent = `@${username}`;

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.innerHTML = "&times;";
    removeBtn.addEventListener("click", () => removeUsername(username));

    pill.appendChild(text);
    pill.appendChild(removeBtn);
    usernamePillsContainer.appendChild(pill);
  });
}

function renderKeywordPills(keywords) {
  keywordPillsContainer.innerHTML = "";
  if (keywords.length === 0) {
    const empty = document.createElement("div");
    empty.className = "whitelist-empty";
    empty.textContent = "No keywords whitelisted";
    keywordPillsContainer.appendChild(empty);
    return;
  }
  keywords.forEach(keyword => {
    const pill = document.createElement("div");
    pill.className = "whitelist-pill";

    const text = document.createElement("span");
    text.className = "whitelist-pill-text";
    text.textContent = keyword;

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.innerHTML = "&times;";
    removeBtn.addEventListener("click", () => removeKeyword(keyword));

    pill.appendChild(text);
    pill.appendChild(removeBtn);
    keywordPillsContainer.appendChild(pill);
  });
}

function addUsername() {
  const username = sanitizeUsername(usernameInput.value);
  if (!username) return;

  chrome.storage.sync.get(["whitelistedUsernames"], (data) => {
    const usernames = data.whitelistedUsernames || [];
    const exists = usernames.some(u => u.toLowerCase() === username);
    if (exists) {
      usernameInput.value = "";
      return;
    }
    usernames.push(username);
    chrome.storage.sync.set({ whitelistedUsernames: usernames }, () => {
      renderUsernamePills(usernames);
      usernameInput.value = "";
    });
  });
}

function removeUsername(usernameToRemove) {
  chrome.storage.sync.get(["whitelistedUsernames"], (data) => {
    const usernames = (data.whitelistedUsernames || []).filter(u => u !== usernameToRemove);
    chrome.storage.sync.set({ whitelistedUsernames: usernames }, () => {
      renderUsernamePills(usernames);
    });
  });
}

function addKeyword() {
  const keyword = keywordInput.value.trim();
  if (!keyword) return;

  chrome.storage.sync.get(["whitelistedKeywords"], (data) => {
    const keywords = data.whitelistedKeywords || [];
    const exists = keywords.some(k => k.toLowerCase() === keyword.toLowerCase());
    if (exists) {
      keywordInput.value = "";
      return;
    }
    keywords.push(keyword);
    chrome.storage.sync.set({ whitelistedKeywords: keywords }, () => {
      renderKeywordPills(keywords);
      keywordInput.value = "";
    });
  });
}

function removeKeyword(keywordToRemove) {
  chrome.storage.sync.get(["whitelistedKeywords"], (data) => {
    const keywords = (data.whitelistedKeywords || []).filter(k => k !== keywordToRemove);
    chrome.storage.sync.set({ whitelistedKeywords: keywords }, () => {
      renderKeywordPills(keywords);
    });
  });
}

usernameAddBtn.addEventListener("click", addUsername);
usernameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addUsername();
});

keywordAddBtn.addEventListener("click", addKeyword);
keywordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addKeyword();
});

function renderBlacklistPills(keywords) {
  blacklistPillsContainer.innerHTML = "";
  if (keywords.length === 0) {
    const empty = document.createElement("div");
    empty.className = "blacklist-empty";
    empty.textContent = "No words blacklisted";
    blacklistPillsContainer.appendChild(empty);
    return;
  }
  keywords.forEach(keyword => {
    const pill = document.createElement("div");
    pill.className = "blacklist-pill";

    const text = document.createElement("span");
    text.className = "blacklist-pill-text";
    text.textContent = keyword;

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.innerHTML = "&times;";
    removeBtn.addEventListener("click", () => removeBlacklistKeyword(keyword));

    pill.appendChild(text);
    pill.appendChild(removeBtn);
    blacklistPillsContainer.appendChild(pill);
  });
}

function addBlacklistKeyword() {
  const keyword = blacklistInput.value.trim();
  if (!keyword) return;

  chrome.storage.sync.get(["blacklistedKeywords"], (data) => {
    const keywords = data.blacklistedKeywords || [];
    const exists = keywords.some(k => k.toLowerCase() === keyword.toLowerCase());
    if (exists) {
      blacklistInput.value = "";
      return;
    }
    keywords.push(keyword);
    chrome.storage.sync.set({ blacklistedKeywords: keywords }, () => {
      renderBlacklistPills(keywords);
      blacklistInput.value = "";
    });
  });
}

function removeBlacklistKeyword(keywordToRemove) {
  chrome.storage.sync.get(["blacklistedKeywords"], (data) => {
    const keywords = (data.blacklistedKeywords || []).filter(k => k !== keywordToRemove);
    chrome.storage.sync.set({ blacklistedKeywords: keywords }, () => {
      renderBlacklistPills(keywords);
    });
  });
}

blacklistAddBtn.addEventListener("click", addBlacklistKeyword);
blacklistInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addBlacklistKeyword();
});

function showSection(section) {
  progressSection.style.display = "none";
  readySection.style.display = "none";
  errorSection.style.display = "none";
  section.style.display = "flex";
}

function updateProgressUI(progress) {
  const label = STATUS_LABELS[progress.status] || progress.status;

  if (progress.status === "ready") {
    showSection(readySection);
    return;
  }

  if (progress.status === "error") {
    const detail = progress.file || "Both WebGPU and WASM backends failed.";
    errorMessage.textContent = detail;
    showSection(errorSection);
    return;
  }

  showSection(progressSection);

  progressBar.style.width = `${progress.percent}%`;
  progressPercent.textContent = `${progress.percent}%`;

  if (progress.file && progress.status === "downloading") {
    const shortFile = progress.file.split("/").pop();
    progressStatus.textContent = `${label} (${shortFile})`;
  } else {
    progressStatus.textContent = label;
  }
}

function pollProgress() {
  chrome.runtime.sendMessage({ type: "getProgress" }, (response) => {
    if (chrome.runtime.lastError) {
      setTimeout(pollProgress, 1000);
      return;
    }

    if (response) {
      updateProgressUI(response);
    }

    if (!response || (response.status !== "ready" && response.status !== "error")) {
      setTimeout(pollProgress, 500);
    }
  });
}

retryBtn.addEventListener("click", () => {
  showSection(progressSection);
  progressBar.style.width = "0%";
  progressPercent.textContent = "0%";
  progressStatus.textContent = STATUS_LABELS.initializing;
  chrome.runtime.sendMessage({ type: "retryLoad" });
  pollProgress();
});

async function init() {
  const settings = await loadSettings();
  applySettingsToUI(settings);

  chrome.runtime.sendMessage({ type: "ping" });
  pollProgress();
}

init();
