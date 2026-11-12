# Tasks

Working list for the autonomous loop. The loop picks the single
highest-leverage unchecked task, executes it, and checks it off here.

## In progress

- [ ] _(none)_

## Done — Wiki

- [x] Markdown wiki pages linked to nodes: lazy create, separate editor window,
      wikilinks + backlinks, `{{diagram}}` embed, drill down/up, cross-window
      sync, orphan re-link/delete, `click` round trip.

## Backlog — M8 Edge editing (next up)

- [x] Inline-rename an edge label (double-click the edge).
- [x] Delete an edge (select + ⌫, matching node delete).
- [x] Carry edge labels through `toMermaid` / `fromMermaid` (verified by
      `npm test` round-trip).

## Backlog — M9 Offline fonts

- [x] Vendor Inter + JetBrains Mono woff2 into the build (`@fontsource`); drop
      the Google Fonts `<link>`.

## Done

- [x] M0 Foundation — Vite/React/TS + React Flow + Zustand.
- [x] M1 Foldable diagrams — groups, collapse, drill-down.
- [x] M2 Mermaid interop — parser/emitter + live panel.
- [x] M3 Dagre auto-layout — Tidy TB/LR, auto-tidy on import.
- [x] M4 Motion — drag translations, hover, join previews.
- [x] M5 Theming — dark/light, OS default, persisted.
- [x] M6 UI polish — SVG icons, hotkeys, typography, segmented toolbar.
- [x] M7 Persistence — debounced localStorage autosave + restore; file
      export/import; clear canvas.
- [x] M8 Edge editing — inline labels, delete, mermaid label round-trip.
- [x] M9 Offline fonts — self-hosted Inter + JetBrains Mono via @fontsource.
- [x] Shapes + icons — 14 Mermaid-classic shapes, ~70 tech/brand icons
      (Lucide + Simple Icons) in an S picker; checked against real mermaid.
