# README animation

`halloween-demo.gif` records the AI support agent example in Marmerlade's
Halloween appearance. It shows the folded overview, nested retrieval and search
groups, flow playback, and the Mermaid source before returning to the overview.

## Recreate the GIF

Requires the project's npm dependencies, Playwright Chromium, and `ffmpeg` with
`ffprobe` on your PATH.

```bash
npx playwright install chromium
npm run dev
```

With the app running, use a second terminal:

```bash
node demo-materials/capture.mjs
```

Pass the app URL as an argument if Vite uses a different port. The script uses
a clean browser context and the existing example, with compacted positions for
the recording. It selects Halloween through the app's Appearance dialog and
drives the canvas through its visible controls.

The script replaces `halloween-demo.gif`. Raw video, lossless frames, and
checkpoint screenshots go to a temporary directory printed at completion.
Lossless frames keep the GIF's static background stable during compression.
