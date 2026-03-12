const PLATFORM_CONFIGS = {
  twitter: {
    hostPatterns: ["twitter.com", "x.com"],
    postSelector: 'article[data-testid="tweet"]',
    textSelector: '[data-testid="tweetText"]',
    feedContainerSelector: 'main [role="region"]'
  },
  reddit: {
    hostPatterns: ["www.reddit.com"],
    postSelector: "shreddit-post, div.thing",
    textSelector: '[slot="text-body"], .post-content, [data-click-id="text"] p, .md p',
    feedContainerSelector: 'shreddit-feed, .listing-page, [data-scroller-first]'
  },
  linkedin: {
    hostPatterns: ["www.linkedin.com"],
    postSelector: "div.feed-shared-update-v2",
    textSelector: "div.feed-shared-text",
    feedContainerSelector: "main .scaffold-finite-scroll__content"
  }
};

const PLACEHOLDER_EMOTION = "test-placeholder";

let activePlatform = null;
let postIdCounter = 0;
let feedObserver = null;
const revealedPosts = new Set();

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
  const textNodes = postElement.querySelectorAll(textSelector);
  if (textNodes.length === 0) return "";

  return Array.from(textNodes)
    .map(node => node.innerText.trim())
    .filter(text => text.length > 0)
    .join(" ");
}

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
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
    const urnAttr = postElement.getAttribute("data-urn");
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
      console.log(`[ToneGuard] Revealed: ${fingerprint}`);
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

function processPost(postElement) {
  if (postElement.hasAttribute("data-toneguard-id")) return;

  const postText = extractPostText(postElement, activePlatform.textSelector);
  if (postText.length === 0) return;

  postIdCounter++;
  const postId = `post-${postIdCounter}`;
  postElement.setAttribute("data-toneguard-id", postId);

  const fingerprint = extractPostFingerprint(postElement);

  console.log(`[ToneGuard] ${postId} (${fingerprint}):`, postText.substring(0, 120));

  applyOverlay(postElement, fingerprint, [PLACEHOLDER_EMOTION]);
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
  for (const mutation of mutations) {
    for (const addedNode of mutation.addedNodes) {
      if (addedNode.nodeType !== Node.ELEMENT_NODE) continue;

      if (addedNode.matches && addedNode.matches(activePlatform.postSelector)) {
        processPost(addedNode);
      }

      const nestedPosts = addedNode.querySelectorAll
        ? addedNode.querySelectorAll(activePlatform.postSelector)
        : [];
      nestedPosts.forEach(processPost);
    }
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
  const selectors = activePlatform.feedContainerSelector.split(", ");
  const found = selectors.some(s => document.querySelector(s));

  if (found) {
    scanExistingPosts();
    startObserving();
    return;
  }

  if (retries > 0) {
    requestIdleCallback(() => waitForFeedContainer(retries - 1), { timeout: 1000 });
  } else {
    scanExistingPosts();
    startObserving();
  }
}

function handleNavigation() {
  if (feedObserver) {
    feedObserver.disconnect();
    feedObserver = null;
  }

  waitForFeedContainer();
}

function watchForSPANavigation() {
  let lastUrl = window.location.href;

  const navigationObserver = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      handleNavigation();
    }
  });

  navigationObserver.observe(document.querySelector("head > title") || document.head, {
    childList: true,
    subtree: true,
    characterData: true
  });

  window.addEventListener("popstate", handleNavigation);
}

function initialize() {
  activePlatform = detectPlatform();
  if (!activePlatform) return;

  console.log(`[ToneGuard] Active on ${activePlatform.name}`);

  waitForFeedContainer();
  watchForSPANavigation();
}

initialize();
