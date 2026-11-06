import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useDiagram } from './store';
import { DiagramNode, type NodeData } from './components/DiagramNode';
import { DiagramEdge } from './components/DiagramEdge';
import { JoinPreview } from './components/JoinPreview';
import { MermaidPanel } from './components/MermaidPanel';
import { Icon } from './components/Icon';
import { toggleTheme, useTheme } from './theme';
import { useHotkeys } from './useHotkeys';
import {
  startAutosave,
  restore,
  exportFile,
  importFile,
  clearSaved,
} from './persist';
import type { NodeShape } from './types';
import { SAMPLE } from './sample';
import './App.css';

const nodeTypes: NodeTypes = { diagram: DiagramNode };
const edgeTypes: EdgeTypes = { diagram: DiagramEdge };

/** A toolbar button whose tooltip announces its keyboard shortcut. */
function ToolButton({
  label,
  hotkey,
  onClick,
  children,
}: {
  label: string;
  hotkey?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className="mf-tool"
      aria-label={label}
      title={hotkey ? `${label}  ·  ${hotkey}` : label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Canvas({ onTogglePanel }: { onTogglePanel: () => void }) {
  const nodes = useDiagram((s) => s.nodes);
  const edges = useDiagram((s) => s.edges);
  const addNode = useDiagram((s) => s.addNode);
  const moveNode = useDiagram((s) => s.moveNode);
  const removeNode = useDiagram((s) => s.removeNode);
  const connect = useDiagram((s) => s.connect);
  const isGroup = useDiagram((s) => s.isGroup);
  const hiddenNodeIds = useDiagram((s) => s.hiddenNodeIds);
  const autoLayout = useDiagram((s) => s.autoLayout);
  const { fitView } = useReactFlow();
  const load = useDiagram((s) => s.load);
  const theme = useTheme();
  const [selected, setSelected] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const onPickFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ''; // allow re-importing the same file
      if (!file) return;
      try {
        await importFile(file);
        window.requestAnimationFrame(() => fitView({ padding: 0.2, duration: 300 }));
      } catch {
        // ignore malformed files; a real validation UI can come later
      }
    },
    [fitView],
  );

  const clearCanvas = useCallback(() => {
    clearSaved();
    load({ nodes: [], edges: [] });
  }, [load]);

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
          type: 'diagram',
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
        if (c.type === 'position' && c.position) {
          moveNode(c.id, c.position);
        } else if (c.type === 'select') {
          setSelected((prev) =>
            c.selected
              ? [...new Set([...prev, c.id])]
              : prev.filter((id) => id !== c.id),
          );
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

  const addAt = useCallback(
    (shape: NodeShape) =>
      addNode(shape, {
        x: 120 + Math.random() * 240,
        y: 120 + Math.random() * 180,
      }),
    [addNode],
  );

  const deleteSelected = useCallback(() => {
    selected.forEach((id) => removeNode(id));
    setSelected([]);
  }, [selected, removeNode]);

  useHotkeys(
    useMemo(
      () => [
        { key: 'r', run: () => addAt('rect') },
        { key: 'o', run: () => addAt('round') },
        { key: 'd', run: () => addAt('diamond') },
        { key: 'c', run: () => addAt('circle') },
        { key: 'l', run: () => tidy('TB') },
        { key: 'l', shift: true, run: () => tidy('LR') },
        { key: 't', run: () => toggleTheme() },
        { key: 'm', run: onTogglePanel },
        { key: 'backspace', run: deleteSelected },
        { key: 'delete', run: deleteSelected },
      ],
      [addAt, tidy, onTogglePanel, deleteSelected],
    ),
  );

  return (
    <div className={`mf-canvas ${connecting ? 'is-connecting' : ''}`}>
      <div className="mf-toolbar">
        <span className="mf-brand">merfolk</span>
        <div className="mf-group-btns">
          <ToolButton label="Rectangle" hotkey="R" onClick={() => addAt('rect')}>
            <Icon name="rect" />
          </ToolButton>
          <ToolButton label="Rounded" hotkey="O" onClick={() => addAt('round')}>
            <Icon name="round" />
          </ToolButton>
          <ToolButton label="Diamond" hotkey="D" onClick={() => addAt('diamond')}>
            <Icon name="diamond" />
          </ToolButton>
          <ToolButton label="Circle" hotkey="C" onClick={() => addAt('circle')}>
            <Icon name="circle" />
          </ToolButton>
        </div>
        <span className="mf-sep" />
        <div className="mf-group-btns">
          <ToolButton label="Tidy down" hotkey="L" onClick={() => tidy('TB')}>
            <Icon name="tidy-down" />
          </ToolButton>
          <ToolButton label="Tidy right" hotkey="⇧L" onClick={() => tidy('LR')}>
            <Icon name="tidy-right" />
          </ToolButton>
        </div>
        <span className="mf-sep" />
        <div className="mf-group-btns">
          <ToolButton label="Export file" onClick={() => exportFile()}>
            <Icon name="export" />
          </ToolButton>
          <ToolButton label="Import file" onClick={() => fileInput.current?.click()}>
            <Icon name="import" />
          </ToolButton>
          <ToolButton label="Clear canvas" onClick={clearCanvas}>
            <Icon name="trash" />
          </ToolButton>
        </div>
        <span className="mf-sep" />
        <ToolButton
          label={theme === 'dark' ? 'Light theme' : 'Dark theme'}
          hotkey="T"
          onClick={() => toggleTheme()}
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        </ToolButton>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={onPickFile}
        />
      </div>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onConnectStart={() => setConnecting(true)}
        onConnectEnd={() => setConnecting(false)}
        connectionLineComponent={JoinPreview}
        colorMode={theme}
        deleteKeyCode={null}
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

  // on first mount: restore the saved diagram, or seed the sample; then
  // begin autosaving every change back to localStorage
  useEffect(() => {
    if (useDiagram.getState().nodes.length === 0 && !restore()) {
      load(SAMPLE);
    }
    const stop = startAutosave();
    return stop;
  }, [load]);

  return (
    <ReactFlowProvider>
      <div className="mf-app">
        <Canvas onTogglePanel={() => setPanelOpen((v) => !v)} />
        {panelOpen ? (
          <MermaidPanel onClose={() => setPanelOpen(false)} />
        ) : (
          <button
            className="mf-reopen"
            title="Mermaid  ·  M"
            aria-label="Open Mermaid panel"
            onClick={() => setPanelOpen(true)}
          >
            <Icon name="code" />
          </button>
        )}
      </div>
    </ReactFlowProvider>
  );
}
