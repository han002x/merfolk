# Structure

- `src/App.tsx` — app shell and toolbar
- `src/components/` — React Flow nodes/edges (`DiagramNode`, `DiagramEdge`, `SheetNode`, `GhostNode`), panels (`MermaidPanel`, `TreePanel`, `StylePanel`), pickers (`ShapePicker`, `ImagePicker`), `Icon`
- `src/store.ts` — zustand store; `src/types.ts` — shared types
- `src/mermaid/io.ts` — Mermaid parse/serialize
- `src/fold.ts`, `src/foldMotion.ts` — origami folding logic and animation
- `src/layout.ts` — dagre auto-layout
- `src/shapes.ts`, `src/icons/catalog.ts`, `src/rough.ts`, `src/style.ts`, `src/theme.ts` — look and feel
- `src/gif*.ts` — GIF export; `src/persist.ts`, `src/clipboard.ts`, `src/imageUpload.ts` — I/O
- `scripts/` — test scripts (`npm test`) and icon generator
