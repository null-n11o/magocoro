import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { LetterApi } from "../api/types";
import botanicalSprig from "../assets/botanical-sprig.png";

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
    <main className="page-shell compose-shell">
      <img src={botanicalSprig} alt="" aria-hidden="true" className="botanical botanical-top" />
      <img
        src={botanicalSprig}
        alt=""
        aria-hidden="true"
        className="botanical botanical-bottom"
      />
      <div className="page-column">
        <header className="compose-header">
          <h1 className="wordmark">Magocoro</h1>
          <h2 className="compose-title">きょうねこんなことがあったよ</h2>
          <p className="compose-lede">写真とことばで、今日の成長を届けます。</p>
        </header>

        <form onSubmit={onSubmit} className="letter-form">
          <section className="album-section">
            <div className="section-heading-row">
              <div>
                <h2 id="photos-heading" className="section-title">
                  写真
                </h2>
                <p className="section-helper">写真は1〜3枚まで。1枚2MBまで</p>
              </div>
              <span className="section-count">{photos.length}/3</span>
            </div>
            {photos.length > 0 ? (
              <div className={`photo-grid photo-count-${photos.length}`} aria-label="選んだ写真">
                {photos.map((file, i) => (
                  <img
                    key={`${file.name}-${i}`}
                    src={photoUrls[i] ?? ""}
                    alt=""
                    className="photo-preview"
                  />
                ))}
              </div>
            ) : null}
            <label htmlFor="photos" className="photo-picker">
              <span className="photo-picker-title">写真をえらぶ</span>
              <span className="photo-picker-detail">JPEG / PNG / WebP</span>
            </label>
            <input
              id="photos"
              aria-label="写真"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(e) => onPhotos(e.target.files)}
              className="file-input"
            />
            {photoError ? <p className="form-error">{photoError}</p> : null}
          </section>

          <hr className="album-divider" />

          <div className="field-group">
            <label htmlFor="addressTo" className="field-label">
              宛名
            </label>
            <input
              id="addressTo"
              value={addressTo}
              onChange={(e) => setAddressTo(e.target.value)}
              className="field-input"
            />
          </div>

          <div className="field-group">
            <div className="field-heading-row">
              <label htmlFor="body" className="field-label">
                本文
              </label>
              <span className="field-limit">{body.length}/1000</span>
            </div>
            <p className="field-helper">孫の口調で書いてください</p>
            <textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="じいじ、ばあば、げんき？ きょうね、…"
              rows={6}
              className="field-input field-textarea"
            />
          </div>

          <div className="field-group">
            <label htmlFor="signature" className="field-label">
              署名
            </label>
            <input
              id="signature"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="はると"
              className="field-input"
            />
          </div>

          {reason ? <p className="form-hint">{reason}</p> : null}
          {saveError ? <p className="form-error">{saveError}</p> : null}
          <button type="submit" disabled={Boolean(reason) || submitting} className="primary-button">
            お手紙をつくる
          </button>
        </form>

        <p className="album-footer">つながる、家族のアルバム</p>
      </div>
    </main>
  );
}
