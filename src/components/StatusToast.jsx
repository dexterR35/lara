export default function StatusToast({ notice }) {
  if (!notice) return null
  return <div className={`toast toast-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'} aria-live="polite">{notice.message}</div>
}
