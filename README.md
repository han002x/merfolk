# merfolk

A canvas diagramming tool (think Excalidraw / Miro / FigJam) built around
**foldable, drill-down diagrams** that interoperate with **Mermaid**.

## What it does

- **Infinite canvas** — pan, zoom, minimap, drag nodes, draw edges by dragging
  between handles. Built on [React Flow](https://reactflow.dev) (`@xyflow/react`).
- **Collapsible / drill-down groups** — any node that has children is a *group*.
  Click its `▾ / ▸` toggle to collapse the whole subtree, so you can zoom out of
  detail and drill back in. Nesting is arbitrary depth.
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
- **Dark / light themes** — toolbar toggle (☀ / ☾). Follows the OS by default,
  remembers your choice in `localStorage`. The whole UI — canvas, nodes, panel,
  React Flow controls and minimap — is driven by CSS variables + React Flow's
  `colorMode`, so it's a single attribute flip.

## Design

The bar for every screen and API: [`DESIGN.md`](DESIGN.md) — simple purpose,
simple architecture, simple design, simple implementation, no filler text.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production bundle to dist/
```

## Architecture

| File | Role |
| --- | --- |
| `src/types.ts` | `Diagram` data model: flat nodes + edges, `parentId` for nesting, `collapsed` flag |
| `src/store.ts` | Zustand store + mutations; `hiddenNodeIds()` derives what a collapse hides |
| `src/mermaid/io.ts` | `fromMermaid` / `toMermaid` — pragmatic flowchart parser + emitter (subgraphs ↔ groups) |
| `src/layout.ts` | Dagre auto-layout over the visible graph; returns positions keyed by node id |
| `src/theme.ts` | Theme store: OS default, `localStorage` persistence, `<html data-theme>` flip |
| `src/components/DiagramNode.tsx` | Custom React Flow node: shapes, inline rename, collapse toggle |
| `src/components/MermaidPanel.tsx` | Live Mermaid text view + import/copy |
| `src/App.tsx` | Canvas wiring, toolbar, visibility filtering |

## Mermaid support (subset)

Parses the common `flowchart` / `graph` subset: shaped node declarations,
`-->` / `---` edges with optional `|labels|`, and `subgraph … end` blocks
(which become collapsible group nodes). It round-trips everything merfolk
itself produces; exotic Mermaid syntax (styling directives, class defs, etc.)
is ignored rather than erroring.

## Next ideas

- Persist to `localStorage` / file export
- Edge editing (labels, rerouting, delete)
- Live Mermaid *render* preview using the `mermaid` package
