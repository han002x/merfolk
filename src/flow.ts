// Sequenced flow: the order a pulse travels the visible connections.
//
// Pure (no React, no DOM) so it can be tested under node. Time is measured in
// steps: step k plays while the clock reads k..k+1, so an edge's progress is
// clamp(t - step, 0, 1) and a node lights once the clock passes its arrival.

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  /** 1-based manual position; set, it overrides the traversal order */
  order?: number;
}

export interface FlowSchedule {
  /** edge id -> the step it plays in */
  edgeStep: Map<string, number>;
  /** node id -> the clock time it lights (0 for a start node) */
  nodeAt: Map<string, number>;
  /** how many steps the sequence has */
  steps: number;
  /** changes whenever the schedule does, so a player knows to restart */
  sig: string;
}

/** seconds one step lasts at 1x speed */
export const HOP_SECONDS = 0.9;
/** steps the finished diagram stays lit before the loop clears */
export const FLOW_HOLD = 1;
/** steps the diagram stays clear before the loop begins again */
export const FLOW_LEAD = 0.5;

/** Length of one loop, in steps. */
export const flowCycle = (steps: number) => steps + FLOW_HOLD + FLOW_LEAD;

/** Seconds one loop lasts at `speed`. */
export const flowSeconds = (steps: number, speed: number) =>
  steps > 0 ? (flowCycle(steps) * HOP_SECONDS) / speed : 0;

/**
 * Plan the sequence over the edges on screen. Start nodes (no incoming edge)
 * fire first; every edge plays one step after the one that reached its source,
 * so branches run together. A diagram with no start node (a cycle) begins at
 * its first edge's source. Each edge plays once, so cycles terminate.
 */
export function flowSchedule(edges: FlowEdge[]): FlowSchedule {
  const out = new Map<string, FlowEdge[]>();
  const incoming = new Set<string>();
  const ids: string[] = [];
  const see = (id: string) => {
    if (!out.has(id)) {
      out.set(id, []);
      ids.push(id);
    }
  };
  for (const e of edges) {
    see(e.source);
    see(e.target);
    out.get(e.source)!.push(e);
    incoming.add(e.target);
  }

  // breadth-first from the start nodes; leftovers (cycles) seed from the first
  // unvisited node, so every edge gets a depth
  const depth = new Map<string, number>();
  const queue: string[] = [];
  const reach = (id: string, d: number) => {
    if (depth.has(id)) return;
    depth.set(id, d);
    queue.push(id);
  };
  const drain = () => {
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];
      for (const e of out.get(id) ?? []) reach(e.target, depth.get(id)! + 1);
    }
    queue.length = 0;
  };
  for (const id of ids) if (!incoming.has(id)) reach(id, 0);
  drain();
  for (const id of ids) {
    if (!depth.has(id)) {
      reach(id, 0);
      drain();
    }
  }

  const edgeStep = new Map<string, number>();
  for (const e of edges) {
    const manual = e.order != null && Number.isFinite(e.order) ? Math.max(1, Math.floor(e.order)) - 1 : null;
    edgeStep.set(e.id, manual ?? depth.get(e.source)!);
  }

  // a node lights when the first edge into it lands; start nodes light at once
  const nodeAt = new Map<string, number>();
  for (const e of edges) {
    const at = edgeStep.get(e.id)! + 1;
    nodeAt.set(e.target, Math.min(nodeAt.get(e.target) ?? Infinity, at));
  }
  for (const id of ids) if (!incoming.has(id)) nodeAt.set(id, 0);

  let steps = 0;
  for (const s of edgeStep.values()) steps = Math.max(steps, s + 1);
  const sig = `${steps}|${edges.map((e) => `${e.id}:${edgeStep.get(e.id)}`).join(',')}`;
  return { edgeStep, nodeAt, steps, sig };
}
