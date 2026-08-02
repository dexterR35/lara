import { useEffect, useRef } from 'react'
import Button from './Button'

export default function ConfirmDialog({ title, message, confirmLabel = 'Yes', cancelLabel = 'No', tone = 'default', onConfirm, onCancel }) {
  const cancelRef = useRef(null)

  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (event) => {
      if (event.key === 'Escape') onCancel()
      else if (event.key === 'Enter') onConfirm()
    }
    // Defer so Enter from a just-closed file picker does not auto-confirm.
    const timer = window.setTimeout(() => window.addEventListener('keydown', onKey), 0)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
    }
  }, [onCancel, onConfirm])

  return <div className="confirm-backdrop" onClick={onCancel}>
    <div
      className={`confirm-dialog panel ${tone === 'danger' ? 'confirm-danger' : ''}`}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-message"
      onClick={(event) => event.stopPropagation()}
    >
      <h2 id="confirm-title">{title}</h2>
      <p id="confirm-message">{message}</p>
      <div className="confirm-actions">
        <Button ref={cancelRef} className="confirm-secondary" onClick={onCancel}>{cancelLabel}</Button>
        <Button variant="primary" className="confirm-primary" onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </div>
  </div>
}
