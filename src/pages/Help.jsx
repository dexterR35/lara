import { ArrowLeft, Archive, Diamond, Images, ShieldCheck } from 'lucide-react'

const topics = [
  { icon: Images, title: '1. Open, extract & replace', copy: 'Drop a Lottie JSON or dotLottie file, choose an embedded image to download, or upload a replacement. Batch filenames should begin with the Lottie asset ID.' },
  { icon: Diamond, title: '2. Animate layers', copy: 'Open Timeline, select and expand a layer, move the playhead, then press a diamond beside a transform. Drag the selected artwork in the preview to create a position keyframe.' },
  { icon: ShieldCheck, title: '3. Preview privately', copy: 'Everything runs in this tab. The workspace survives refresh through session storage and clears when the tab session closes or Reset is pressed.' },
  { icon: Archive, title: '4. Build & export', copy: 'Download a rebuilt JSON with timeline edits, or export all embedded images in a ZIP with image metadata and referenced font details.' },
]

export default function Help() {
  return <div className="help-page"><a className="back-link" href="#/editor"><ArrowLeft size={16}/>Back to editor</a><p className="eyebrow">Lara guide</p><h1>Edit and animate Lottie layers without a backend.</h1><div className="help-grid">{topics.map(({ icon: Icon, title, copy }) => <article className="panel" key={title}><Icon/><h2>{title}</h2><p>{copy}</p></article>)}</div></div>
}
