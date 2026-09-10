import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { LetterApi, LetterPublic, StampKind } from "../api/types";
import botanicalSprig from "../assets/botanical-sprig.png";
import { buildKeepVideo } from "./buildKeepVideo";
import { downloadFile, shareOrSaveVideo } from "../media/shareBundle";

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
  const [view, setView] = useState<View>({ status: "loading" });
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [stampError, setStampError] = useState(false);
  const [pressed, setPressed] = useState({ read: false, cute: false });
  const [bundling, setBundling] = useState(false);
  const [bundleFailed, setBundleFailed] = useState(false);
  const [bundleSaved, setBundleSaved] = useState(false);

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
      await navigator.clipboard.writeText(window.location.href);
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
          <p className="wordmark">Magocoro</p>
          <div className="empty-paper">
            <p className="empty-kicker">便りをひらけませんでした</p>
            <h1 className="empty-title">このお手紙は90日で閉じました</h1>
            <p className="empty-copy">期限がすぎたお手紙です。新しいお手紙をつくれます。</p>
            <Link to="/" className="text-link">
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
          <p className="wordmark">Magocoro</p>
          <div className="empty-paper">
            <p className="empty-kicker">便りをひらけませんでした</p>
            <h1 className="empty-title">お手紙が見つからない</h1>
            <p className="empty-copy">リンクが古いか、手紙がまだ届いていないようです。</p>
            <Link to="/" className="text-link">
              お手紙をつくる
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const { letter } = view;

  async function onBundle() {
    if (!letter || bundling) return;
    setBundling(true);
    setBundleFailed(false);
    setBundleSaved(false);
    try {
      const file = await buildKeepVideo(letter);
      const result = await shareOrSaveVideo(file, {
        canShare: (data) =>
          typeof navigator.canShare === "function" && navigator.canShare(data),
        share: (data) => navigator.share(data),
        save: downloadFile,
      });
      if (result === "saved") setBundleSaved(true);
    } catch {
      setBundleFailed(true);
    } finally {
      setBundling(false);
    }
  }

  return (
    <main className="page-shell letter-shell">
      <img src={botanicalSprig} alt="" aria-hidden="true" className="botanical botanical-top" />
      <img
        src={botanicalSprig}
        alt=""
        aria-hidden="true"
        className="botanical botanical-bottom"
      />
      <div className="page-column">
        <header className="letter-header" aria-label="便箋のヘッダー">
          <div className="letter-meta">
            <div className="brand-lockup">
              <p className="wordmark">Magocoro</p>
              <span className="brand-wave" aria-hidden="true" />
            </div>
            <time className="postmark" dateTime={letter.createdAt}>
              {postmark(letter.createdAt)}
            </time>
          </div>
          <p className="letter-kicker">お孫さんからのお手紙です</p>
        </header>

        <article className="letter-paper" aria-label="お手紙">
          <div
            className="letter-photo-mat"
            role="group"
            aria-label={letter.media.kind === "photos" ? "手紙の写真" : undefined}
          >
            {letter.media.kind === "photos" ? (
              <div className={`letter-photo-grid photo-count-${letter.media.photoUrls.length}`}>
                {letter.media.photoUrls.map((src, n) => (
                  <img
                    key={src}
                    src={src}
                    alt={`手紙の写真 ${n + 1}`}
                    className="stamp-frame letter-photo"
                  />
                ))}
              </div>
            ) : (
              <video
                className="stamp-frame letter-clip"
                src={letter.media.clipUrl}
                controls
                playsInline
                aria-label="手紙の動画"
              />
            )}
          </div>
          {letter.audioUrl ? (
            <audio className="letter-audio" src={letter.audioUrl} controls aria-label="手紙の声" />
          ) : null}
          <p className="letter-address">{letter.addressTo}</p>
          <p className="letter-body">{letter.body}</p>
          <p className="letter-signature">{letter.signature}</p>
        </article>

        <section className="share-section" aria-label="手紙を共有する">
          <p className="share-note">
            このリンクをLINEに貼ると、相手のスマホでも開けます。90日で閉じます
          </p>
          <button type="button" className="secondary-button" onClick={() => void onCopy()}>
            リンクをコピー
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => void onBundle()}
            disabled={bundling}
          >
            {bundling ? "動画をつくっています…" : "動画にして送る"}
          </button>
          {copied ? <p className="feedback-copy">コピーしました</p> : null}
          {copyFailed ? (
            <div className="copy-error">
              <p>コピーできませんでした。下のURLを長押ししてコピーしてください</p>
              <p className="copy-url">{window.location.href}</p>
            </div>
          ) : null}
          {bundleSaved ? <p className="feedback-copy">LINEのトークに、この動画を送ってください</p> : null}
          {bundleFailed ? <p className="form-error">動画にできませんでした。リンクを送ってください</p> : null}
        </section>

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
              aria-label="読んだよ"
              aria-pressed={pressed.read}
              onClick={() => onStamp("read")}
              className="stamp-button"
            >
              <span>読んだよ</span>
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
