import { useEffect, useState } from 'react'
import { Image } from 'lucide-react'

export default function AssetThumbnail({ src, label }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])

  return <span className="thumbnail">
    {src && !failed ? <img src={src} alt={label ? `${label} preview` : ''} onError={() => setFailed(true)}/> : <Image size={18} aria-hidden="true"/>}
  </span>
}
