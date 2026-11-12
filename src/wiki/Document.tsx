import { useState } from 'react';
import Editor from './Editor';
import SourceEditor from './SourceEditor';
import Preview from './Preview';
import { requiresSource } from './extensions';

export type PageMode = 'edit' | 'read' | 'source';
interface Props {
  value: string;
  onChange: (value: string) => void;
  targets: () => string[];
  nodeId?: string;
  onPage: (id: string) => void;
  onNode?: (id: string) => void;
  mode?: PageMode;
  onMode?: (mode: PageMode) => void;
}
export default function Document(props: Props) {
  const [localMode, setLocalMode] = useState<PageMode>('edit');
  const mode = props.mode ?? localMode;
  const sourceOnly = requiresSource(props.value);
  const effective = mode === 'edit' && sourceOnly ? 'source' : mode;
  return <section className="wk-document">
    <div className="wk-seg" role="tablist" aria-label="Page mode">
      {(['edit', 'read', 'source'] as const).map((m) => <button key={m} type="button" role="tab" aria-selected={effective === m} disabled={m === 'edit' && sourceOnly} onClick={() => (props.onMode ?? setLocalMode)(m)}>
        {m === 'edit' ? 'Edit' : m === 'read' ? 'Read' : 'Markdown'}
      </button>)}
    </div>
    {sourceOnly && effective === 'source' && <div className="wk-source-notice">This page contains HTML. Edit its Markdown to preserve it.</div>}
    {effective === 'source' ? <SourceEditor value={props.value} onChange={props.onChange} targets={props.targets} />
      : effective === 'read' ? <div className="wk-read"><Preview body={props.value} nodeId={props.nodeId} onPage={props.onPage} onNode={props.onNode} /></div>
      : <Editor {...props} />}
  </section>;
}
