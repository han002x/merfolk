import { useEffect, useState } from 'react';
import { useDiagram } from '../store';
import { Icon } from './Icon';

export function MermaidPanel({ onClose }: { onClose: () => void }) {
  const exportMermaid = useDiagram((s) => s.exportMermaid);
  const loadMermaid = useDiagram((s) => s.loadMermaid);
  const autoLayout = useDiagram((s) => s.autoLayout);
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
      autoLayout('TB');
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard?.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <aside className="mf-panel">
      <div className="mf-panel-head">
        <span className="mf-panel-title">Mermaid</span>
        <button
          className="mf-tool"
          aria-label="Close panel"
          title="Close  ·  M"
          onClick={onClose}
        >
          <Icon name="close" size={15} />
        </button>
      </div>
      <textarea
        className="mf-mermaid-text"
        value={text}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
      />
      {err && <div className="mf-err">{err}</div>}
      <div className="mf-panel-actions">
        <button className="mf-primary" onClick={apply}>
          Import
        </button>
        <button onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
    </aside>
  );
}
