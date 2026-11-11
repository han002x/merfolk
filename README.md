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
- **Mermaid interop** — the right panel has **Mermaid** and **Tree** tabs.
  Mermaid edits sync live with the canvas. The tree follows subgraph nesting,
  with expandable groups and a connection list. Select nodes or connections in
  the tree, or double-click their labels to rename them; changes update the
  canvas and Mermaid source. **Copy** exports the source for other renderers.
- **Auto-layout (dagre)** — **Tidy ↓** / **Tidy →** re-flow the diagram top-down
  or left-right. Only visible nodes are laid out, so collapsing a group re-flows
  the rest. Mermaid imports are tidied automatically.
- **Motion** — nodes ease to their new positions on drag-end and Tidy (drag
  itself tracks the cursor 1:1), lift and glow on hover, and show a live
  animated **join preview** while you drag a new edge — the hovered node pulses
  as the drop target and handles enlarge. All motion respects
  `prefers-reduced-motion`.
- **Sequenced flow** — **P** plays a pulse along the connections in order: start
  nodes (no incoming edge) first, branches together, each node lighting as the
  pulse lands. `,` / `.` step back and forward, and the speed button cycles
  ½× / 1× / 2×. Select a connection and set its **Flow step** to override the
  order (saved in `.merfolk.json`, not in Mermaid). Folded cards take the pulse
  on their crease edges. **Export GIF** records one loop of a running or
  stepped sequence.
- **Shapes** — rectangle, rounded, diamond and circle on the toolbar; stadium,
  subroutine, cylinder, double circle, hexagon, parallelograms, trapezoids and
  flag in the **S** picker. Each maps to Mermaid's classic bracket syntax, so
  every renderer (GitHub included) draws them. Double-click a node to rename.
- **Icons** — the **S** picker also holds ~30 tech icons (Lucide), ~30 AI
  icons (OpenAI, Claude, Gemini, DeepSeek, Mistral, Hugging Face, Ollama, …)
  and ~40 brand / social logos (Simple Icons), tinted with the node's stroke
  colour.
  They export as Mermaid's v11.3+ icon syntax,
  `A@{ icon: "simple-icons:github", form: "square", label: "GitHub" }`; a
  renderer that hasn't registered that Iconify pack shows a placeholder glyph
  beside the label.
- **Wiki pages** — every node can link multiple Markdown pages, and pages can
  be shared across nodes. Press `W` (or the page button on a node) to open its
  default page in the side panel's **Page** tab. The picker switches pages;
  **New page**, **Link existing page**, **Unlink**, and **Make default** manage
  the links. The first linked page is the default. Opening a node with no pages
  creates one titled from the node; later node renames leave page titles alone.
  ↗ opens the current page in its own window, keeping the node context.
  The editor is raw Markdown
  (CodeMirror) beside a live preview. `[[Node or Page]]` links jump between
  pages (`[[Target|alias]]` supported, `[[` autocompletes), each page lists its
  backlinks, and `{{diagram}}` embeds the node's live sub-diagram. Click a node
  in it, or **Canvas** in the header, to drill back up: the canvas unfolds
  whatever hides the node and frames it. Both windows share one save, so edits
  and renames show up in the other instantly. The wiki lists a page's linked
  nodes; choosing one controls the diagram embed and **Canvas** destination.
  Unlinking or deleting a node keeps its pages. Pages become orphans only when
  no nodes link them. Deleting a page removes its links from every node.
  The default page exports as `click A href "#/wiki/<id>"`; set a **Base URL** beside Copy in the
  Mermaid tab to export absolute links (`https://host/app/#/wiki/<id>`). Import
  reads the page id from any base. `%% merfolk-pages A ["page1","page2"]`
  comments preserve all links and their order when importing Mermaid back into
  merfolk. Other Mermaid renderers ignore these comments. Mermaid stores page
  references; use `.merfolk.json` to include page content.
- **Persistence** — the diagram autosaves to `localStorage` and restores on
  reload, so nothing is lost on refresh. Export / import a `.merfolk.json` file,
  or clear the canvas, from the toolbar. Older single-page saves and JSON files
  migrate automatically; new saves use version 2.
- **Paper and ink** — one look throughout: a grained paper desk, card-stock
  panels, crisp kraft sheets for unfolded groups, and diagrams drawn in
  hand-drawn ink (roughjs, seeded per element so the wobble never changes)
  with handwritten Kalam labels and open chevron arrowheads. The style panel's
  Sloppiness picks **Ink** (clean), **Sketch** (default) or **Scribble**.
- **Dark / light themes** — toolbar toggle (☀ / ☾). Follows the OS by default,
  remembers your choice in `localStorage`. The whole UI — canvas, nodes, panel,
  React Flow controls and minimap — is driven by CSS variables + React Flow's
  `colorMode`, so it's a single attribute flip. Light is white paper with sumi ink;
  dark is night paper with chalk.

## Design

The bar for every screen and API: [`DESIGN.md`](DESIGN.md) — simple purpose,
simple architecture, simple design, simple implementation, no filler text.

## Hotkeys

| Key | Action |
| --- | --- |
| `R` / `O` / `D` / `C` | Add rectangle / rounded / diamond / circle |
| `S` | Open the shape + icon picker (type to filter, `Enter` picks the first) |
| `I` | Add an image: paste a URL, upload a file, or take it from the clipboard |
| `L` | Tidy top-down |
| `⇧L` | Tidy left-right |
| `T` | Toggle theme |
| `M` | Toggle Mermaid panel |
| `W` | Open the selected node's default wiki page in the side panel |
| `E` | Page tab: switch between Markdown and Preview |
| `F` | Fold / unfold the selected group (or the sheet a selected node sits on) |
| `[` / `]` | Fold / unfold one level |
| `P` | Play / pause the flow |
| `,` / `.` | Step the flow back / forward |
| `⌫` / `Del` | Delete selected node(s) |
| `Ctrl/⌘V` | Paste an image (screenshot, copied web image, image URL) as an image node at the pointer |
| `Ctrl/⌘C` | Copy the selected image node (pastes back with its size and label; other apps get the picture) |

Shortcuts are suspended while you're typing in a field. Every toolbar button
shows its key in the tooltip.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production bundle to dist/
npm test         # mermaid round-trip, fold logic, and a check against the real mermaid parser
npm run icons    # regenerate src/icons/catalog.ts from the curated list in scripts/icons.ts
```

## Architecture

| File | Role |
| --- | --- |
| `src/types.ts` | `Diagram` data model: flat nodes + edges, `parentId` for nesting, `collapsed` flag |
| `src/store.ts` | Zustand store + mutations; `hiddenNodeIds()` derives what a collapse hides |
| `src/mermaid/io.ts` | `fromMermaid` / `toMermaid` — pragmatic flowchart parser + emitter (subgraphs ↔ groups) |
| `src/fold.ts` | Pure fold logic: hidden set, edge creases, fold levels, sheet geometry |
| `src/flow.ts` | Pure flow schedule: which step each visible connection plays in |
| `src/flowPlayer.ts` | Flow clock (`--mf-flow-t`), play / pause / step / speed |
| `src/foldMotion.ts` | Fold / unfold choreography; commits one undo step per fold |
| `src/layout.ts` | Dagre auto-layout over the visible graph; unfolded groups are clusters so sheets don't overlap |
| `src/theme.ts` | Theme store: OS default, `localStorage` persistence, `<html data-theme>` flip |
| `src/persist.ts` | Diagram autosave/restore + `.merfolk.json` export/import |
| `src/components/DiagramNode.tsx` | Custom React Flow node: shapes, inline rename, folded-card tab |
| `src/components/SheetNode.tsx` | Paper sheet behind an unfolded group, with the dog-ear fold control |
| `src/components/Icon.tsx` | Inline-SVG icon set (currentColor, theme-aware) |
| `src/pages.ts` | Pure wiki logic: lazy pages, shared links, migration, wikilinks, backlinks, orphans, embed subtree, cross-window merge |
| `src/route.ts` | Hash routes (`#/wiki/<id>`, `#/node/<id>`) and window helpers |
| `src/dock.ts` | Which view the side panel shows; `showPage` opens a node's page there |
| `src/components/PagePanel.tsx` | Page tab: edit / read the selected node's page beside the canvas |
| `src/wiki/` | Lazy-loaded wiki window: `WikiApp`, CodeMirror `Editor`, sanitized `Preview`, `render` |
| `src/useHotkeys.ts` | Global keyboard shortcuts, suspended while typing |
| `src/components/MermaidPanel.tsx` | Live Mermaid text view + import/copy |
| `src/App.tsx` | Canvas wiring, toolbar, visibility filtering |

## Mermaid support (subset)

Parses the common `flowchart` / `graph` subset: node declarations in all 14
classic bracket shapes (`[]` `()` `([])` `[[]]` `[()]` `(())` `((()))` `{}`
`{{}}` `[//]` `[\\]` `[/\]` `[\/]` `>]`), v11 `@{ shape: … }` / `@{ icon: … }`
metadata, `-->` / `---` edges with optional `|labels|`, and `subgraph … end`
blocks (which become collapsible group nodes), and `click <id> href "#/wiki/<pageId>"` page links. v11 shapes merfolk doesn't draw
yet import as rectangles. It round-trips everything merfolk itself produces,
and `scripts/mermaid-compat.ts` feeds that output to the real `mermaid` parser
to confirm it reads every shape, icon, edge and subgraph the same way.
The shape table lives in `src/shapes.ts`.

## Fonts

Inter and JetBrains Mono are self-hosted via `@fontsource` and bundled into the
build, so there's no Google Fonts network dependency and the app renders
correctly offline.

## Next ideas

- Live Mermaid *render* preview using the `mermaid` package
- Undo / redo
- Quick-add a connected node by dragging a handle onto empty canvas
- Shareable URL / embed
