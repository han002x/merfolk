import type { Diagram } from '../types';
export default function DiagramMenu({ onNew }: { onNew: (kind: Diagram['kind']) => void }) {
  return <details className="mf-diagram-menu"><summary>New diagram</summary><div>
    {(['flowchart', 'sequence', 'er', 'class'] as const).map((kind) => <button key={kind} onClick={(event) => {
      event.currentTarget.closest('details')?.removeAttribute('open'); onNew(kind);
    }}>New {kind === 'er' ? 'ER diagram' : kind === 'class' ? 'class diagram' : kind}</button>)}
  </div></details>;
}
