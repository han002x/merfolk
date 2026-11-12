# Roadmap

Ordered by leverage toward the north star. Each milestone is shippable on its
own and leaves the build green.

## Shipped

- **M0 — Foundation.** Vite + React + TS, React Flow canvas, Zustand store.
- **M1 — Foldable diagrams.** Group nodes, collapse/expand, drill-down
  visibility.
- **M2 — Mermaid interop.** `fromMermaid` / `toMermaid`, live sync panel,
  import/copy.
- **M3 — Auto-layout.** Dagre tidy (TB/LR) over the visible graph; auto-tidy on
  import.
- **M4 — Motion.** Drag translations, hover animation, live join previews.
- **M5 — Theming.** Dark/light, OS default, persisted, single-attribute flip.
- **M6 — UI polish.** SVG icons, hotkeys, Inter/JetBrains typography, segmented
  toolbar.

- **Shapes + icons.** 14 node shapes (all of Mermaid's classic brackets) and a
  curated tech / brand icon set, exported as Mermaid `@{ icon }`; verified
  against the real mermaid parser in `npm test`.

- **Wiki.** Markdown pages per node in their own window, wikilinks, backlinks,
  live sub-diagram embeds, and drill down / drill up between canvas and page.

- **Slides.** Decks per node as Marp / Slidev Markdown: source beside live
  slides, keyboard present mode, speaker notes, live diagram embeds, Markdown
  and print-to-PDF export.

## Next

- **M7 — Persistence.** Autosave the diagram to `localStorage`; restore on load.
  Export / import a `.merfolk.json` file. (Highest leverage: work is currently
  lost on refresh — breaks the "open and build" promise.)
- **M8 — Edge editing.** Rename an edge label inline, delete an edge, choose
  arrowheads. Round-trip labels through Mermaid (already parsed, not yet
  editable).
- **M9 — Offline fonts.** Self-host Inter + JetBrains Mono so first paint and
  offline use don't depend on Google Fonts.
- **M10 — Node ergonomics.** Quick-add a connected node from a handle drag onto
  empty canvas; multi-select move; nest-by-drag into a group.

## Later

- Live Mermaid render preview alongside the text.
- Undo / redo.
- Shareable URL / embed.
