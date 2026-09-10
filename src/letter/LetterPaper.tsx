import { forwardRef } from "react";

type Props = { photoUrls: string[]; clipUrl?: string; audioUrl?: string | null; addressTo: string; body: string; signature: string; preview?: boolean; capturing?: boolean };

export const LetterPaper = forwardRef<HTMLElement, Props>(function LetterPaper({photoUrls, clipUrl, audioUrl, addressTo, body, signature, preview=false, capturing=false}, ref) {
  const count = photoUrls.length + Number(Boolean(clipUrl));
  return <article ref={ref} className="letter-paper" aria-label={preview ? "おてがみのようす" : "お手紙"}>
    <div className="paper-postmark"><span>まごころ</span><span className="postmark-rule" /><span>おてがみ</span></div>
    <p className={`letter-address ${!addressTo ? "empty-hint" : ""}`}>{addressTo || (preview ? "あてな" : "")}</p>
    {count ? <div className={`letter-media-grid media-count-${count}`} role="group" aria-label="手紙の写真">
      {clipUrl && <div className="stamp-frame"><video className="letter-clip" src={clipUrl} controls={!capturing} playsInline aria-label="手紙の動画" /></div>}
      {photoUrls.map((src,n)=><div key={`${src}-${n}`} className="stamp-frame"><img className="letter-photo" src={src} alt={`手紙の写真 ${n+1}`} /></div>)}
    </div> : <div className="empty-media"><span>しゃしんや どうがを</span><span>ここに かざろう</span></div>}
    <p className={`letter-body ${!body ? "empty-hint" : ""}`}>{body || (preview ? "ここに、あなたのことばがはいります。" : "")}</p>
    <p className={`letter-signature ${!signature ? "empty-hint" : ""}`}>{signature || (preview ? "おなまえ" : "")}</p>
    {audioUrl && <div className="paper-voice"><p>こえをきく</p><audio className="letter-audio" src={audioUrl} controls aria-label="手紙の声" /></div>}
  </article>;
});
