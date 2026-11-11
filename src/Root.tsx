import { lazy, Suspense } from 'react'
import App from './App.tsx'
import { parseRoute, useHash } from './route.ts'

// the wiki is its own window; keep its editor out of the canvas bundle
const WikiApp = lazy(() => import('./wiki/WikiApp.tsx'))

export default function Root() {
  const route = parseRoute(useHash())
  if (route.kind !== 'wiki') return <App />
  return (
    <Suspense fallback={null}>
      <WikiApp pageId={route.id} />
    </Suspense>
  )
}
