import { Link, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { HelpCircle, RotateCcw } from 'lucide-react'
import Editor from './pages/Editor'
import Help from './pages/Help'
import { WorkspaceProvider, useWorkspace } from './state/WorkspaceContext'
import Button from './components/Button'

function Layout() {
  const { reset, source } = useWorkspace()
  return <div className="app-shell">
    <header className="topbar">
      <Link className="brand" to="/editor" aria-label="Lara home"><img src="/lara-icon.svg" alt=""/><span>Lara</span><span className="brand-tag">Lottie studio</span></Link>
      <div className="topbar-actions"><span className="session-badge"><span/> Session saved</span><Link className="icon-link" to="/help" title="Help"><HelpCircle size={18}/></Link><Button variant="ghost" icon={RotateCcw} disabled={!source} onClick={reset}>Reset</Button></div>
    </header>
    <main className="app-main"><Outlet/></main>
  </div>
}

export default function App() {
  return <WorkspaceProvider><Routes><Route element={<Layout/>}><Route index element={<Navigate to="/editor" replace/>}/><Route path="/editor" element={<Editor/>}/><Route path="/help" element={<Help/>}/><Route path="*" element={<Navigate to="/editor" replace/>}/></Route></Routes></WorkspaceProvider>
}
