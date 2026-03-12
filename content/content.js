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

let activePlatform = null;
let postIdCounter = 0;
let feedObserver = null;

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

function processPost(postElement) {
  if (postElement.hasAttribute("data-toneguard-id")) return;

  const postText = extractPostText(postElement, activePlatform.textSelector);
  if (postText.length === 0) return;

  postIdCounter++;
  const postId = `post-${postIdCounter}`;
  postElement.setAttribute("data-toneguard-id", postId);

  console.log(`[ToneGuard] ${postId}:`, postText.substring(0, 120));
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
