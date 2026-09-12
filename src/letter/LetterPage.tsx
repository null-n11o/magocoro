import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { LetterApi, LetterPublic, StampKind } from "../api/types";
import brandLogo from "../assets/magocoro-logo.png";
import { LetterPaper } from "./LetterPaper";
import { keepShareKind } from "../media/bundleVideo";
import { buildKeepVideo } from "./buildKeepVideo";
import { downloadFile, shareOrSaveVideo } from "../media/shareBundle";
import { lineShareUrl } from "../share/line";

type View =
  | { status: "loading" }
  | { status: "ok"; letter: LetterPublic }
  | { status: "not_found" }
  | { status: "expired" };

function postmark(iso: string): string {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date(iso));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}年${value("month")}月${value("day")}日`;
}

export function LetterPage({ api }: { api: LetterApi }) {
  const { id = "" } = useParams();
  const [searchParams] = useSearchParams();
  const isSender = searchParams.get("sender") === "1";
  const letterUrl = `${window.location.origin}/letter/${id}`;
  const [view, setView] = useState<View>({ status: "loading" });
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [stampError, setStampError] = useState(false);
  const [pressed, setPressed] = useState({ read: false, cute: false });
  const [bundling, setBundling] = useState(false);
  const [bundleFailed, setBundleFailed] = useState(false);
  const [bundleSaved, setBundleSaved] = useState(false);
  const [preparedBundle, setPreparedBundle] = useState<{ letterId: string; file: File } | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareFailed, setShareFailed] = useState(false);
  const paperRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getLetter(id)
      .then((value) => {
        if (!cancelled) setView(value);
      })
      .catch(() => {
        if (!cancelled) setView({ status: "not_found" });
      });
    return () => {
      cancelled = true;
    };
  }, [api, id]);

  async function onStamp(kind: StampKind) {
    if (view.status !== "ok") return;
    setStampError(false);
    try {
      const result = await api.addStamp(view.letter.id, kind);
      if (result.status === "not_found" || result.status === "expired") {
        setView(result);
        return;
      }
      setView({ status: "ok", letter: { ...view.letter, stamps: result.stamps } });
      setPressed((prev) => ({ ...prev, [kind]: true }));
    } catch {
      setStampError(true);
    }
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(letterUrl);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
  }

  if (view.status === "loading") {
    return (
      <main className="page-shell letter-shell">
        <div className="page-column" aria-busy="true" />
      </main>
    );
  }

  if (view.status === "expired") {
    return (
      <main className="page-shell letter-shell">
        <div className="page-column empty-letter">
          <img className="brand-logo" src={brandLogo} alt="Magocoro" />
          <div className="empty-paper">
            <p className="empty-kicker">便りをひらけませんでした</p>
            <h1 className="empty-title">このお手紙は90日で閉じました</h1>
            <p className="empty-copy">期限がすぎたお手紙です。新しいお手紙をつくれます。</p>
            <Link to="/compose" className="text-link">
              お手紙をつくる
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (view.status === "not_found") {
    return (
      <main className="page-shell letter-shell">
        <div className="page-column empty-letter">
          <img className="brand-logo" src={brandLogo} alt="Magocoro" />
          <div className="empty-paper">
            <p className="empty-kicker">便りをひらけませんでした</p>
            <h1 className="empty-title">お手紙が見つからない</h1>
            <p className="empty-copy">リンクが古いか、手紙がまだ届いていないようです。</p>
            <Link to="/compose" className="text-link">
              お手紙をつくる
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const { letter } = view;

  async function onBundle() {
    const paper = paperRef.current;
    if (!letter || !paper || bundling) return;
    setBundling(true);
    setBundleFailed(false);
    setBundleSaved(false);
    paper.classList.add("is-capturing");
    try {
      const file = await buildKeepVideo(letter, paper);
      setPreparedBundle({ letterId: letter.id, file });
    } catch {
      setBundleFailed(true);
    } finally {
      paper.classList.remove("is-capturing");
      setBundling(false);
    }
  }

  const preparedFile = preparedBundle?.letterId === letter.id ? preparedBundle.file : null;

  async function onShareBundle() {
    if (!preparedFile || sharing) return;
    setSharing(true);
    setShareFailed(false);
    setBundleSaved(false);
    try {
      // Call sharing directly from this tap, before any asynchronous preparation.
      const result = await shareOrSaveVideo(preparedFile, {
        canShare: (data) => typeof navigator.canShare === "function" && navigator.canShare(data),
        share: typeof navigator.share === "function" ? (data) => navigator.share(data) : undefined,
        save: downloadFile,
      });
      if (result === "saved") setBundleSaved(true);
    } catch {
      setShareFailed(true);
    } finally {
      setSharing(false);
    }
  }

  const shareKind = keepShareKind(letter);

  return (
    <main className="page-shell letter-shell">
      <div className="page-column">
        <header className="letter-header" aria-label="便箋のヘッダー">
          <div className="letter-meta">
            <div className="brand-lockup">
              <img className="brand-logo" src={brandLogo} alt="Magocoro" />
            </div>
            <time className="postmark" dateTime={letter.createdAt}>
              {postmark(letter.createdAt)}
            </time>
          </div>
          <p className="letter-kicker">お孫さんからのお手紙です</p>
        </header>

        <LetterPaper ref={paperRef} photoUrls={letter.media.kind === "clip" ? [] : letter.media.photoUrls} clipUrl={letter.media.kind === "photos" ? undefined : letter.media.clipUrl} audioUrl={letter.audioUrl} addressTo={letter.addressTo} body={letter.body} signature={letter.signature} capturing={bundling} />

        {isSender ? (
          <section className="share-section" aria-label="手紙を共有する">
          <p className="share-note">
            「LINEで共有」から、送りたい友だちやグループを選べます。リンクは90日で閉じます
          </p>
          <a className="line-share-button" href={lineShareUrl(letterUrl)}>
            LINEで共有
          </a>
          <button type="button" className="secondary-button" onClick={() => void onCopy()}>
            リンクをコピー
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => void (preparedFile ? onShareBundle() : onBundle())}
            disabled={bundling || sharing}
          >
            {sharing
              ? "共有画面を開いています…"
              : preparedFile
                ? shareKind === "image" ? "画像を共有・保存する" : "動画を共有・保存する"
                : bundling
              ? shareKind === "image"
                ? "画像をつくっています…"
                : "動画をつくっています…"
              : shareKind === "image"
                ? "画像にして送る"
                : "動画にして送る"}
          </button>
          {preparedFile ? (
            <p className="feedback-copy" role="status">
              {shareKind === "image"
                ? "画像ができました。上のボタンを押し、iPhoneでは共有画面の「画像を保存」で写真アプリに保存できます。"
                : "動画ができました。上のボタンを押し、iPhoneでは共有画面の「ビデオを保存」で写真アプリに保存できます。"}
            </p>
          ) : null}
          {shareFailed ? (
            <p className="form-error" role="alert">共有できませんでした。もう一度ボタンを押してください。開けない場合はSafariでこの手紙を開くか、リンクを送ってください。</p>
          ) : null}
          {copied ? <p className="feedback-copy">コピーしました</p> : null}
          {copyFailed ? (
            <div className="copy-error">
              <p>コピーできませんでした。下のURLを長押ししてコピーしてください</p>
              <p className="copy-url">{letterUrl}</p>
            </div>
          ) : null}
          {bundleSaved ? (
            <p className="feedback-copy">
              {shareKind === "image"
                ? "LINEのトークに、この画像を送ってください"
                : "LINEのトークに、この動画を送ってください"}
            </p>
          ) : null}
            {bundleFailed ? (
              <p className="form-error">
                {shareKind === "image"
                  ? "画像にできませんでした。リンクを送ってください"
                  : "動画にできませんでした。リンクを送ってください"}
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="reply-section" aria-labelledby="reply-heading">
          <div className="reply-heading-row">
            <div>
              <h2 id="reply-heading" className="reply-title">
                このお手紙に返事をする
              </h2>
              <p className="reply-helper">読んだ気持ちを、ひとこと届けられます。</p>
            </div>
          </div>
          <div className="stamp-grid">
            <button
              type="button"
              aria-label="よんだよ"
              aria-pressed={pressed.read}
              onClick={() => onStamp("read")}
              className="stamp-button"
            >
              <span>よんだよ</span>
              <strong>{letter.stamps.read}</strong>
            </button>
            <button
              type="button"
              aria-label="かわいい！"
              aria-pressed={pressed.cute}
              onClick={() => onStamp("cute")}
              className="stamp-button"
            >
              <span>かわいい！</span>
              <strong>{letter.stamps.cute}</strong>
            </button>
          </div>
          {stampError ? <p className="form-error">いま反応を送れません</p> : null}
        </section>
      </div>
    </main>
  );
}
