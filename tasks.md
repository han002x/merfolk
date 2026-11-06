# Tasks

Working list for the autonomous loop. The loop picks the single
highest-leverage unchecked task, executes it, and checks it off here.

## In progress

- [ ] _(none)_

## Backlog — M8 Edge editing (next up)

- [ ] Inline-rename an edge label (double-click the edge).
- [ ] Delete an edge (select + ⌫, matching node delete).
- [ ] Carry edge labels through `toMermaid` / `fromMermaid` (parser already
      reads `|label|`).

## Backlog — M9 Offline fonts

- [ ] Vendor Inter + JetBrains Mono woff2 into the build; drop the Google
      Fonts `<link>`.

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
