# ToneGuard

I built ToneGuard because I wanted a more practical way to manage what I see on social media feeds. It's a Chrome extension that classifies post text by emotion directly in the browser and blurs posts that match categories you choose.

It runs on Twitter/X, Reddit, and LinkedIn. You pick which emotions to filter, and you can always reveal a blurred post manually. All processing stays local on your device.

## How It Works

ToneGuard runs an NLP model in the background using [Transformers.js](https://huggingface.co/docs/transformers.js) with WebGPU when available. It classifies posts against 28 different emotions, and if a post matches one of your selected emotions it gets blurred with an overlay. Nothing is deleted — it's only hidden until you choose to reveal it.

There is no backend service for inference: classification happens in the extension with no API calls for post analysis.

## The Model

The extension uses [`kamaludeen/multilingual_go_emotions-ONNX`](https://huggingface.co/kamaludeen/multilingual_go_emotions-ONNX), a multilingual emotion classifier fine-tuned on the GoEmotions dataset (58k Reddit comments, 28 emotion labels).

The original model was exported to ONNX format and quantized to reduce its size for browser delivery. The quantized ONNX model is loaded via Transformers.js which handles download, caching (IndexedDB), and inference through the ONNX Runtime Web backend.

- **Architecture:** BERT-based multilingual transformer
- **Labels:** 28 emotions (multi-label classification)
- **Quantization:** ONNX fp32 via Transformers.js pipeline
- **Inference:** WebGPU preferred, WASM fallback
- **Caching:** Downloaded once, cached in IndexedDB

## Features

- **Emotion filter pills** — toggle which of the 28 emotions trigger hiding
- **Username whitelist** — never hide posts from specific users
- **Keyword whitelist** — skip filtering on posts containing certain words
- **Keyword blacklist** — instantly hide posts with specific words (no model needed)
- **SPA navigation** — detects route changes on Twitter/X and Reddit
- **Retry on failure** — popup shows error state with a retry button if the model fails to load

## Loading the Extension

1. Clone the repo
2. Install dependencies and build:
   ```
   npm install
   npm run build
   ```
3. Open Chrome and go to `chrome://extensions`
4. Enable **Developer mode** (top right)
5. Click **Load unpacked** and select the project folder
6. Navigate to Twitter/X, Reddit, or LinkedIn — ToneGuard activates automatically

The model downloads on first use (~170MB, cached after that). A progress bar shows in the popup.


`src/` contains the source files for the service worker and offscreen document. Run `npm run build` to bundle them into `background/` and `offscreen/` via esbuild.