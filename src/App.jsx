import { lazy, Suspense, useEffect, useState } from 'react'
import { HelpCircle, RotateCcw } from 'lucide-react'
import { ConfirmProvider, useConfirm } from './state/ConfirmContext'
import { WorkspaceProvider, useWorkspace } from './state/WorkspaceContext'
import Button from './components/Button'

const Editor = lazy(() => import('./pages/Editor'))
const Help = lazy(() => import('./pages/Help'))
const views = { '/editor': Editor, '/help': Help }

function useHashView() {
  const read = () => window.location.hash.slice(1) || '/editor'
  const [path, setPath] = useState(read)
  useEffect(() => {
    const changed = () => {
      const next = read()
      if (views[next]) setPath(next)
      else window.location.replace('#/editor')
    }
    window.addEventListener('hashchange', changed)
    changed()
    return () => window.removeEventListener('hashchange', changed)
  }, [])
  return views[path] || Editor
}

function Outlet({ view: View }) {
  return <Suspense fallback={<div className="route-loading" role="status">Loading workspace…</div>}><View/></Suspense>
}

function Layout() {
  const { reset, source, storageState } = useWorkspace()
  const ask = useConfirm()
  const View = useHashView()
  const storageLabel = storageState === 'saved' ? 'Session saved' : storageState === 'saving' ? 'Saving session…' : 'Memory only'

  const resetWorkspace = async () => {
    if (!(await ask({
      title: 'Reset workspace?',
      message: 'Clear the current Lottie file and all replacements from this session.',
      tone: 'danger',
    }))) return
    reset()
  }

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#/editor" aria-label="Lara home"><img src="/lara-icon.svg" alt=""/><span className="brand-tag">Lara</span></a>
      <div className="topbar-actions"><span className={`session-badge session-${storageState}`}><span/> {storageLabel}</span><a className="icon-link" href="#/help" title="Help" aria-label="Open help"><HelpCircle size={18}/></a><Button variant="ghost" icon={RotateCcw} disabled={!source} onClick={resetWorkspace}>Reset</Button></div>
    </header>
    <main className="app-main"><Outlet view={View}/></main>
  </div>
}

export default function App() {
  return <WorkspaceProvider>
    <ConfirmProvider>
      <Layout/>
    </ConfirmProvider>
  </WorkspaceProvider>
}
