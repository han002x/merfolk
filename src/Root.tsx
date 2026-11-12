import { lazy, Suspense } from 'react'
import App from './App.tsx'
import { parseRoute, useHash } from './route.ts'

// the wiki and the slides are their own windows; keep them out of the canvas bundle
const WikiApp = lazy(() => import('./wiki/WikiApp.tsx'))
const SlidesApp = lazy(() => import('./slides/SlidesApp.tsx'))

export default function Root() {
  const route = parseRoute(useHash())
  if (route.kind === 'wiki')
    return (
      <Suspense fallback={null}>
        <WikiApp pageId={route.id} nodeId={route.nodeId} />
      </Suspense>
    )
  if (route.kind === 'slides')
    return (
      <Suspense fallback={null}>
        <SlidesApp deckId={route.id} nodeId={route.nodeId} slide={route.slide} presenter={route.presenter} />
      </Suspense>
    )
  return <App />
}
