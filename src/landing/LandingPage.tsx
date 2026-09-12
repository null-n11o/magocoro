import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import brandLogo from "../assets/magocoro-logo.png";
import hero from "../assets/lp-hero.png";
import photos from "../assets/lp-step-photos.png";
import letter from "../assets/lp-step-letter.png";
import line from "../assets/lp-step-line.png";
import reactions from "../assets/lp-reactions.png";
import { LINE_FRIEND_URL } from "../share/line";
import { SampleLetter } from "./SampleLetter";
import "./landing.css";

type DialogKind = "sample" | "faq";
const questions = [
  ["登録やアプリは必要ですか？", "会員登録は不要です。アプリのインストールも必要ありません。送る人も受け取る人も、スマートフォンのブラウザで使えます。"],
  ["利用料金はかかりますか？", "無料でお手紙をつくって、届けられます。"],
  ["写真や動画はいくつ入れられますか？", "写真と動画をあわせて3つまで。動画は1本・30秒まで入れられます。"],
  ["声も必要ですか？", "声は任意で、30秒まで添えられます。声を添えなくても、写真とことばで届けられます。"],
  ["いつまで見られますか？", "お手紙は作成から90日間、見ることができます。期限がすぎると閉じます。"],
  ["誰が手紙を見ることができますか？", "リンクを知っている人が閲覧できます。届けたい相手にリンクを共有してください。"],
  ["LINEにはどうやって送りますか？", "できあがった手紙の「LINEで共有」から、送りたい友だちやグループを選んで送れます。リンクをコピーしたり、画像や動画にして送ることもできます。"],
];

function CreateLink({ compact = false }: { compact?: boolean }) {
  return <Link className={`landing-cta${compact ? " landing-cta-compact" : ""}`} to="/compose">手紙をつくる{!compact && <span aria-hidden="true"> →</span>}</Link>;
}

export function LandingPage() {
  const [dialogKind, setDialogKind] = useState<DialogKind | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (dialogKind) dialogRef.current?.showModal();
  }, [dialogKind]);

  function openDialog(kind: DialogKind, event: MouseEvent<HTMLButtonElement>) {
    triggerRef.current = event.currentTarget;
    setDialogKind(kind);
  }
  function closeDialog() {
    dialogRef.current?.close();
    setDialogKind(null);
    triggerRef.current?.focus();
  }
  function sampleButton() {
    return <button className="landing-sample-link" onClick={event => openDialog("sample", event)}>手紙の見本を見る<span aria-hidden="true"> ›</span></button>;
  }
  function navigation() {
    return <><a href="#how-it-works">使い方</a><button onClick={event => openDialog("faq", event)}>よくある質問</button></>;
  }

  return (
    <>
    <main className="landing-page">
      <div className="landing-intro">
        <div className="landing-hero-art"><img src={hero} alt="たんぽぽを吹く子どもの写真と、じいじ・ばあばに宛てた便箋の見本" width="1315" height="1196" fetchPriority="high" /></div>
        <header className="landing-header landing-container">
          <img className="landing-logo" src={brandLogo} alt="Magocoro" width="840" height="301" />
          <nav className="landing-nav" aria-label="メインナビゲーション">{navigation()}<CreateLink compact /></nav>
        </header>
        <section className="landing-hero landing-container" aria-labelledby="landing-title">
          <div className="landing-hero-copy">
            <h1 id="landing-title">なんでもない今日を、<br />とっておきの一通に。</h1>
            <p className="landing-description">写真に、ことばに、ときどき声。<br />じいじ・ばあばへ、いつものLINEで。</p>
            <div className="landing-actions"><CreateLink />{sampleButton()}<p className="landing-no-registration">アプリ不要・会員登録不要</p><div className="landing-line-entry"><a href={LINE_FRIEND_URL}>LINEで友だち追加</a><p>追加すると、次からLINEですぐにお手紙をつくれます。</p></div></div>
          </div>
        </section>
      </div>

      <section id="how-it-works" className="landing-how landing-container" aria-labelledby="landing-how-title">
        <h2 id="landing-how-title"><span>いつもの一枚が、</span><span>うれしい一通に。</span></h2>
        <p className="landing-how-intro">むずかしい操作はいりません。たった3つのステップで、想いを届けられます。</p>
        <ol className="landing-steps">
          <li><div className="landing-step-art"><span className="landing-step-number">01</span><img src={photos} alt="日常の子どもの写真を重ねた見本" width="600" height="400" loading="lazy" /></div><h3>写真か動画をえらぶ</h3><p>写真と動画をあわせて3つまで。動画は1本・30秒まで。</p></li>
          <li><div className="landing-step-art"><span className="landing-step-number">02</span><img src={letter} alt="じいじ・ばあばへ、ことばを添えた便箋の見本" width="600" height="400" loading="lazy" /></div><h3>ことばを添える</h3><p>お子さまの今を、<br />いつものあなたのことばで<br />つづりましょう。<br />最後に、署名を添えて。</p></li>
          <li><div className="landing-step-art"><span className="landing-step-number">03</span><img className="landing-phone" src={line} alt="LINEのトークで手紙のリンクを送る見本" width="600" height="400" loading="lazy" /></div><h3>LINEで届ける</h3><p>できあがった手紙のURLを<br />LINEで、じいじ・ばあばに<br />送るだけ。相手はアプリのインストールや会員登録をせずに見ることができます。</p></li>
        </ol>
      </section>

      <section className="landing-reactions" aria-labelledby="landing-reactions-title">
        <div className="landing-container landing-reactions-inner">
          <div className="landing-reactions-copy"><h2 id="landing-reactions-title">離れていても、すぐそばに。</h2><p>手紙を見た、じいじ・ばあばの「読んだよ」「かわいい！」<br className="landing-desktop-break" />の反応は、その手紙のページに残ります。<br />遠くにいても、ちゃんと気持ちがつながります。</p><div className="landing-actions"><CreateLink />{sampleButton()}</div></div>
          <img className="landing-reaction-art" src={reactions} alt="よんだよ・かわいい！の反応が残る、お返事カードの見本" width="1000" height="560" loading="lazy" />
        </div>
      </section>
      <footer className="landing-footer landing-container"><img className="landing-logo" src={brandLogo} alt="Magocoro" width="840" height="301" loading="lazy" /><nav className="landing-nav" aria-label="フッターナビゲーション">{navigation()}</nav><p>手紙は作成から90日間。URLを知っている人が開けます。</p></footer>

    </main>
      {dialogKind && <dialog className={`landing-dialog${dialogKind === "sample" ? " landing-live-sample" : ""}`} ref={dialogRef} aria-labelledby="landing-dialog-title" onCancel={event => { event.preventDefault(); closeDialog(); }}>
        <div className="landing-dialog-header"><h2 id="landing-dialog-title">{dialogKind === "sample" ? "お手紙の見本" : "よくある質問"}</h2><button autoFocus onClick={closeDialog}>閉じる</button></div>
        {dialogKind === "sample" ? <SampleLetter /> : <dl className="landing-faq">{questions.map(([question, answer]) => <div key={question}><dt>{question}</dt><dd>{answer}</dd></div>)}</dl>}
      </dialog>}
    </>
  );
}
