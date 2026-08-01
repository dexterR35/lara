import { Component } from 'react'
import { RefreshCw, RotateCcw } from 'lucide-react'
import Button from './Button'

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) { return { error } }

  componentDidCatch(error, details) { console.error('Lara recovered from an interface error', error, details) }

  reload = () => window.location.reload()

  reset = () => {
    sessionStorage.removeItem('lara.workspace.v2')
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children
    return <main className="fatal-error">
      <img src="/lara-icon.svg" alt=""/>
      <p className="eyebrow">Recovery mode</p>
      <h1>The workspace hit an unexpected error.</h1>
      <p>Your session is still available. Reload first, or clear only Lara’s current workspace if the file itself is invalid.</p>
      <code>{this.state.error.message}</code>
      <div><Button variant="primary" icon={RefreshCw} onClick={this.reload}>Reload Lara</Button><Button icon={RotateCcw} onClick={this.reset}>Clear workspace</Button></div>
    </main>
  }
}
