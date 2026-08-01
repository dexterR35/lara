import { ArrowLeft, Archive, Images, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Help() {
  return <div className="help-page"><Link className="back-link" to="/editor"><ArrowLeft size={16}/> Back to editor</Link><p className="eyebrow">Lara guide</p><h1>Edit Lottie image assets without a backend.</h1><div className="help-grid"><article className="panel"><Images/><h2>1. Open & replace</h2><p>Drop a Lottie JSON, choose an asset, then upload its replacement. For batch work, filenames should begin with the Lottie asset ID.</p></article><article className="panel"><ShieldCheck/><h2>2. Preview privately</h2><p>Everything runs in this tab. Your workspace survives refresh through session storage and is removed when the tab session closes or you press Reset.</p></article><article className="panel"><Archive/><h2>3. Build & export</h2><p>Download a self-contained rebuilt JSON, or export a ZIP containing the JSON, image files, and a manifest.</p></article></div></div>
}
