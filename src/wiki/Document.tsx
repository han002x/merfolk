import Editor from './Editor';
import SourceEditor from './SourceEditor';
import Preview from './Preview';
import { requiresSource } from './extensions';

export type PageMode = 'edit' | 'read' | 'source';
const names: Record<PageMode, string> = { edit: 'Edit', read: 'Read', source: 'Markdown' };

/** A page with raw HTML can only be edited as Markdown. */
const shown = (mode: PageMode, value: string): PageMode =>
  mode === 'edit' && requiresSource(value) ? 'source' : mode;

export function ModeSwitch({ value, mode, onMode }: {
  value: string;
  mode: PageMode;
  onMode: (mode: PageMode) => void;
}) {
  return <div className="wk-seg" role="tablist" aria-label="Page mode">
    {(['edit', 'read', 'source'] as const).map((m) => <button key={m} type="button" role="tab"
      aria-selected={shown(mode, value) === m} disabled={m === 'edit' && requiresSource(value)}
      onClick={() => onMode(m)}>
      {names[m]}
    </button>)}
  </div>;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  targets: () => string[];
  nodeId?: string;
  onPage: (id: string) => void;
  onNode?: (id: string) => void;
  mode: PageMode;
}
export default function Document(props: Props) {
  const mode = shown(props.mode, props.value);
  return <section className="wk-document">
    {mode === 'source' && requiresSource(props.value) && <div className="wk-source-notice">This page contains HTML. Edit its Markdown to preserve it.</div>}
    {mode === 'source' ? <SourceEditor value={props.value} onChange={props.onChange} targets={props.targets} />
      : mode === 'read' ? <div className="wk-read"><Preview body={props.value} nodeId={props.nodeId} onPage={props.onPage} onNode={props.onNode} /></div>
      : <Editor {...props} />}
  </section>;
}
