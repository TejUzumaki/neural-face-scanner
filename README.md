# Neural Face Scanner — Reconstruction Studio

A browser-based facial landmark and 2.5D surface reconstruction prototype.

## What it does
- Loads a portrait or uses a live webcam.
- Runs MediaPipe Face Landmarker in the browser (GPU with CPU fallback).
- Builds a triangulated facial surface from detected landmarks.
- Applies the source photograph as a texture for still-image scans.
- Supports orbit rotation, zoom, wireframe and landmark-point overlays.
- Can save still-image scans to local browser storage.

## Important technical boundary
This is a landmark-driven facial surface, not a complete volumetric head reconstruction. It does not infer the back of the skull, hidden geometry, or physically accurate depth. Webcam mode is a live landmark surface preview; it is not a persistent textured scan.

## Run locally
Requires Node.js 18+.

```bash
npm install
npm run dev -- --host 0.0.0.0
```

Open the Vite URL shown in the terminal. Camera access requires localhost or HTTPS and browser permission. The MediaPipe WASM runtime and model are fetched from their configured remote URLs on first load, so the first launch requires internet access.

## Production check

```bash
npm run build
npm run preview -- --host 0.0.0.0
```

## Current limitations
- No full-head reconstruction or hidden-surface inference.
- No GLB/GLTF export in this build.
- Saved scans are local to the current browser profile and may be limited by browser storage quota.

## Vision model loading and local cache

The Face Landmarker model binary is downloaded on first use and cached in the browser's IndexedDB storage for this origin. On later visits, the app reuses that local model binary instead of downloading it again. The MediaPipe WebAssembly runtime and the Face Landmarker instance are still initialized for each page session; an initialized runtime cannot be kept alive across a full page reload. The browser's normal HTTP cache may also reuse the hosted WASM assets.

If the local model cache is cleared, unavailable, or invalid, the app downloads the model again. The upload and camera actions remain visually available during setup and the interface shows whether it is checking the device cache, downloading the model, or initializing the runtime.
