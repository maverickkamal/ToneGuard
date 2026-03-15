const OFFSCREEN_DOCUMENT_PATH = '/offscreen/offscreen.html';

async function hasOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
  });
  return existingContexts.length > 0;
}

async function setupOffscreenDocument() {
  if (await hasOffscreenDocument()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: [chrome.offscreen.Reason.WORKERS],
    justification: 'Run AI model inference via WebGPU'
  });
}

const DEFAULT_NEGATIVE = ["anger", "annoyance", "disappointment", "disapproval", "disgust", "embarrassment", "fear", "grief", "nervousness", "remorse", "sadness"];

chrome.runtime.onInstalled.addListener(async () => {
    await setupOffscreenDocument();

    chrome.storage.sync.get(['masterEnabled', 'enabledEmotions', 'whitelistedKeywords', 'whitelistedUsernames', 'blacklistedKeywords'], (result) => {
      const defaults = {};
      if (result.masterEnabled === undefined) defaults.masterEnabled = true;
      if (result.enabledEmotions === undefined) defaults.enabledEmotions = DEFAULT_NEGATIVE;
      if (result.whitelistedKeywords === undefined) defaults.whitelistedKeywords = [];
      if (result.whitelistedUsernames === undefined) defaults.whitelistedUsernames = [];
      if (result.blacklistedKeywords === undefined) defaults.blacklistedKeywords = [];
      if (Object.keys(defaults).length > 0) chrome.storage.sync.set(defaults);
    });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'model_progress') {
    if (message.status === 'ready') {
      chrome.action.setBadgeText({ text: 'ON' });
      chrome.action.setBadgeBackgroundColor({ color: '#16a34a' }); 
      
      chrome.storage.sync.get(['masterEnabled', 'enabledEmotions'], (result) => {
          chrome.runtime.sendMessage({
              target: 'offscreen',
              type: "updateSettings",
              settings: {
                  masterEnabled: result.masterEnabled ?? true,
                  enabledEmotions: result.enabledEmotions || []
              }
          }).catch(() => {});
      });
    } else if (message.status === 'error') {
      chrome.action.setBadgeText({ text: 'ERR' });
      chrome.action.setBadgeBackgroundColor({ color: '#dc2626' }); 
    } else if (message.progress) {
      const percentage = Math.round(message.progress * 100);
      chrome.action.setBadgeText({ text: `${percentage}%` });
      chrome.action.setBadgeBackgroundColor({ color: '#d97706' }); 
    }
    return false;
  }

  if (message.type === 'classify' || message.type === 'ping' || message.type === 'getProgress' || message.type === 'retryLoad') {
    setupOffscreenDocument().then(() => {
      chrome.runtime.sendMessage(
        { ...message, target: 'offscreen' },
        (response) => {
          if (chrome.runtime.lastError) {
            if (message.type === 'classify') {
              sendResponse({ id: message.id, emotions: [] });
            } else if (message.type === 'ping') {
              sendResponse({ ready: false });
            } else {
              sendResponse({ status: 'error' });
            }
            return;
          }
          sendResponse(response);
        }
      );
    }).catch((error) => {
      if (message.type === 'classify') {
        sendResponse({ id: message.id, emotions: [] });
      } else if (message.type === 'ping') {
        sendResponse({ ready: false });
      } else {
        sendResponse({ status: 'error' });
      }
    });
    return true; 
  }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && (changes.masterEnabled || changes.enabledEmotions)) {
         chrome.storage.sync.get(['masterEnabled', 'enabledEmotions'], (result) => {
            chrome.runtime.sendMessage({
                target: 'offscreen',
                type: "updateSettings",
                settings: {
                    masterEnabled: result.masterEnabled ?? true,
                    enabledEmotions: result.enabledEmotions || []
                }
            }).catch(() => {});
         });
    }
});
