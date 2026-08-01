import { useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'
import Button from './Button'

export default function ConfirmDialog({ title, message, confirmLabel = 'Yes', cancelLabel = 'No', tone = 'default', onConfirm, onCancel }) {
  const cancelRef = useRef(null)

  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (event) => {
      if (event.key === 'Escape') onCancel()
      if (event.key === 'Enter') onConfirm()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, onConfirm])

  return <div className="confirm-backdrop" role="presentation" onClick={onCancel}>
    <div className={`confirm-dialog panel ${tone === 'danger' ? 'confirm-danger' : ''}`} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message" onClick={(event) => event.stopPropagation()}>
      <div className="confirm-icon" aria-hidden="true"><AlertTriangle size={22}/></div>
      <h2 id="confirm-title">{title}</h2>
      <p id="confirm-message">{message}</p>
      <div className="confirm-actions">
        <Button ref={cancelRef} variant="ghost" onClick={onCancel}>{cancelLabel}</Button>
        <Button variant="primary" onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </div>
  </div>
}
