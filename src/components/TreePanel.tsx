import { useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import { useDiagram } from '../store';
import { useFoldMotion } from '../foldMotion';
import type { DiagramNode } from '../types';
import { Icon } from './Icon';
import { showDeck, showPage } from '../dock';

function EditableLabel({ label, fallback, onSave }: {
  label: string;
  fallback: string;
  onSave: (label: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft !== null) {
    return (
      <input
        className="mf-tree-edit"
        aria-label={`Rename ${fallback}`}
        autoFocus
        value={draft}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== label) onSave(draft);
          setDraft(null);
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') setDraft(null);
        }}
      />
    );
  }
  return (
    <span className="mf-tree-label" tabIndex={0} role="button"
      aria-label={`Rename ${fallback}`} title="Double-click to rename"
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === 'F2') {
          event.preventDefault();
          event.stopPropagation();
          setDraft(label);
        }
      }} onDoubleClick={() => setDraft(label)}>
      {label || fallback}
    </span>
  );
}

export function TreePanel() {
  const nodes = useDiagram((s) => s.nodes);
  const edges = useDiagram((s) => s.edges);
  const pages = useDiagram((s) => s.pages);
  const decks = useDiagram((s) => s.decks);
  const selectedNodeIds = useDiagram((s) => s.selectedNodeIds);
  const selectedEdgeIds = useDiagram((s) => s.selectedEdgeIds);
  const highlight = useDiagram((s) => s.highlight);
  const setHighlight = useDiagram((s) => s.setHighlight);
  const setSelection = useDiagram((s) => s.setSelection);
  const updateLabel = useDiagram((s) => s.updateLabel);
  const updateEdgeLabel = useDiagram((s) => s.updateEdgeLabel);
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const pagesById = useMemo(() => new Map(pages.map((page) => [page.id, page])), [pages]);
  const children = useMemo(() => {
    const result = new Map<string | null, DiagramNode[]>();
    for (const node of nodes) {
      const parent = node.parentId && byId.has(node.parentId) ? node.parentId : null;
      const siblings = result.get(parent) ?? [];
      siblings.push(node);
      result.set(parent, siblings);
    }
    return result;
  }, [nodes, byId]);

  const select = (event: MouseEvent, kind: 'node' | 'edge', id: string) => {
    const reveal = new Set<string>();
    const revealParents = (nodeId: string) => {
      let parent = byId.get(nodeId)?.parentId;
      while (parent && !reveal.has(parent)) {
        reveal.add(parent);
        parent = byId.get(parent)?.parentId;
      }
    };
    if (kind === 'node') revealParents(id);
    else {
      const edge = edges.find((edge) => edge.id === id);
      if (edge) {
        revealParents(edge.source);
        revealParents(edge.target);
      }
    }
    const motion = useFoldMotion.getState();
    const folding = motion.phase === 'folding' ? new Set(motion.anchor.values()) : new Set<string>();
    const folded = [...reveal].filter((id) => byId.get(id)?.collapsed || folding.has(id));
    if (folded.length) motion.unfold(folded);
    const extend = event.metaKey || event.ctrlKey || event.shiftKey;
    const toggle = (ids: string[]) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
    setSelection(
      kind === 'node' ? (extend ? toggle(selectedNodeIds) : [id]) : (extend ? selectedNodeIds : []),
      kind === 'edge' ? (extend ? toggle(selectedEdgeIds) : [id]) : (extend ? selectedEdgeIds : []),
    );
  };

  const rowClass = (kind: 'node' | 'edge', id: string, selected: boolean) =>
    `mf-tree-row${selected ? ' selected' : ''}${highlight?.kind === kind && highlight.id === id ? ' active' : ''}`;

  const renderNodes = (parentId: string | null) => (
    <ul className="mf-tree-list">
      {(children.get(parentId) ?? []).map((node) => {
        const count = children.get(node.id)?.length ?? 0;
        const linkedPages = (node.pageIds ?? []).flatMap((id) => {
          const page = pagesById.get(id);
          return page ? [page] : [];
        });
        const linkedDecks = (node.deckIds ?? []).flatMap((id) => decks.find((deck) => deck.id === id) ?? []);
        const hasChildren = count > 0 || linkedPages.length + linkedDecks.length > 0;
        const expanded = !closed.has(node.id);
        return (
          <li key={node.id}>
            <div className={rowClass('node', node.id, selectedNodeIds.includes(node.id))}
              onMouseEnter={() => setHighlight({ kind: 'node', id: node.id })}
              onMouseLeave={() => setHighlight(null)}>
              {hasChildren ? (
                <button className="mf-tree-toggle" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.label || node.id}`}
                  aria-expanded={expanded} onClick={() => setClosed((previous) => {
                    const next = new Set(previous);
                    if (next.has(node.id)) next.delete(node.id);
                    else next.add(node.id);
                    return next;
                  })}>
                  <span className={expanded ? 'mf-tree-chevron expanded' : 'mf-tree-chevron'}>›</span>
                </button>
              ) : <span className="mf-tree-spacer" />}
              <button className="mf-tree-select" aria-label={`Select ${node.label || node.id}`}
                aria-pressed={selectedNodeIds.includes(node.id)} onClick={(event) => select(event, 'node', node.id)}>
                <Icon name={count ? 'group' : node.shape === 'diamond' ? 'diamond' : node.shape === 'circle' ? 'circle' : 'rect'} size={14} />
              </button>
              <div className="mf-tree-name" onClick={(event) => select(event, 'node', node.id)}>
                <EditableLabel label={node.label} fallback={node.id} onSave={(label) => updateLabel(node.id, label)} />
              </div>
              <span className="mf-tree-id">{node.id}</span>
            </div>
            {hasChildren && expanded && <>
              {linkedDecks.length > 0 && <ul className="mf-tree-list">
                {linkedDecks.map((deck) => <li key={deck.id}>
                  <button className="mf-tree-page" onClick={() => showDeck(node.id, deck.id)}
                    title={deck.title || 'Untitled'}>
                    <Icon name="deck" size={14} />
                    <span>{deck.title || 'Untitled'}</span>
                  </button>
                </li>)}
              </ul>}
              {linkedPages.length > 0 && <ul className="mf-tree-list">
                {linkedPages.map((page) => <li key={page.id}>
                  <button className="mf-tree-page" onClick={(event) => {
                    select(event, 'node', node.id);
                    showPage(node.id, page.id);
                  }}
                    title={page.title || 'Untitled'}>
                    <Icon name="page" size={14} />
                    <span>{page.title || 'Untitled'}</span>
                  </button>
                </li>)}
              </ul>}
              {count > 0 && renderNodes(node.id)}
            </>}
          </li>
        );
      })}
    </ul>
  );

  return (
    <nav className="mf-tree" aria-label="Diagram tree">
      {nodes.length === 0 ? <p className="mf-tree-empty">No nodes</p> : renderNodes(null)}
      {edges.length > 0 && <>
        <h3 className="mf-tree-heading">Connections</h3>
        <ul className="mf-tree-list">
          {edges.map((edge) => {
            const endpoints = `${byId.get(edge.source)?.label || edge.source} → ${byId.get(edge.target)?.label || edge.target}`;
            return (
              <li key={edge.id} title={endpoints} className={rowClass('edge', edge.id, selectedEdgeIds.includes(edge.id))}
                onMouseEnter={() => setHighlight({ kind: 'edge', id: edge.id })}
                onMouseLeave={() => setHighlight(null)}>
                <button className="mf-tree-select" aria-label={`Select connection ${endpoints}`}
                  aria-pressed={selectedEdgeIds.includes(edge.id)} onClick={(event) => select(event, 'edge', edge.id)}>
                  <Icon name="tidy-right" size={14} />
                </button>
                <div className="mf-tree-name" onClick={(event) => select(event, 'edge', edge.id)}>
                  <EditableLabel label={edge.label ?? ''} fallback={endpoints} onSave={(label) => updateEdgeLabel(edge.id, label)} />
                </div>
              </li>
            );
          })}
        </ul>
      </>}
    </nav>
  );
}
