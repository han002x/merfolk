import { useEffect, useState } from 'react';
import { useDiagram } from '../store';

export function MermaidPanel({ onClose }: { onClose: () => void }) {
  const exportMermaid = useDiagram((s) => s.exportMermaid);
  const loadMermaid = useDiagram((s) => s.loadMermaid);
  const nodes = useDiagram((s) => s.nodes);
  const edges = useDiagram((s) => s.edges);

  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);

  // keep export view in sync with the live diagram
  useEffect(() => {
    setText(exportMermaid());
  }, [nodes, edges, exportMermaid]);

  const apply = () => {
    try {
      loadMermaid(text);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const copy = () => navigator.clipboard?.writeText(text);

  return (
    <aside className="mf-panel">
      <div className="mf-panel-head">
        <strong>Mermaid</strong>
        <button onClick={onClose}>✕</button>
      </div>
      <textarea
        className="mf-mermaid-text"
        value={text}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
      />
      {err && <div className="mf-err">{err}</div>}
      <div className="mf-panel-actions">
        <button onClick={apply}>Import → canvas</button>
        <button onClick={copy}>Copy</button>
      </div>
    </aside>
  );
}
