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

chrome.runtime.onInstalled.addListener(async () => {
    await setupOffscreenDocument();
    
    chrome.storage.sync.get(['masterEnabled', 'enabledEmotions', 'whitelistedKeywords', 'whitelistedUsernames'], (result) => {
      if (result.masterEnabled === undefined) {
          chrome.storage.sync.set({ masterEnabled: true });
      }
      if (result.enabledEmotions === undefined) {
          const defaultNegative = ["anger", "annoyance", "disappointment", "disapproval", "disgust", "embarrassment", "fear", "grief", "nervousness", "remorse", "sadness"];
          chrome.storage.sync.set({ enabledEmotions: defaultNegative });
      }
      if (result.whitelistedKeywords === undefined) {
          chrome.storage.sync.set({ whitelistedKeywords: [] });
      }
      if (result.whitelistedUsernames === undefined) {
          chrome.storage.sync.set({ whitelistedUsernames: [] });
      }
    });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'model_progress') {
    if (message.status === 'ready') {
      chrome.action.setBadgeText({ text: 'ON' });
      chrome.action.setBadgeBackgroundColor({ color: '#16a34a' }); // Green
      
      chrome.storage.sync.get(['masterEnabled', 'enabledEmotions', 'whitelistedKeywords'], (result) => {
          chrome.runtime.sendMessage({
              target: 'offscreen',
              type: "updateSettings",
              settings: {
                  masterEnabled: result.masterEnabled ?? true,
                  enabledEmotions: result.enabledEmotions || [],
                  whitelistedKeywords: result.whitelistedKeywords || []
              }
          }).catch(() => {});
      });
    } else if (message.status === 'error') {
      chrome.action.setBadgeText({ text: 'ERR' });
      chrome.action.setBadgeBackgroundColor({ color: '#dc2626' }); // Red
    } else if (message.progress) {
      const percentage = Math.round(message.progress * 100);
      chrome.action.setBadgeText({ text: `${percentage}%` });
      chrome.action.setBadgeBackgroundColor({ color: '#d97706' }); // Amber
    }
    return false;
  }

  if (message.type === 'classify' || message.type === 'ping' || message.type === 'getProgress') {
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
        // Fallback
        sendResponse({ status: 'error' });
      }
    });
    return true; // Keep channel open for async response
  }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && (changes.masterEnabled || changes.enabledEmotions || changes.whitelistedKeywords || changes.whitelistedUsernames)) {
         chrome.storage.sync.get(['masterEnabled', 'enabledEmotions', 'whitelistedKeywords', 'whitelistedUsernames'], (result) => {
            chrome.runtime.sendMessage({
                target: 'offscreen',
                type: "updateSettings",
                settings: {
                    masterEnabled: result.masterEnabled ?? true,
                    enabledEmotions: result.enabledEmotions || [],
                    whitelistedKeywords: result.whitelistedKeywords || []
                }
            }).catch(() => {});
         });
    }
});
