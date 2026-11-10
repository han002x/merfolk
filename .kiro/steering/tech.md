# Tech and commands

Stack: React 19, TypeScript, Vite, @xyflow/react (React Flow), zustand, dagre (layout), roughjs, gif.js, mermaid (tests/compat), oxlint.

Commands:
- `npm run dev` — dev server
- `npm run build` — `tsc -b && vite build` (run after code changes)
- `npm run lint` — oxlint
- `npm test` — runs `scripts/*.ts` (roundtrip, fold, sync, gif, shapes, rough, mermaid-compat) via `node --experimental-strip-types`
- `npm run icons` — regenerate icon catalog

Conventions:
- ESM (`"type": "module"`); scripts are plain TS run by Node, no test framework.
- Mermaid import/export lives in `src/mermaid/io.ts`; state in `src/store.ts`; fold logic in `src/fold.ts` / `src/foldMotion.ts`.
- Respect `prefers-reduced-motion` for any new motion.
- Style via CSS variables so theming stays a single attribute flip.
- Shapes must map to Mermaid's classic bracket syntax; icons use `@{ icon: ... }` syntax.
