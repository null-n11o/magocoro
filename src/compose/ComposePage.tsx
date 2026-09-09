import {
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import type { LetterApi } from "../api/types";
import botanicalSprig from "../assets/botanical-sprig.png";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX = 10 * 1024 * 1024;

function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items;
  }
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (!item) return items;
  next.splice(to, 0, item);
  return next;
}

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
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

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

  function reorderPhotos(from: number, to: number) {
    setPhotos((current) => moveItem(current, from, to));
    setPhotoUrls((current) => moveItem(current, from, to));
  }

  function removePhoto(index: number) {
    setPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index));
    setPhotoUrls((current) => current.filter((_, photoIndex) => photoIndex !== index));
    setPhotoError("");
  }

  function onPhotoPointerDown(index: number, event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDraggingIndex(index);
    setDragOverIndex(index);
  }

  function onPhotoPointerMove(index: number, event: ReactPointerEvent<HTMLButtonElement>) {
    if (draggingIndex !== index) return;
    event.preventDefault();
    const elementFromPoint = (
      document as Document & {
        elementFromPoint?: (x: number, y: number) => Element | null;
      }
    ).elementFromPoint;
    const element = elementFromPoint?.call(document, event.clientX, event.clientY);
    const card = element?.closest<HTMLElement>("[data-photo-index]");
    const targetIndex = Number(card?.dataset.photoIndex);
    if (card && Number.isInteger(targetIndex)) setDragOverIndex(targetIndex);
  }

  function endPhotoPointerDrag(index: number, event: ReactPointerEvent<HTMLButtonElement>) {
    if (draggingIndex !== index) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (dragOverIndex !== null) reorderPhotos(index, dragOverIndex);
    setDraggingIndex(null);
    setDragOverIndex(null);
  }

  function cancelPhotoPointerDrag(index: number, event: ReactPointerEvent<HTMLButtonElement>) {
    if (draggingIndex !== index) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDraggingIndex(null);
    setDragOverIndex(null);
  }

  function onPhotoHandleKeyDown(index: number, event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      reorderPhotos(index, index - 1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      reorderPhotos(index, index + 1);
    }
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
        <header className="compose-header" aria-label="便箋のヘッダー">
          <div className="brand-lockup">
            <h1 className="wordmark">Magocoro</h1>
            <span className="brand-wave" aria-hidden="true" />
          </div>
          <span className="compose-seal" aria-hidden="true" />
          <h2 className="compose-title">こんなことがあったよ</h2>
        </header>

        <form onSubmit={onSubmit} className="letter-form">
          <section className="album-section">
            <div className="section-heading-row">
              <div>
                <h2 id="photos-heading" className="section-title">
                  写真
                </h2>
                <p className="section-helper">写真は1〜3枚まで。1枚10MBまで</p>
              </div>
              <span className="section-count">{photos.length}/3</span>
            </div>
            <div
              className={`photo-mat ${photos.length > 0 ? "has-photos" : ""}`}
              role="group"
              aria-label="写真を飾る"
            >
              {photos.length > 0 ? (
                <div className={`photo-grid photo-count-${photos.length}`} aria-label="選んだ写真">
                  {photos.map((file, i) => (
                    <div
                      key={`${file.name}-${i}`}
                      className={[
                        "photo-card",
                        draggingIndex === i ? "is-dragging" : "",
                        dragOverIndex === i && draggingIndex !== i ? "is-drag-over" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      data-photo-index={i}
                    >
                      <img
                        src={photoUrls[i]}
                        alt={`選んだ写真 ${i + 1}`}
                        className="photo-preview"
                      />
                      <div className="photo-actions">
                        <button
                          type="button"
                          className="photo-action photo-drag-handle"
                          aria-label={`写真${i + 1}を並べ替え`}
                          onPointerDown={(event) => onPhotoPointerDown(i, event)}
                          onPointerMove={(event) => onPhotoPointerMove(i, event)}
                          onPointerUp={(event) => endPhotoPointerDrag(i, event)}
                          onPointerCancel={(event) => cancelPhotoPointerDrag(i, event)}
                          onKeyDown={(event) => onPhotoHandleKeyDown(i, event)}
                        >
                          移動
                        </button>
                        <button
                          type="button"
                          className="photo-action photo-remove-button"
                          aria-label={`写真${i + 1}を削除`}
                          onClick={() => removePhoto(i)}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              <label htmlFor="photos" className="photo-picker">
                <span className="photo-picker-title">写真をえらぶ</span>
                <span className="photo-picker-detail">JPEG / PNG / WebP</span>
              </label>
            </div>
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
            <label htmlFor="addressTo" className="field-label required-label">
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
              <label htmlFor="body" className="field-label required-label">
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
            <label htmlFor="signature" className="field-label required-label">
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
