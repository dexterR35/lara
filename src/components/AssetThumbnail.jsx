import { useEffect, useState } from 'react'
import { Image } from 'lucide-react'
import { safeImageSource } from '../lib/lottie'

export default function AssetThumbnail({ src, label }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  const safeSource = safeImageSource(src)

  return <span className="thumbnail">
    {safeSource && !failed ? <img src={safeSource} alt={label ? `${label} preview` : ''} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)}/> : <Image size={18} aria-hidden="true"/>}
  </span>
}
