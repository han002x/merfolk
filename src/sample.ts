import type { FlowchartDiagram } from './types';

// A small sample showing a collapsible group ("Backend") with children.
export const SAMPLE: FlowchartDiagram = {
  nodes: [
    { id: 'UI', label: 'Web UI', shape: 'rect', parentId: null, collapsed: false, position: { x: 80, y: 60 } },
    { id: 'API', label: 'API Gateway', shape: 'round', parentId: null, collapsed: false, position: { x: 80, y: 220 } },
    { id: 'Backend', label: 'Backend', shape: 'rect', parentId: null, collapsed: false, position: { x: 360, y: 220 } },
    { id: 'Auth', label: 'Auth Service', shape: 'rect', parentId: 'Backend', collapsed: false, position: { x: 340, y: 360 } },
    { id: 'DB', label: 'Database', shape: 'circle', parentId: 'Backend', collapsed: false, position: { x: 520, y: 360 } },
    { id: 'Check', label: 'Valid?', shape: 'diamond', parentId: null, collapsed: false, position: { x: 80, y: 380 } },
  ],
  edges: [
    { id: 'e1', source: 'UI', target: 'API' },
    { id: 'e2', source: 'API', target: 'Check', label: 'request' },
    { id: 'e3', source: 'API', target: 'Backend' },
    { id: 'e4', source: 'Backend', target: 'Auth' },
    { id: 'e5', source: 'Backend', target: 'DB' },
  ],
};
