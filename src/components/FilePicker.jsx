import { useRef } from 'react'
import Button from './Button'

export default function FilePicker({ accept, multiple = false, directory = false, onFiles, children, ...buttonProps }) {
  const input = useRef(null)

  const selected = (event) => {
    const files = [...event.target.files]
    event.target.value = ''
    if (files.length) onFiles(multiple || directory ? files : files[0])
  }

  const directoryProps = directory ? { webkitdirectory: '', directory: '' } : {}

  return <>
    <Button {...buttonProps} onClick={() => input.current?.click()}>{children}</Button>
    <input ref={input} hidden type="file" accept={accept} multiple={multiple || directory} onChange={selected} {...directoryProps}/>
  </>
}
