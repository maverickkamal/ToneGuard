const PLATFORM_CONFIGS = {
  twitter: {
    hostPatterns: ["twitter.com", "x.com"],
    postSelector: 'article[data-testid="tweet"]',
    textSelector: '[data-testid="tweetText"]',
    feedContainerSelector: 'main [role="region"], div[data-testid="primaryColumn"]'
  },
  reddit: {
    hostPatterns: ["www.reddit.com"],
    postSelector: "shreddit-post",
    textSelector: '[slot="text-body"], [slot="title"]',
    feedContainerSelector: 'shreddit-feed, main, div#main-content'
  },
  linkedin: {
    hostPatterns: ["www.linkedin.com"],
    postSelector: '[data-urn], .feed-shared-update-v2, .occludable-update, article',
    textSelector: '.update-components-text, .feed-shared-text, [dir="ltr"], span.break-words, .attributed-text-segment-list__content',
    feedContainerSelector: "main .scaffold-finite-scroll__content, div.scaffold-finite-scroll__content, main"
  }
};

let activePlatform = null;
let postIdCounter = 0;
let feedObserver = null;
let modelReady = false;
const revealedPosts = new Set();
const maxCacheSize = 500;
const resultCache = new Map();
let inferenceQueue = [];
let debounceTimer = null;
const DEBOUNCE_MS = 300;

let whitelistedKeywords = [];
let whitelistedUsernames = [];
let blacklistedKeywords = [];

function detectPlatform() {
  const hostname = window.location.hostname;
  for (const [name, config] of Object.entries(PLATFORM_CONFIGS)) {
    if (config.hostPatterns.some(pattern => hostname.includes(pattern))) {
      return { name, ...config };
    }
  }
  return null;
}

function extractPostText(postElement, textSelector) {
  if (postElement.tagName && postElement.tagName.toLowerCase() === 'shreddit-post') {
    const title = postElement.getAttribute('post-title') || '';
    const bodyNodes = postElement.querySelectorAll('[slot="text-body"]');
    const bodyText = Array.from(bodyNodes)
      .map(node => node.innerText?.trim())
      .filter(text => text && text.length > 0)
      .join(' ');
    return [title.trim(), bodyText].filter(t => t.length > 0).join(' ');
  }

  const textNodes = postElement.querySelectorAll(textSelector);
  if (textNodes.length === 0) return "";

  return Array.from(textNodes)
    .map(node => node.innerText?.trim())
    .filter(text => text && text.length > 0)
    .join(" ");
}

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function extractPostUsername(postElement) {
  if (!activePlatform) return null;

  if (activePlatform.name === "twitter") {
    const userNameContainer = postElement.querySelector('[data-testid="User-Name"]');
    if (userNameContainer) {
      const links = userNameContainer.querySelectorAll('a[role="link"]');
      for (const link of links) {
        const href = link.getAttribute("href");
        if (href && /^\/[A-Za-z0-9_]+$/.test(href)) {
          return href.slice(1).toLowerCase();
        }
      }
    }
  }

  if (activePlatform.name === "reddit") {
    const author = postElement.getAttribute("author");
    if (author) return author.toLowerCase();
    const authorLink = postElement.querySelector('a[href*="/user/"]');
    if (authorLink) {
      const match = authorLink.getAttribute("href").match(/\/user\/([^/?#]+)/);
      if (match) return match[1].toLowerCase();
    }
  }

  if (activePlatform.name === "linkedin") {
    const actorLink = postElement.querySelector(
      'a.app-aware-link[href*="/in/"], .update-components-actor a[href*="/in/"], .feed-shared-actor a[href*="/in/"]'
    );
    if (actorLink) {
      const match = actorLink.getAttribute("href").match(/\/in\/([^/?#]+)/);
      if (match) return match[1].toLowerCase();
    }
  }

  return null;
}

function isWhitelisted(postElement, postText) {
  const username = extractPostUsername(postElement);
  if (username && whitelistedUsernames.includes(username)) return true;

  const normalizedPost = postText.toLowerCase();
  for (const keyword of whitelistedKeywords) {
    if (normalizedPost.includes(keyword)) return true;
  }

  return false;
}

function getBlacklistMatch(postText) {
  const normalizedPost = postText.toLowerCase();
  for (const keyword of blacklistedKeywords) {
    if (normalizedPost.includes(keyword)) return keyword;
  }
  return null;
}

function loadFilterSettings() {
  chrome.storage.sync.get(["whitelistedKeywords", "whitelistedUsernames", "blacklistedKeywords"], (data) => {
    whitelistedKeywords = (data.whitelistedKeywords || []).map(k => k.toLowerCase());
    whitelistedUsernames = (data.whitelistedUsernames || []).map(u => u.toLowerCase());
    blacklistedKeywords = (data.blacklistedKeywords || []).map(k => k.toLowerCase());
  });
}

function extractPostFingerprint(postElement) {
  if (activePlatform.name === "twitter") {
    const permalinkEl = postElement.querySelector('a[href*="/status/"] time')?.parentElement
      || postElement.querySelector('a[href*="/status/"]');
    if (permalinkEl) {
      const href = permalinkEl.getAttribute("href");
      const statusMatch = href && href.match(/\/status\/(\d+)/);
      if (statusMatch) return `tweet-${statusMatch[1]}`;
    }
  }

  if (activePlatform.name === "reddit") {
    const permalink = postElement.getAttribute("permalink")
      || postElement.getAttribute("content-href");
    if (permalink) return `reddit-${permalink}`;
    const idAttr = postElement.getAttribute("id");
    if (idAttr) return `reddit-${idAttr}`;
  }

  if (activePlatform.name === "linkedin") {
    const urnAttr = postElement.getAttribute("data-urn")
      || postElement.closest('[data-urn]')?.getAttribute("data-urn");
    if (urnAttr) return `linkedin-${urnAttr}`;
  }

  const postText = extractPostText(postElement, activePlatform.textSelector);
  if (postText.length > 0) return `text-${normalizeText(postText)}`;

  return null;
}

function createOverlayElement(emotions) {
  const overlay = document.createElement("div");
  overlay.className = "toneguard-overlay";

  const content = document.createElement("div");
  content.className = "toneguard-overlay-content";

  const warningIcon = document.createElement("span");
  warningIcon.className = "toneguard-warning-icon";
  warningIcon.textContent = "⚠";

  const warningLabel = document.createElement("span");
  warningLabel.className = "toneguard-warning-label";
  warningLabel.textContent = `Detected: ${emotions.join(", ")}`;

  const revealButton = document.createElement("button");
  revealButton.className = "toneguard-reveal-button";
  revealButton.textContent = "Reveal Anyway";
  revealButton.addEventListener("click", handleRevealClick);

  content.appendChild(warningIcon);
  content.appendChild(warningLabel);
  content.appendChild(revealButton);
  overlay.appendChild(content);

  return overlay;
}

function handleRevealClick(event) {
  event.stopPropagation();
  event.preventDefault();

  const overlay = event.target.closest(".toneguard-overlay");
  if (!overlay) return;

  const postElement = overlay.parentElement;
  overlay.remove();

  if (postElement) {
    postElement.setAttribute("data-toneguard-revealed", "true");
    const fingerprint = extractPostFingerprint(postElement);
    if (fingerprint) {
      revealedPosts.add(fingerprint);
    }
  }
}

function isPostRevealed(postElement, fingerprint) {
  if (postElement.getAttribute("data-toneguard-revealed") === "true") return true;
  if (fingerprint && revealedPosts.has(fingerprint)) return true;
  return false;
}

function applyOverlay(postElement, fingerprint, emotions) {
  if (isPostRevealed(postElement, fingerprint)) return;
  if (postElement.querySelector(".toneguard-overlay")) return;

  const computedPosition = window.getComputedStyle(postElement).position;
  if (computedPosition === "static") {
    postElement.style.position = "relative";
  }

  const overlay = createOverlayElement(emotions);
  postElement.appendChild(overlay);
}

function processQueue() {
  const queueToProcess = inferenceQueue;
  inferenceQueue = [];

  for (const item of queueToProcess) {
    const { postElement, postId, postText, fingerprint } = item;
    
    if (!document.body.contains(postElement)) continue;

    chrome.runtime.sendMessage(
      { type: "classify", id: postId, text: postText },
      (response) => {
        if (chrome.runtime.lastError) {
          console.warn("[ToneGuard] Message error:", chrome.runtime.lastError.message);
          return;
        }

        if (!response || !response.emotions) return;

        if (fingerprint) {
          resultCache.set(fingerprint, response.emotions);
          if (resultCache.size > maxCacheSize) {
            const firstKey = resultCache.keys().next().value;
            resultCache.delete(firstKey);
          }
        }

        if (response.emotions.length > 0) {
          console.log(`[ToneGuard] ${postId} flagged:`, response.emotions.join(", "));
          applyOverlay(postElement, fingerprint, response.emotions);
        }
      }
    );
  }
}

function processPost(postElement) {
  if (postElement.hasAttribute("data-toneguard-id")) return;

  const postText = extractPostText(postElement, activePlatform.textSelector);
  if (postText.length === 0) return;

  postIdCounter++;
  const postId = `post-${postIdCounter}`;
  postElement.setAttribute("data-toneguard-id", postId);

  const fingerprint = extractPostFingerprint(postElement);

  if (isPostRevealed(postElement, fingerprint)) return;

  const blacklistMatch = getBlacklistMatch(postText);
  if (blacklistMatch) {
    applyOverlay(postElement, fingerprint, [`blocked: "${blacklistMatch}"`]);
    return;
  }

  if (isWhitelisted(postElement, postText)) return;

  if (modelReady) {
    if (fingerprint && resultCache.has(fingerprint)) {
      const cachedEmotions = resultCache.get(fingerprint);
      
      resultCache.delete(fingerprint);
      resultCache.set(fingerprint, cachedEmotions);
      
      if (cachedEmotions.length > 0) {
        applyOverlay(postElement, fingerprint, cachedEmotions);
      }
      return;
    }

    inferenceQueue.push({ postElement, postId, postText, fingerprint });
    
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(processQueue, DEBOUNCE_MS);
  }
}

function scanExistingPosts() {
  const posts = document.querySelectorAll(activePlatform.postSelector);
  posts.forEach(processPost);
}

function findFeedContainer() {
  const selectors = activePlatform.feedContainerSelector.split(", ");
  for (const selector of selectors) {
    const container = document.querySelector(selector);
    if (container) return container;
  }
  return document.body;
}

function handleMutations(mutations) {
  let needsScan = false;
  
  for (const mutation of mutations) {
    if (mutation.addedNodes.length > 0) {
      needsScan = true;
      break;
    }
  }

  if (needsScan) {
    scanExistingPosts();
  }
}

function startObserving() {
  if (feedObserver) {
    feedObserver.disconnect();
  }

  const feedContainer = findFeedContainer();

  feedObserver = new MutationObserver(handleMutations);
  feedObserver.observe(feedContainer, { childList: true, subtree: true });
}

function waitForFeedContainer(retries = 20) {
  scanExistingPosts();

  const selectors = activePlatform.feedContainerSelector.split(", ");
  const found = selectors.some(s => document.querySelector(s));

  if (found) {
    startObserving();
    return;
  }

  if (retries > 0) {
    setTimeout(() => waitForFeedContainer(retries - 1), 500);
  } else {
    startObserving();
  }
}

function handleNavigation() {
  if (feedObserver) {
    feedObserver.disconnect();
    feedObserver = null;
  }

  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  inferenceQueue = [];

  waitForFeedContainer();
}

function watchForSPANavigation() {
  let lastUrl = window.location.href;

  function onUrlChange() {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      handleNavigation();
    }
  }

  const originalPushState = history.pushState;
  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    onUrlChange();
  };

  const originalReplaceState = history.replaceState;
  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    onUrlChange();
  };

  window.addEventListener("popstate", onUrlChange);

  const titleTarget = document.querySelector("head > title") || document.head;
  const navigationObserver = new MutationObserver(onUrlChange);
  navigationObserver.observe(titleTarget, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

function waitForModel() {
  chrome.runtime.sendMessage({ type: "ping" }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn("[ToneGuard] Waiting for model...");
      setTimeout(waitForModel, 2000);
      return;
    }

    if (response && response.ready) {
      modelReady = true;
      console.log("[ToneGuard] Model ready — scanning posts");
      scanExistingPosts();
    } else {
      console.warn("[ToneGuard] Model not ready yet, retrying...");
      setTimeout(waitForModel, 3000);
    }
  });
}

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== "sync") return;
  if (changes.whitelistedKeywords) {
    whitelistedKeywords = (changes.whitelistedKeywords.newValue || []).map(k => k.toLowerCase());
  }
  if (changes.whitelistedUsernames) {
    whitelistedUsernames = (changes.whitelistedUsernames.newValue || []).map(u => u.toLowerCase());
  }
  if (changes.blacklistedKeywords) {
    blacklistedKeywords = (changes.blacklistedKeywords.newValue || []).map(k => k.toLowerCase());
  }
});

function initialize() {
  activePlatform = detectPlatform();
  if (!activePlatform) return;

  console.log(`[ToneGuard] Active on ${activePlatform.name}`);

  loadFilterSettings();
  waitForFeedContainer();
  watchForSPANavigation();
  waitForModel();
}

initialize();
