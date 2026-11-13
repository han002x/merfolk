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
  Pages appear beneath their linked nodes in the canvas tree and the wiki's
  collapsible sidebar. The wiki follows the diagram's group hierarchy and
  lists unlinked pages in a separate section.
  Both the wiki window and the canvas side panel open a rich-text editor.
  Type `/` for headings, lists, checklists, quotes, code, dividers, tables, and
  diagram embeds. Select text for formatting. **Edit**, **Read**, and
  **Markdown** switch between rich text, the rendered page, and CodeMirror
  source editing. Content continues to save as Markdown. Pages containing raw
  HTML use source editing to preserve that content.
  Tables have row and column handles, insertion menus, edge + buttons, and a
  floating toolbar. Select a handle to insert, clear, or delete that row or
  column; `Tab` moves between cells and
  adds a row at the end, `Shift+Tab` moves back, and `Enter` adds a cell line
  break. Merged cells and resizing are not supported. `[[Node or Page]]` links jump between
  pages (`[[Target|alias]]` supported, `[[` autocompletes), each page lists its
  backlinks, and `{{diagram}}` embeds the node's live sub-diagram. Click a node
  in it, or **Canvas** in the header, to drill back up: the canvas unfolds
  whatever hides the node and frames it. Both windows share one save, so edits
  and renames show up in the other instantly. The wiki lists a page's linked
  nodes; choosing one controls the diagram embed and **Canvas** destination.
  Unlinking or deleting a node keeps its pages. Pages become orphans only when
  no nodes link them. Deleting a page removes its links from every node.
  The default page exports as `click A href "#/wiki/<id>"`; set a **Base URL** beside Copy in the
  Mermaid tab to export absolute links (`https://host/app/#/wiki/<id>`).
  Set `VITE_PAGE_BASE_URL` in `.env.local` (see `.env.example`) to provide the
  default Base URL. Restart the dev server or rebuild after changing it.
  A saved browser setting overrides this default, including an empty value
  for relative links. Import
  reads the page id from any base. `%% merfolk-pages A ["page1","page2"]`
  comments preserve all links and their order when importing Mermaid back into
  merfolk. Other Mermaid renderers ignore these comments. Mermaid stores page
  references; use `.merfolk.json` to include page content.
- **Slides** — every node can also link slide decks, written as code. Press `K`,
  the slides button on a node (beside its page button), or **Slides** on the
  toolbar to open the selected node's deck in the side panel's **Slides** tab
  (created on first use, titled from the node); with nothing selected the tab
  lists every deck. The tab shows the deck as slides or as its Markdown, and
  its menu switches between a node's decks: **New deck**, **Link existing
  deck**, **Unlink**, **Make default**. ↗ opens the deck in the slides window,
  where the full tools live, and a slide's number presents from that slide; decks appear beneath their nodes in the canvas tree
  and the slides sidebar, and link, unlink and outlive nodes exactly as pages do.
  A deck is Markdown in the subset [Marp](https://marp.app) and
  [Slidev](https://sli.dev) both read: `---` on its own line starts a new
  slide, an HTML comment (`<!-- … -->`) is a speaker note, and optional front
  matter at the top is kept but not shown. `{{diagram}}` draws the linked
  node's live sub-diagram, `{{diagram:Node}}` draws any node by label or id,
  and ```` ```mermaid ```` fences render as diagrams. `[[wikilinks]]` open the
  wiki. The source sits beside its slides, which redraw as you type. The slide
  under the caret is outlined; click a slide to move the caret to its source,
  and its number presents from that slide. Each slide's ⋮ menu adds a slide
  after it, duplicates, moves or deletes it; drag a slide by its number to
  reorder. **+ Slide** adds a blank slide or a layout (title, title and
  content, section, two columns), and **Insert** drops in a diagram, Mermaid
  fence, table, code block or speaker note. Every tool is an edit to the
  Markdown, so undo takes it back. **Insert** also places objects: a text box,
  rectangle, rounded rectangle, ellipse, line, arrow, or an image from a link
  or a file. Drag one to move it: its edges and centre snap to the slide's and
  to other objects', with guides (`⇧` moves freely). Drag any edge or corner to
  resize (`⇧` keeps proportions) and the knob above it to turn (`⇧` for 15° steps); arrow keys nudge
  (`⇧` for bigger steps), `⌫` deletes. Its bar sets fill, border, text colour
  (swatches or any colour), font and size, brings it to the front or sends it
  to the back (objects paint in source order), and **Edit text** or a double-click edits its words directly on the slide.
  `Enter` also starts text editing; `Esc` finishes it. `Tab` / `⇧Tab` cycle
  objects, and `Ctrl/⌘D` duplicates the selected object. **Undo** / **Redo**
  and `Ctrl/⌘Z` / `Ctrl/⌘⇧Z` share a history with the source editor.
  The object bar also offers font, size and text alignment; **Edit source**
  remains available in its Style menu. An object is one HTML block,
  `<div class="box round hand" style="left:10%;top:20%;width:30%;height:20%">Text</div>`,
  placed in percent of the slide. **Style** dresses the slide being written
  (background, text colour, centered, inverted) with Marp's own directives
  (`<!-- _backgroundColor: … -->`, `_color`, `_class: lead invert`; without the
  underscore they carry on to later slides), and sets the deck's text and
  heading fonts (sans, serif, mono, hand) as `font` / `headingFont` in the
  front matter, where `backgroundColor` and `color` dress every slide: a deck
  theme (Paper, Kraft, Sky, Night) is that pair. `transition: fade` or
  `slide` there animates slide changes.
  **Present** starts at the
  slide being written and fills the window: `→` / `Space` / `Enter` next, `←` /
  `Backspace` back, `Home` / `End`, a number then `Enter` to jump, `O` for all
  slides, `N` for the presenter view (notes, timer, next slide), `L` for a
  pointer, `B` to blank the screen, `P` for a presenter window to keep on your
  own screen (every window on the deck stays on the same slide), `F` full
  screen, `Esc` exit. The same
  tools sit in the corner of the slide. The slide number lives in the URL
  (`#/slides/<id>?slide=3`). Print
  while presenting for a PDF, one slide per sheet. **Export Markdown** writes a
  standalone `.md` with `marp: true`, every embed replaced by a Mermaid fence
  and wikilinks by their text; objects are written out with their full inline
  CSS and the deck's fonts as a Marp `style`. Slidev draws those fences
  natively; Marp needs a Mermaid plugin, and HTML enabled to show objects. Deck links ride through Mermaid as
  `%% merfolk-decks A ["deck1"]` comments; deck content lives in
  `.merfolk.json`.
- **Persistence** — the diagram autosaves to `localStorage` and restores on
  reload, so nothing is lost on refresh. Export / import a `.merfolk.json` file,
  or clear the canvas, from the toolbar. Older single-page saves and JSON files
  migrate automatically; new saves use version 3.
- **Paper and ink** — one look throughout: a grained paper desk, card-stock
  panels, crisp kraft sheets for unfolded groups, and diagrams drawn in
  hand-drawn ink (roughjs, seeded per element so the wobble never changes)
  with handwritten Kalam labels and open chevron arrowheads. The style panel's
  Sloppiness picks **Ink** (clean), **Sketch** (default) or **Scribble**.
- **App appearance** — choose Paper, Night Paper, Clean, Blueprint, Terminal,
  Sepia, Classic (black and white), Halloween, or one editable Custom style from **More actions → Appearance** or
  press `T`. Wiki and slides headers also have an Appearance button. Custom
  controls colors, fonts, wiki/slides icon symbols and colors, sketchiness, corners, texture, and shadows, with
  changes saved automatically across windows. Selecting a style resets existing
  diagram and slide styling; individual styling controls work afterward and
  survive reloads. Reset Custom from any preset to start again.


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
| `T` | Open app appearance |
| `M` | Toggle Mermaid panel |
| `W` | Open the selected node's default wiki page in the side panel |
| `K` | Open the selected node's default slide deck in the side panel (all decks when nothing is selected) |
| `E` | Page tab: switch between Edit and Read |
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
npx playwright install chromium # browser for end-to-end tests
npm run test:e2e # wiki, side-panel editor and slides browser tests
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
| `src/slides.ts` | Pure deck logic: split slides, speaker notes, Marp / Slidev Markdown export |
| `src/slides/` | Lazy-loaded slides window: `SlidesApp` (source beside slides), `Slide`, `Present` |
| `src/route.ts` | Hash routes (`#/wiki/<id>`, `#/slides/<id>`, `#/node/<id>`) and window helpers |
| `src/dock.ts` | Which view the side panel shows; `showPage` opens a node's page there |
| `src/components/PagePanel.tsx` | Page tab: edit / read the selected node's page beside the canvas |
| `src/components/SlidesPanel.tsx` | Slides tab: the selected node's deck as slides or Markdown beside the canvas |
| `src/wiki/` | Lazy-loaded wiki window: `WikiApp`, rich-text `Editor`, CodeMirror `SourceEditor`, sanitized `Preview`, `render` |
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
