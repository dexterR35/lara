import { createContext, useCallback, useContext, useRef, useState } from 'react'
import ConfirmDialog from '../components/ConfirmDialog'

const ConfirmContext = createContext(null)

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null)
  const resolver = useRef(null)

  const confirm = useCallback((options) => new Promise((resolve) => {
    resolver.current?.(false)
    resolver.current = resolve
    setDialog({
      title: options.title || 'Are you sure?',
      message: options.message || 'Do you want to continue?',
      confirmLabel: options.confirmLabel || 'Yes',
      cancelLabel: options.cancelLabel || 'No',
      tone: options.tone || 'default',
    })
  }), [])

  const settle = useCallback((accepted) => {
    const resolve = resolver.current
    resolver.current = null
    setDialog(null)
    resolve?.(accepted)
  }, [])

  return <ConfirmContext.Provider value={confirm}>
    {children}
    {dialog && <ConfirmDialog {...dialog} onConfirm={() => settle(true)} onCancel={() => settle(false)}/>}
  </ConfirmContext.Provider>
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext)
  if (!confirm) throw new Error('useConfirm must be used inside ConfirmProvider')
  return confirm
}
