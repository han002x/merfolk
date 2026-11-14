import { useSyncExternalStore } from 'react';
import { downloadWorkspaceDraft, reloadWorkspace, subscribeWorkspaceStatus, workspaceStatus } from '../liveWorkspace.ts';

export default function WorkspaceStatus() {
  const status = useSyncExternalStore(subscribeWorkspaceStatus, workspaceStatus);
  if (status.kind === 'saved' || status.kind === 'saving') return null;
  return <aside role="alert" style={{ position: 'fixed', bottom: 16, left: 16, right: 16, zIndex: 10000, padding: 16, background: 'var(--panel, #fff4da)', color: 'var(--text, #222)', border: '1px solid currentColor', borderRadius: 8 }}>
    {status.message}
    <button onClick={downloadWorkspaceDraft}>Download draft</button>
    <button onClick={() => { void reloadWorkspace(); }}>Reload latest</button>
  </aside>;
}
