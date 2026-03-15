# ToneGuard

Social media is exhausting sometimes. You open Twitter to check one thing and you're three rage-threads deep before you even realize it. I built ToneGuard because I wanted a way to actually control what kind of energy my feed throws at me (part of carnival ysws and it is a bounty 🥲😭) without relying on some company's algorithm to decide what's "healthy" for me.

It's a Chrome extension that runs an emotion detection model right in your browser. It scans posts on Twitter/X, Reddit, and LinkedIn, figures out the emotional tone, and blurs out the ones you don't want to see. You pick which emotions to filter. Everything runs locally — your posts never leave your machine.

## How It Works

There's an NLP model ([Transformers.js](https://huggingface.co/docs/transformers.js) + WebGPU) running in the background that classifies posts against 28 different emotions. If a post hits one of your selected emotions, it gets blurred with an overlay. You can always click through to reveal it — nothing gets deleted, just hidden until you choose to look.

No servers, no API calls, no tracking. Your feed stays yours.

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

*Readme written in collaboration with AI*