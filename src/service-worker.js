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
  if (message.target === 'background' && message.type === 'progressUpdate') {
    const { status, percent } = message.payload;
    
    if (status === 'downloading' || status === 'loading' || status === 'initializing') {
      chrome.action.setBadgeBackgroundColor({ color: '#e8960c' });
      chrome.action.setBadgeText({ text: `${percent}%` });
    } else if (status === 'ready') {
      chrome.action.setBadgeBackgroundColor({ color: '#4caf50' });
      chrome.action.setBadgeText({ text: 'ON' });
      
      setTimeout(() => {
        chrome.action.setBadgeText({ text: '' });
      }, 3000);
    } else if (status === 'error') {
      chrome.action.setBadgeBackgroundColor({ color: '#f44336' });
      chrome.action.setBadgeText({ text: 'ERR' });
    }
    return false;
  }

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
