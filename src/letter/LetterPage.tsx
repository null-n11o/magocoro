import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { LetterApi, LetterPublic, StampKind } from "../api/types";
import botanicalSprig from "../assets/botanical-sprig.png";

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
  const [letter, setLetter] = useState<LetterPublic | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [stampError, setStampError] = useState(false);
  const [pressed, setPressed] = useState({ read: false, cute: false });

  useEffect(() => {
    let cancelled = false;
    api
      .getLetter(id)
      .then((value) => {
        if (!cancelled) setLetter(value);
      })
      .catch(() => {
        if (!cancelled) setLetter(null);
      });
    return () => {
      cancelled = true;
    };
  }, [api, id]);

  async function onStamp(kind: StampKind) {
    if (!letter) return;
    setStampError(false);
    try {
      const stamps = await api.addStamp(letter.id, kind);
      if (!stamps) {
        setLetter(null);
        return;
      }
      setLetter({ ...letter, stamps });
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

  if (letter === undefined) {
    return (
      <main className="page-shell letter-shell">
        <div className="page-column" aria-busy="true" />
      </main>
    );
  }

  if (letter === null) {
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
        <header className="letter-header">
          <div className="letter-meta">
            <p className="wordmark">Magocoro</p>
            <time className="postmark" dateTime={letter.createdAt}>
              {postmark(letter.createdAt)}
            </time>
          </div>
          <p className="letter-kicker">家族のアルバムに届きました</p>
          <h1 className="letter-title">今日のひとこま</h1>
        </header>

        <article className="letter-paper">
          <div className={`letter-photo-grid photo-count-${letter.photoUrls.length}`}>
          {letter.photoUrls.map((src, n) => (
            <img
              key={src}
              src={src}
              alt={`手紙の写真 ${n + 1}`}
              className="stamp-frame letter-photo"
            />
          ))}
          </div>
          <p className="letter-address">{letter.addressTo}</p>
          <p className="letter-body">{letter.body}</p>
          <p className="letter-signature">{letter.signature}</p>
        </article>

        <section className="share-section" aria-label="手紙を共有する">
          <p className="share-note">このリンクをLINEに貼ると、相手のスマホでも開けます</p>
          <button type="button" onClick={onCopy} className="secondary-button">
            リンクをコピー
          </button>
          {copied ? <p className="feedback-copy">コピーしました</p> : null}
          {copyFailed ? (
            <div className="copy-error">
              <p>コピーできませんでした。下のURLを長押ししてコピーしてください</p>
              <p className="copy-url">{window.location.href}</p>
            </div>
          ) : null}
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
