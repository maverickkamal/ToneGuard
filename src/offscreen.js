import { pipeline, env } from '@huggingface/transformers';
import * as ort from 'onnxruntime-web';

env.allowLocalModels = false;


const localLibPath = chrome.runtime.getURL('lib/');
env.backends.onnx.wasm.wasmPaths = localLibPath;
ort.env.wasm.wasmPaths = localLibPath;

const MODEL_NAME = 'kamaludeen/multilingual_go_emotions-ONNX';

const THRESHOLDS = {
  admiration: 0.4,    amusement: 0.35,   anger: 0.15,        annoyance: 0.1,
  approval: 0.2,      caring: 0.15,      confusion: 0.25,    curiosity: 0.25,
  desire: 0.25,       disappointment: 0.1, disapproval: 0.15,  disgust: 0.15,
  embarrassment: 0.1, excitement: 0.15,  fear: 0.15,         gratitude: 0.4,
  grief: 0.05,        joy: 0.25,         love: 0.35,         nervousness: 0.1,
  optimism: 0.25,     pride: 0.05,       realization: 0.15,  relief: 0.05,
  remorse: 0.15,      sadness: 0.15,     surprise: 0.3,      neutral: 0.2
};

let classifier = null;
let modelIsReady = false;
let downloadProgress = { status: 'idle', percent: 0, file: '' };

let masterEnabled = true;
let enabledEmotions = new Set([
  'anger', 'annoyance', 'disappointment', 'disapproval', 'disgust',
  'embarrassment', 'fear', 'grief', 'nervousness', 'remorse', 'sadness'
]);

function progressCallback(progressEvent) {
  if (progressEvent.status === 'progress') {
    const percent = progressEvent.total ? (progressEvent.loaded / progressEvent.total) * 100 : 0;
    downloadProgress = {
      status: 'downloading',
      percent: Math.round(percent),
      file: progressEvent.file || progressEvent.name || ''
    };
  } else if (progressEvent.status === 'done') {
    downloadProgress = { status: 'loading', percent: 100, file: '' };
  } else if (progressEvent.status === 'initiate') {
    downloadProgress = { status: 'downloading', percent: 0, file: progressEvent.file || progressEvent.name || '' };
  }
  
  chrome.runtime.sendMessage({ 
    type: 'model_progress', 
    status: downloadProgress.status,
    progress: downloadProgress.percent / 100
  }).catch(() => {});
}

async function loadModel() {
  if (classifier) return classifier;

  downloadProgress = { status: 'initializing', percent: 0, file: '' };

  try {
    classifier = await pipeline('text-classification', MODEL_NAME, {
      device: 'webgpu',
      dtype: 'fp32',
      topk: null,
      progress_callback: progressCallback
    });
  } catch (webgpuError) {
    try {
      classifier = await pipeline('text-classification', MODEL_NAME, {
        device: 'wasm',
        topk: null,
        progress_callback: progressCallback
      });
    } catch (wasmError) {
      downloadProgress = { status: 'error', percent: 0, file: wasmError.message };
      chrome.runtime.sendMessage({ type: 'model_progress', status: 'error' }).catch(() => {});
      throw wasmError;
    }
  }

  modelIsReady = true;
  downloadProgress = { status: 'ready', percent: 100, file: '' };
  chrome.runtime.sendMessage({ type: 'model_progress', status: 'ready' }).catch(() => {});
  return classifier;
}

function applyThresholds(results) {
  const triggered = [];
  for (const result of results) {
    const emotion = result.label;
    const threshold = THRESHOLDS[emotion];
    if (threshold !== undefined && result.score >= threshold && enabledEmotions.has(emotion)) {
      triggered.push(emotion);
    }
  }
  return triggered;
}

async function classifyText(text) {
  if (!masterEnabled) return [];

  const model = await loadModel();
  const results = await model(text, { topk: null });
  return applyThresholds(results);
}

loadModel().catch(() => {});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return false;

  if (message.type === 'updateSettings') {
    if (message.settings) {
        masterEnabled = message.settings.masterEnabled;
        enabledEmotions = new Set(message.settings.enabledEmotions);
    } else {
        if (message.masterEnabled !== undefined) masterEnabled = message.masterEnabled;
        if (message.enabledEmotions !== undefined) enabledEmotions = new Set(message.enabledEmotions);
    }
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'classify') {
    if (!modelIsReady) {
      sendResponse({ id: message.id, emotions: [] });
      return false;
    }
    classifyText(message.text)
      .then(emotions => sendResponse({ id: message.id, emotions }))
      .catch(() => sendResponse({ id: message.id, emotions: [] }));
    return true;
  }

  if (message.type === 'ping') {
    sendResponse({ ready: modelIsReady });
    return false;
  }

  if (message.type === 'getProgress') {
    sendResponse(downloadProgress);
    return false;
  }
});
