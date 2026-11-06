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
- **Shapes** — rectangle, rounded, diamond, circle (mapped to Mermaid
  `[]`, `()`, `{}`, `(())`). Double-click a node to rename.

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
- Auto-layout (dagre) for imported Mermaid instead of grid placement
- Edge editing (labels, rerouting, delete)
- Live Mermaid *render* preview using the `mermaid` package
