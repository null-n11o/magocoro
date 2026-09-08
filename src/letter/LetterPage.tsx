import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { LetterApi, LetterPublic, StampKind } from "../api/types";

function postmark(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
}

export function LetterPage({ api }: { api: LetterApi }) {
  const { id = "" } = useParams();
  const [letter, setLetter] = useState<LetterPublic | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
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
    const stamps = await api.addStamp(letter.id, kind);
    if (!stamps) {
      setLetter(null);
      return;
    }
    setLetter({ ...letter, stamps });
    setPressed((prev) => ({ ...prev, [kind]: true }));
  }

  async function onCopy() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
  }

  if (letter === undefined) {
    return <main className="mx-auto max-w-lg px-4 py-8" />;
  }

  if (letter === null) {
    return (
      <main className="mx-auto max-w-lg px-4 py-8">
        <p>お手紙が見つからない</p>
        <Link to="/" className="mt-4 inline-flex min-h-11 items-center text-accent">
          お手紙をつくる
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <article className="rounded-lg border border-line bg-surface p-5">
        <p className="text-right text-sm text-muted">{postmark(letter.createdAt)}</p>
        <p className="mt-2">{letter.addressTo}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {letter.photoUrls.map((src, n) => (
            <img
              key={src}
              src={src}
              alt={`手紙の写真 ${n + 1}`}
              className="stamp-frame h-28 w-28 object-cover"
            />
          ))}
        </div>
        <p className="mt-4 whitespace-pre-wrap">{letter.body}</p>
        <p className="mt-6 text-right">{letter.signature}</p>
      </article>
      <p className="mt-4 text-sm text-muted">
        このリンクをLINEに貼ると、相手のスマホでも開けます
      </p>
      <button
        type="button"
        onClick={onCopy}
        className="mt-3 min-h-11 w-full border border-line bg-surface transition duration-200"
      >
        リンクをコピー
      </button>
      {copied ? <p className="mt-2 text-sm text-muted">コピーしました</p> : null}
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          aria-label="読んだよ"
          aria-pressed={pressed.read}
          onClick={() => onStamp("read")}
          className="flex min-h-11 min-w-11 flex-1 items-center justify-center gap-2 border border-line bg-surface transition duration-200"
        >
          読んだよ <span>{letter.stamps.read}</span>
        </button>
        <button
          type="button"
          aria-label="かわいい！"
          aria-pressed={pressed.cute}
          onClick={() => onStamp("cute")}
          className="flex min-h-11 min-w-11 flex-1 items-center justify-center gap-2 border border-line bg-surface transition duration-200"
        >
          かわいい！ <span>{letter.stamps.cute}</span>
        </button>
      </div>
    </main>
  );
}
