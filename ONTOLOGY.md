# marmerlade ontology

The data model, and how diagrams, wiki pages, slide decks and Mermaid relate.
Source of truth: `src/types.ts`. Everything here is checked against the code.

## Entities

```
Diagram ─┬─ nodes[]  DiagramNode   a box, icon, image, or group
         ├─ edges[]  DiagramEdge   a directed connection between two nodes
         ├─ pages[]  Page          Markdown wiki page
         └─ decks[]  Deck          = Page; Markdown slide deck
```

One flat document, saved as `{ version: 3, diagram: { nodes, edges, pages, decks } }`
(`.marmerlade.json`, and `localStorage["marmerlade.diagram"]`). Import also accepts a
bare `Diagram`. `pages` and `decks` may be absent; they default to `[]`.

### Relationships

| Relation | Stored on | Cardinality | Notes |
| --- | --- | --- | --- |
| node → parent group | `node.parentId` | many : 1 | `null` = top level. No `children` list; children are derived. |
| edge → endpoints | `edge.source`, `edge.target` | many : 2 | Ids of nodes. A group id is a valid endpoint. |
| node → pages | `node.pageIds` | many : many | Ordered. First = default page. |
| node → decks | `node.deckIds` | many : many | Ordered. First = default deck. |
| page/deck → node | *not stored* | | Derived by scanning nodes (`nodesOfPage`). |
| page → page | Markdown `[[Target]]` | many : many | Derived (`extractLinks`, `backlinks`). |
| page/deck → diagram | `{{diagram}}` embed | | Derived live at render time. |

Links live only on the node. A page never points at a node. Pages and decks
have the same shape but are separate namespaces (`pages[]` vs `decks[]`), and a
page id and a deck id never need to be unique across the two.

## DiagramNode

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Unique. Use `[A-Za-z0-9_]+` or it cannot round-trip through Mermaid. |
| `label` | string | Text. `""` is allowed (unlabelled). |
| `shape` | `NodeShape` | See [Shapes](#shapes). Required even for groups (ignored). |
| `parentId` | string \| null | Containing group. Must be another node's id; no cycles. |
| `collapsed` | boolean | Only meaningful on a group. `true` = folded. |
| `position` | `{x, y}` | Canvas px. Ignored for groups (derived from their contents). |
| `icon?` | string | Iconify name, e.g. `lucide:database`, `simple-icons:github`. |
| `image?` | `NodeImage` | `{ src, pos?: 't'\|'b', w?, h?, constraint? }`. Wins over `icon`. |
| `pageIds?` | string[] | Ids into `pages`. |
| `deckIds?` | string[] | Ids into `decks`. |
| `style?` | `ElementStyle` | Optional visual overrides. Missing field = theme default. |

### Kinds of node

A node's kind is derived, not stored:

- **Group**: any node that is some other node's `parentId`. Unfolded it is a
  titled sheet (label = title, no card). Folded (`collapsed: true`) it is a card
  with its subtree hidden. Groups nest to any depth. A node with no children is
  a leaf, whatever its `collapsed` value.
- **Leaf**: a shape (default), an **icon tile** (`icon` set), or an **image
  node** (`image` set).

Folding hides all descendants. Edges with a hidden end are redrawn onto the
nearest visible ancestor card and merged (`×n`); edges entirely inside one
folded card disappear. Nothing is deleted (`src/fold.ts`).

### Shapes

`rect round stadium subroutine cylinder circle dbl-circle diamond hexagon lean-r lean-l trap-b trap-t flag`
(table in `src/shapes.ts`). Each maps to a classic Mermaid bracket form, and
Mermaid v11 `@{ shape: … }` aliases import as the same shape. Unknown v11
shapes import as `rect`. For an icon tile, `shape` only picks the corners:
`circle` → circle, `round` → rounded, anything else → square.

### Icons

Curated catalog in `src/icons/catalog.ts` (Lucide `lucide:*`, Simple Icons
`simple-icons:*`). An id outside the catalog (e.g. `logos:aws`) is kept and
exported to Mermaid; marmerlade draws a neutral placeholder glyph for it.

## DiagramEdge

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Unique. Not stable across Mermaid parses. |
| `source`, `target` | string | Node ids. |
| `label?` | string | Edge text. |
| `order?` | number | 1-based flow step. Overrides traversal order. Not in Mermaid. |
| `style?` | `ElementStyle` | Visual overrides. |

Edges are directed and always rendered as `-->`. Parallel edges are allowed.
Flow playback (`src/flow.ts`): start nodes (no incoming edge) fire first, every
edge plays one step after the edge that reached its source, branches run
together, `order` overrides.

### ElementStyle (nodes and edges)

All optional: `stroke`, `background` (any CSS colour), `strokeWidth`,
`strokeStyle` (`solid|dashed|dotted`), `sloppiness` (`0|1|2`), `edges`
(`sharp|round`), `fontFamily` (`sans|serif|mono|hand`), `fontSize`, `opacity`
(0..1), `animation` (`none|pulse|fade|draw|flow`), `animationSpeed` (seconds).
Style is JSON-only; it never reaches Mermaid.

## Page and Deck

```ts
interface Page { id: string; title: string; body: string; updatedAt: number }
type Deck = Page
```

- `id`: any nonempty string. Keep to `[A-Za-z0-9_-]`: it appears in URLs and in
  `click … href "#/wiki/<id>"`, which stops at `"` and `?`. Generated ids are
  `page` / `deck` + 5 base-36 chars.
- `body`: Markdown. This is where all content lives.
- `updatedAt`: epoch ms. When two windows disagree, the newer wins. Set it to
  `Date.now()` whenever you write a body.

Pages and decks are independent of nodes: unlinking or deleting a node keeps
them. A page no node links to is an **orphan**. Deleting a page removes its id
from every node. A node with no page gets one lazily on first open, titled from
its label (later renames do not retitle it).

### Wiki page Markdown

| Syntax | Meaning |
| --- | --- |
| `[[Target]]`, `[[Target\|alias]]` | Link. Resolves to a page whose **title** matches, else a node whose **label** matches (its page is created on first visit). Case-insensitive; first match wins. |
| `{{diagram}}` | Live sub-diagram of the node the page is opened from. |
| `{{diagram:Target}}` | Sub-diagram of the node whose **id** or **label** matches. |
| ```` ```mermaid ```` | A static Mermaid diagram. |

Embed content (`embedDiagram`): a **group** → its whole subtree, without the
group itself. A **leaf** → the node plus its direct neighbours and the edges
between them. Page and deck links are dropped from embeds.

The rich-text editor only recognises the bare `{{diagram}}` as an embed block
(`src/wiki/extensions.ts`); write `{{diagram:Target}}` in Markdown mode.
Pages with raw HTML always edit as Markdown.

### Slide deck Markdown

A deck is Markdown in the subset Marp and Slidev both read.

```markdown
---
backgroundColor: "#f6efe0"   # optional front matter, first thing in the file
font: sans                   # sans | serif | mono | hand
headingFont: hand
transition: fade             # fade | slide
---

<!-- _class: lead -->
# Title                      <!-- slide 1 -->

---                          <!-- a line of exactly --- starts a new slide -->

## Architecture
{{diagram:Platform}}

<!-- Speaker note: any HTML comment that is not a directive -->
```

- Slide break: `---` on its own line.
- Front matter keys marmerlade reads: `backgroundColor`, `color`, `font`,
  `headingFont`, `transition`, `class`. All other keys are kept verbatim.
- Directives are HTML comments: `<!-- key: value -->` applies to this and later
  slides; `<!-- _key: value -->` to this slide only. Keys: `backgroundColor`,
  `color`, `class` (`lead`, `invert`), `font`, `headingFont`, `transition`, plus
  Marp's `marp theme style size paginate header footer title …` (kept, not
  interpreted). Any other comment is a **speaker note**.
- Embeds: `{{diagram}}` and `{{diagram:Target}}` (own line), same rules as the
  wiki; ```` ```mermaid ```` fences; `[[wikilinks]]` link to the wiki.
- **Objects** are one HTML block each, positioned in percent of the slide, painted
  in source order (later = on top):

  ```html
  <div class="box round hand" style="left:10%;top:20%;width:30%;height:20%">Text</div>
  ```

  Classes: `box` plus one of `rect round ellipse line arrow image` (none = text
  box) and optionally a font. Style properties: `left top width height`
  (percent), `background`, `border-color`, `color`, `font-size` (em),
  `transform: rotate(Ndeg)`, `text-align`. An image is
  `<div class="box image" …><img src="…" style="width:100%;height:100%;object-fit:contain"></div>`.
- Export (`toMarkdown`): adds `marp: true`, turns embeds into Mermaid fences,
  wikilinks into plain text, and inlines object CSS.

## Mermaid mapping

`src/mermaid/io.ts`: `toMermaid` / `fromMermaid` / `parseMermaid` (strict).
Output is always `flowchart TD`.

| marmerlade | Mermaid |
| --- | --- |
| leaf node | `id["label"]` in the shape's brackets, e.g. `db[("DB")]` |
| icon tile | `id@{ icon: "lucide:database", form: "square", label: "DB" }` |
| image node | `id@{ img: "https://…", label: "L", pos: "t", w: 60, h: 60, constraint: "on" }` |
| group | `subgraph id ["label"] … end`, nested by `parentId` |
| edge | `a -->\|label\| b` (labels optional) |
| `pageIds[0]` | `click id href "#/wiki/<pageId>"` (prefixed by the Base URL if set) |
| all `pageIds` | `%% marmerlade-pages id ["p1","p2"]` |
| `deckIds` | `%% marmerlade-decks id ["d1"]` |

Parser limits: chains (`A --> B --> C`) and `&` groups (`A & B --> C & D`)
import as one edge per node pair and export one per line; `-->`, `---`,
`-.->`, `==>` all import as a plain edge; only `flowchart`/`graph` (not
`sequenceDiagram`). Any line it cannot read makes `parseMermaid` fail, so the
canvas holds its last good state.

**Mermaid carries structure only.** It loses: `position`, `collapsed`,
`style`, `order`, a group's `shape`/`icon`/`image`, edge ids, and all page and
deck **content** (only the ids survive, via the comments above). When Mermaid
text is edited live, `mergeDiagram` keeps `position`, `collapsed`, `style` and
links by node id, and `style`/`order` by `source→target` pair. Use
`.marmerlade.json` whenever content or look must survive.

## Routes

| Hash | Opens |
| --- | --- |
| `#/` | canvas |
| `#/node/<nodeId>` | canvas, unfolds ancestors and frames the node |
| `#/wiki`, `#/wiki/<pageId>[?node=<nodeId>]` | wiki index / page (`node` picks the diagram embed context) |
| `#/slides`, `#/slides/<deckId>[?node=<id>&slide=<n>&presenter=1]` | deck index / deck, presenting from slide *n* |
| `#/docs` | this document (More actions → Docs) |

## How to build

Write a `.marmerlade.json`, then **Import** it from the toolbar. JSON is the only
format that carries everything.

1. Choose ids: `[A-Za-z0-9_]+` for nodes, `[A-Za-z0-9_-]+` for pages and decks.
2. Add `nodes`. Group by setting `parentId` to the group's id; add the group node
   itself (`shape: "rect"`, `collapsed: false`, any `position`).
3. Add `edges` between node ids (groups included).
4. Add `pages` / `decks` with a `body` and `updatedAt`.
5. Link by listing their ids in `node.pageIds` / `node.deckIds` (first = default).
6. Use `[[Node label]]`, `{{diagram}}` and `{{diagram:id}}` in bodies to relate
   content to the diagram. Press **Tidy** (`L`) to lay out nodes if positions are
   arbitrary.

Example: a group with two children, one linked page and one deck.

```json
{
  "version": 3,
  "diagram": {
    "nodes": [
      { "id": "user", "label": "User", "shape": "round", "parentId": null, "collapsed": false, "position": { "x": 0, "y": 0 } },
      { "id": "platform", "label": "Platform", "shape": "rect", "parentId": null, "collapsed": false, "position": { "x": 0, "y": 0 }, "pageIds": ["platform_overview"], "deckIds": ["platform_deck"] },
      { "id": "api", "label": "API", "shape": "rect", "parentId": "platform", "collapsed": false, "position": { "x": 240, "y": 0 }, "pageIds": ["api_notes"] },
      { "id": "db", "label": "Database", "shape": "rect", "parentId": "platform", "collapsed": false, "position": { "x": 480, "y": 0 }, "icon": "lucide:database" }
    ],
    "edges": [
      { "id": "e1", "source": "user", "target": "api", "label": "request" },
      { "id": "e2", "source": "api", "target": "db" }
    ],
    "pages": [
      { "id": "platform_overview", "title": "Platform", "body": "# Platform\n\n{{diagram}}\n\nThe [[API]] stores data in the Database.", "updatedAt": 1700000000000 },
      { "id": "api_notes", "title": "API", "body": "# API\n\nCalled by the User. See [[Platform]].\n\n{{diagram}}", "updatedAt": 1700000000000 }
    ],
    "decks": [
      { "id": "platform_deck", "title": "Platform", "body": "---\nfont: sans\n---\n\n<!-- _class: lead -->\n\n# Platform\n\n---\n\n## Architecture\n\n{{diagram}}\n\n<!-- Walk the request path left to right. -->", "updatedAt": 1700000000000 }
    ]
  }
}
```

In the browser console or a script, the store takes the same data:
`useDiagram.getState().load(diagram)` (`src/store.ts`). The pure modules
(`src/pages.ts`, `src/slides.ts`, `src/fold.ts`, `src/flow.ts`,
`src/mermaid/io.ts`) have no DOM or store dependency and run under
`node --experimental-strip-types`; see `scripts/` for examples.

## Invariants to keep

- Every `parentId`, `edge.source`, `edge.target` names an existing node; no
  parent cycles.
- Node ids are unique; edge ids are unique.
- Every id in `pageIds` / `deckIds` appears in `pages` / `decks`, with no
  duplicates in a list. (Mermaid import may leave a reference with no content
  yet; it is created on first open.)
- `updatedAt` is bumped on every body change.
- Page and deck ids contain no `"`, `?`, `#` or `/`.
