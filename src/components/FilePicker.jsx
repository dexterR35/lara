import { useRef } from 'react'
import { useConfirm } from '../state/ConfirmContext'
import Button from './Button'

export default function FilePicker({ accept, multiple = false, directory = false, onFiles, confirm, children, ...buttonProps }) {
  const input = useRef(null)
  const ask = useConfirm()

  const selected = (event) => {
    const files = [...event.target.files]
    event.target.value = ''
    if (files.length) onFiles(multiple || directory ? files : files[0])
  }

  const open = async () => {
    if (confirm && !(await ask(confirm))) return
    input.current?.click()
  }

  const directoryProps = directory ? { webkitdirectory: '', directory: '' } : {}

  return <>
    <Button {...buttonProps} onClick={open}>{children}</Button>
    <input ref={input} hidden type="file" accept={accept} multiple={multiple || directory} onChange={selected} {...directoryProps}/>
  </>
}
