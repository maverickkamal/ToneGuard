let offscreenReady = false;

async function ensureOffscreen() {
  if (offscreenReady) return;

  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (existingContexts.length > 0) {
    offscreenReady = true;
    return;
  }

  await chrome.offscreen.createDocument({
    url: 'offscreen/offscreen.html',
    reasons: ['WORKERS'],
    justification: 'Run Transformers.js NLP inference with WebGPU/WASM support'
  });

  offscreenReady = true;
}

ensureOffscreen();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === 'offscreen') return false;

  if (message.type === 'classify' || message.type === 'ping' || message.type === 'getProgress') {
    ensureOffscreen().then(() => {
      chrome.runtime.sendMessage(
        { ...message, target: 'offscreen' },
        (response) => {
          sendResponse(response);
        }
      );
    }).catch((error) => {
      if (message.type === 'classify') {
        sendResponse({ id: message.id, emotions: [] });
      } else if (message.type === 'ping') {
        sendResponse({ ready: false });
      } else {
        sendResponse({ status: 'error', percent: 0, file: error.message });
      }
    });
    return true;
  }
});
