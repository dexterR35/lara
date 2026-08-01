import { ArrowLeft, Archive, Images, ShieldCheck } from 'lucide-react'

const topics = [
  { icon: Images, title: '1. Open, extract & replace', copy: 'Drop a Lottie JSON or dotLottie file, choose an embedded image to download, or upload a replacement. Batch filenames should begin with the Lottie asset ID.' },
  { icon: ShieldCheck, title: '2. Preview privately', copy: 'Everything runs in this tab. The workspace survives refresh through session storage and clears when the tab session closes or Reset is pressed.' },
  { icon: Archive, title: '3. Build & export', copy: 'Download a rebuilt JSON, or export all embedded images in a ZIP with image metadata and referenced font details.' },
]

export default function Help() {
  return <div className="help-page"><a className="back-link" href="#/editor"><ArrowLeft size={16}/>Back to editor</a><p className="eyebrow">Lara guide</p><h1>Edit Lottie image assets without a backend.</h1><div className="help-grid">{topics.map(({ icon: Icon, title, copy }) => <article className="panel" key={title}><Icon/><h2>{title}</h2><p>{copy}</p></article>)}</div></div>
}
