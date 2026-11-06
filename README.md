# merfolk

A canvas diagramming tool (think Excalidraw / Miro / FigJam) built around
**foldable, drill-down diagrams** that interoperate with **Mermaid**.

## What it does

- **Infinite canvas** — pan, zoom, minimap, drag nodes, draw edges by dragging
  between handles. Built on [React Flow](https://reactflow.dev) (`@xyflow/react`).
- **Origami folding** — any node that has children is a *group*, and an
  unfolded group lies on a sheet of paper wrapping its subtree. Click the
  sheet's dog-eared corner (or select it and press `F`) to fold: the subtree
  slides into the group card and creases flat, leaving a card with its pages
  stacked beneath and a count tab; click the tab to pop it back open. Edges into
  a folded card crease onto the card (dashed, merged as `×n`) so folding never
  loses connections. `[` / `]` fold or unfold the whole diagram one level at a
  time. Nesting is arbitrary depth.
- **Mermaid interop** — the side panel stays in sync with the canvas as Mermaid
  `flowchart` text. Edit the text and **Import → canvas** to parse it back, or
  **Copy** to paste into any Mermaid renderer (GitHub, docs, etc.).
- **Auto-layout (dagre)** — **Tidy ↓** / **Tidy →** re-flow the diagram top-down
  or left-right. Only visible nodes are laid out, so collapsing a group re-flows
  the rest. Mermaid imports are tidied automatically.
- **Motion** — nodes ease to their new positions on drag-end and Tidy (drag
  itself tracks the cursor 1:1), lift and glow on hover, and show a live
  animated **join preview** while you drag a new edge — the hovered node pulses
  as the drop target and handles enlarge. All motion respects
  `prefers-reduced-motion`.
- **Shapes** — rectangle, rounded, diamond, circle (mapped to Mermaid
  `[]`, `()`, `{}`, `(())`). Double-click a node to rename.
- **Persistence** — the diagram autosaves to `localStorage` and restores on
  reload, so nothing is lost on refresh. Export / import a `.merfolk.json` file,
  or clear the canvas, from the toolbar.
- **Dark / light themes** — toolbar toggle (☀ / ☾). Follows the OS by default,
  remembers your choice in `localStorage`. The whole UI — canvas, nodes, panel,
  React Flow controls and minimap — is driven by CSS variables + React Flow's
  `colorMode`, so it's a single attribute flip.

## Design

The bar for every screen and API: [`DESIGN.md`](DESIGN.md) — simple purpose,
simple architecture, simple design, simple implementation, no filler text.

## Hotkeys

| Key | Action |
| --- | --- |
| `R` / `O` / `D` / `C` | Add rectangle / rounded / diamond / circle |
| `L` | Tidy top-down |
| `⇧L` | Tidy left-right |
| `T` | Toggle theme |
| `M` | Toggle Mermaid panel |
| `F` | Fold / unfold the selected group (or the sheet a selected node sits on) |
| `[` / `]` | Fold / unfold one level |
| `⌫` / `Del` | Delete selected node(s) |

Shortcuts are suspended while you're typing in a field. Every toolbar button
shows its key in the tooltip.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production bundle to dist/
npm test         # mermaid round-trip + fold logic checks (node --experimental-strip-types)
```

## Architecture

| File | Role |
| --- | --- |
| `src/types.ts` | `Diagram` data model: flat nodes + edges, `parentId` for nesting, `collapsed` flag |
| `src/store.ts` | Zustand store + mutations; `hiddenNodeIds()` derives what a collapse hides |
| `src/mermaid/io.ts` | `fromMermaid` / `toMermaid` — pragmatic flowchart parser + emitter (subgraphs ↔ groups) |
| `src/fold.ts` | Pure fold logic: hidden set, edge creases, fold levels, sheet geometry |
| `src/foldMotion.ts` | Fold / unfold choreography; commits one undo step per fold |
| `src/layout.ts` | Dagre auto-layout over the visible graph; unfolded groups are clusters so sheets don't overlap |
| `src/theme.ts` | Theme store: OS default, `localStorage` persistence, `<html data-theme>` flip |
| `src/persist.ts` | Diagram autosave/restore + `.merfolk.json` export/import |
| `src/components/DiagramNode.tsx` | Custom React Flow node: shapes, inline rename, folded-card tab |
| `src/components/SheetNode.tsx` | Paper sheet behind an unfolded group, with the dog-ear fold control |
| `src/components/Icon.tsx` | Inline-SVG icon set (currentColor, theme-aware) |
| `src/useHotkeys.ts` | Global keyboard shortcuts, suspended while typing |
| `src/components/MermaidPanel.tsx` | Live Mermaid text view + import/copy |
| `src/App.tsx` | Canvas wiring, toolbar, visibility filtering |

## Mermaid support (subset)

Parses the common `flowchart` / `graph` subset: shaped node declarations,
`-->` / `---` edges with optional `|labels|`, and `subgraph … end` blocks
(which become collapsible group nodes). It round-trips everything merfolk
itself produces; exotic Mermaid syntax (styling directives, class defs, etc.)
is ignored rather than erroring.

## Fonts

Inter and JetBrains Mono are self-hosted via `@fontsource` and bundled into the
build, so there's no Google Fonts network dependency and the app renders
correctly offline.

## Next ideas

- Live Mermaid *render* preview using the `mermaid` package
- Undo / redo
- Quick-add a connected node by dragging a handle onto empty canvas
- Shareable URL / embed
