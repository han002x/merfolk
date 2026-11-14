import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// self-hosted fonts (bundled woff2, no network dependency)
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/kalam/400.css'
import '@fontsource/kalam/700.css'
import './legacy.ts'
import './index.css'
import Root from './Root.tsx'
import { initializeWorkspace } from './liveWorkspace.ts'

async function start() {
  await initializeWorkspace();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  );
}
void start().catch(error => {
  const root = document.getElementById('root');
  if (root) root.textContent = `Unable to open workspace: ${error instanceof Error ? error.message : String(error)}. Reload to retry.`;
});
