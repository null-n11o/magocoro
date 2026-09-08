import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { LetterApi } from "../api/types";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX = 2 * 1024 * 1024;

export function ComposePage({ api }: { api: LetterApi }) {
  const navigate = useNavigate();
  const [photos, setPhotos] = useState<File[]>([]);
  const [addressTo, setAddressTo] = useState("じいじ、ばあばへ");
  const [body, setBody] = useState("");
  const [signature, setSignature] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);

  useEffect(() => {
    const urls = photos.map((file) => URL.createObjectURL(file));
    setPhotoUrls(urls);
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [photos]);

  const reason = useMemo(() => {
    if (photos.length < 1) return "写真を1枚以上えらんでください";
    if (body.trim() === "") return "本文を書いてください";
    if (signature.trim() === "") return "なまえを書いてください";
    if (body.length > 1000) return "本文は1000字以内にしてください";
    if (signature.length > 20) return "なまえは20字以内にしてください";
    return "";
  }, [photos, body, signature]);

  function onPhotos(files: FileList | null) {
    if (!files) return;
    setPhotoError("");
    const next = [...photos];
    for (const file of Array.from(files)) {
      if (!ALLOWED.has(file.type)) {
        setPhotoError("この写真は使えません");
        continue;
      }
      if (file.size > MAX) {
        setPhotoError("写真が大きすぎます");
        continue;
      }
      if (next.length >= 3) break;
      next.push(file);
    }
    setPhotos(next);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (reason || submitting) return;
    setSubmitting(true);
    setSaveError("");
    try {
      const { id } = await api.createLetter({ photos, addressTo, body, signature });
      navigate(`/letter/${id}`);
    } catch {
      setSaveError("いま保存できません");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <h1 className="text-2xl font-medium">Magocoro</h1>
      <form
        onSubmit={onSubmit}
        className="mt-6 space-y-4 rounded-lg border border-line bg-surface p-4"
      >
        <div>
          <label htmlFor="photos" className="block text-sm text-muted">
            写真
          </label>
          <input
            id="photos"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(e) => onPhotos(e.target.files)}
            className="mt-1 min-h-11 w-full"
          />
          {photoError ? <p className="mt-1 text-sm text-accent">{photoError}</p> : null}
          <div className="mt-2 flex gap-2">
            {photos.map((file, i) => (
              <img
                key={`${file.name}-${i}`}
                src={photoUrls[i] ?? ""}
                alt=""
                className="h-20 w-20 object-cover"
              />
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="addressTo" className="block text-sm text-muted">
            宛名
          </label>
          <input
            id="addressTo"
            value={addressTo}
            onChange={(e) => setAddressTo(e.target.value)}
            className="mt-1 min-h-11 w-full border border-line bg-page px-3"
          />
        </div>
        <div>
          <label htmlFor="body" className="block text-sm text-muted">
            本文
          </label>
          <p className="mt-1 text-sm text-muted">孫の口調で書いてください</p>
          <textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="じいじ、ばあば、げんき？ きょうね、…"
            rows={6}
            className="mt-1 min-h-11 w-full border border-line bg-page px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="signature" className="block text-sm text-muted">
            署名
          </label>
          <input
            id="signature"
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder="はると"
            className="mt-1 min-h-11 w-full border border-line bg-page px-3"
          />
        </div>
        {reason ? <p className="text-sm text-muted">{reason}</p> : null}
        {saveError ? <p className="text-sm text-accent">{saveError}</p> : null}
        <button
          type="submit"
          disabled={Boolean(reason) || submitting}
          className="min-h-11 w-full bg-accent px-4 text-surface transition duration-200 disabled:opacity-50"
        >
          お手紙をつくる
        </button>
      </form>
    </main>
  );
}
