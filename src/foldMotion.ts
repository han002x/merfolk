// Fold / unfold choreography.
//
// Folding: the subtree slides into its group card and creases flat, then the
// fold is committed to the diagram. Unfolding: the fold is committed first,
// then the revealed nodes start on the card and pop up into place, like a
// pop-up card opening. The diagram store only ever sees the final state (one
// undo step); this store holds the brief in-between.

import { create } from 'zustand';
import { flowchartOf, useDiagram } from './store';
import { hiddenIds } from './fold';

export type FoldPhase = 'folding' | 'unfold-start' | 'unfolding';

interface Motion {
  phase: FoldPhase | null;
  /** animating node id -> id of the card it folds into / unfolds from */
  anchor: Map<string, string>;
  fold: (ids: string[]) => void;
  unfold: (ids: string[]) => void;
  toggle: (id: string) => void;
}

const FOLD_MS = 260;
const UNFOLD_MS = 420;

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

let timer: ReturnType<typeof setTimeout> | undefined;
/** a fold waiting for its animation to end before it is committed */
let pendingFold: string[] | null = null;

/** Jump any in-flight animation to its end state. */
function settle() {
  clearTimeout(timer);
  if (pendingFold) useDiagram.getState().setCollapsed(pendingFold, true);
  pendingFold = null;
  useFoldMotion.setState({ phase: null, anchor: new Map() });
}

export const useFoldMotion = create<Motion>((set, get) => ({
  phase: null,
  anchor: new Map(),

  fold: (ids) => {
    settle();
    const { setCollapsed } = useDiagram.getState();
    const { nodes } = flowchartOf(useDiagram.getState());
    const targets = new Set(
      ids.filter((id) => nodes.some((n) => n.id === id && !n.collapsed)),
    );
    if (targets.size === 0) return;
    if (reducedMotion()) return setCollapsed([...targets], true);

    // each visible node tucks into its OUTERMOST folding ancestor
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const hidden = hiddenIds(nodes);
    const anchor = new Map<string, string>();
    for (const n of nodes) {
      if (hidden.has(n.id)) continue;
      let into: string | null = null;
      for (let p = n.parentId; p; p = byId.get(p)?.parentId ?? null) {
        if (targets.has(p)) into = p;
      }
      if (into) anchor.set(n.id, into);
    }
    if (anchor.size === 0) return setCollapsed([...targets], true);

    pendingFold = [...targets];
    set({ phase: 'folding', anchor });
    timer = setTimeout(settle, FOLD_MS);
  },

  unfold: (ids) => {
    settle();
    const { setCollapsed } = useDiagram.getState();
    const before = hiddenIds(flowchartOf(useDiagram.getState()).nodes);
    setCollapsed(ids, false);
    if (reducedMotion()) return;

    const nodes = flowchartOf(useDiagram.getState()).nodes;
    const after = hiddenIds(nodes);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    // each revealed node springs from the card that was hiding it
    const anchor = new Map<string, string>();
    for (const id of before) {
      if (after.has(id)) continue;
      let p = byId.get(id)?.parentId ?? null;
      while (p && before.has(p)) p = byId.get(p)?.parentId ?? null;
      if (p) anchor.set(id, p);
    }
    if (anchor.size === 0) return;

    set({ phase: 'unfold-start', anchor });
    // paint once on the card, then release to the real positions
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (get().anchor !== anchor) return;
        set({ phase: 'unfolding' });
        timer = setTimeout(settle, UNFOLD_MS);
      }),
    );
  },

  toggle: (id) => {
    const n = flowchartOf(useDiagram.getState()).nodes.find((x) => x.id === id);
    if (!n) return;
    if (n.collapsed) get().unfold([id]);
    else get().fold([id]);
  },
}));
