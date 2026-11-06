import { useCallback, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useDiagram } from './store';
import { DiagramNode, type NodeData } from './components/DiagramNode';
import { JoinPreview } from './components/JoinPreview';
import { MermaidPanel } from './components/MermaidPanel';
import { toggleTheme, useTheme } from './theme';
import type { NodeShape } from './types';
import { SAMPLE } from './sample';
import './App.css';

const nodeTypes: NodeTypes = { diagram: DiagramNode };

function Canvas() {
  const nodes = useDiagram((s) => s.nodes);
  const edges = useDiagram((s) => s.edges);
  const addNode = useDiagram((s) => s.addNode);
  const moveNode = useDiagram((s) => s.moveNode);
  const connect = useDiagram((s) => s.connect);
  const isGroup = useDiagram((s) => s.isGroup);
  const hiddenNodeIds = useDiagram((s) => s.hiddenNodeIds);
  const autoLayout = useDiagram((s) => s.autoLayout);
  const { fitView } = useReactFlow();
  const theme = useTheme();

  const tidy = useCallback(
    (direction: 'TB' | 'LR') => {
      autoLayout(direction);
      // let positions commit, then frame the result
      window.requestAnimationFrame(() =>
        fitView({ padding: 0.2, duration: 300 }),
      );
    },
    [autoLayout, fitView],
  );

  const hidden = useMemo(() => hiddenNodeIds(), [hiddenNodeIds, nodes]);

  const rfNodes: Node<NodeData>[] = useMemo(
    () =>
      nodes
        .filter((n) => !hidden.has(n.id))
        .map((n) => ({
          id: n.id,
          type: 'diagram',
          position: n.position,
          data: {
            label: n.label,
            shape: n.shape,
            isGroup: isGroup(n.id),
            collapsed: n.collapsed,
            childCount: nodes.filter((c) => c.parentId === n.id).length,
          },
        })),
    [nodes, hidden, isGroup],
  );

  const rfEdges: Edge[] = useMemo(
    () =>
      edges
        .filter((e) => !hidden.has(e.source) && !hidden.has(e.target))
        .map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.label,
          animated: false,
        })),
    [edges, hidden],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const c of changes) {
        if (c.type === 'position' && c.position && c.dragging === false) {
          moveNode(c.id, c.position);
        } else if (c.type === 'position' && c.position && c.dragging) {
          moveNode(c.id, c.position);
        }
      }
    },
    [moveNode],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.target) connect(c.source, c.target);
    },
    [connect],
  );

  const [connecting, setConnecting] = useState(false);

  const addAt = (shape: NodeShape) =>
    addNode(shape, { x: 120 + Math.random() * 240, y: 120 + Math.random() * 180 });

  return (
    <div className={`mf-canvas ${connecting ? 'is-connecting' : ''}`}>
      <div className="mf-toolbar">
        <span className="mf-brand">merfolk</span>
        <button onClick={() => addAt('rect')}>+ Rect</button>
        <button onClick={() => addAt('round')}>+ Round</button>
        <button onClick={() => addAt('diamond')}>+ Diamond</button>
        <button onClick={() => addAt('circle')}>+ Circle</button>
        <span className="mf-sep" />
        <button onClick={() => tidy('TB')}>Tidy ↓</button>
        <button onClick={() => tidy('LR')}>Tidy →</button>
        <span className="mf-sep" />
        <button
          className="mf-icon"
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={() => toggleTheme()}
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </div>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onConnectStart={() => setConnecting(true)}
        onConnectEnd={() => setConnecting(false)}
        connectionLineComponent={JoinPreview}
        colorMode={theme}
        fitView
      >
        <Background gap={18} />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}

export default function App() {
  const [panelOpen, setPanelOpen] = useState(true);
  const load = useDiagram((s) => s.load);

  // seed once with a sample so the canvas isn't empty on first run
  useMemo(() => {
    if (useDiagram.getState().nodes.length === 0) load(SAMPLE);
  }, [load]);

  return (
    <ReactFlowProvider>
      <div className="mf-app">
        <Canvas />
        {panelOpen ? (
          <MermaidPanel onClose={() => setPanelOpen(false)} />
        ) : (
          <button className="mf-reopen" onClick={() => setPanelOpen(true)}>
            Mermaid
          </button>
        )}
      </div>
    </ReactFlowProvider>
  );
}
