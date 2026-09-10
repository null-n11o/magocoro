import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import type { LetterApi } from "../api/types";
import botanicalSprig from "../assets/botanical-sprig.png";
import { compressImage } from "../media/compressImage";
import { measureDuration } from "../media/measureDuration";
import { prepareAudio } from "../media/prepareAudio";
import { prepareClip, transcodeClipTo720p } from "../media/prepareClip";

type MediaKind = "photos" | "clip";

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
  const [mediaKind, setMediaKind] = useState<MediaKind>("photos");
  const mediaKindRef = useRef(mediaKind);
  mediaKindRef.current = mediaKind;
  const [photos, setPhotos] = useState<File[]>([]);
  const [clip, setClip] = useState<File | null>(null);
  const [audio, setAudio] = useState<File | null>(null);
  const [mediaError, setMediaError] = useState("");
  const [addressTo, setAddressTo] = useState("じいじ、ばあばへ");
  const [body, setBody] = useState("");
  const [signature, setSignature] = useState("");
  const [saveError, setSaveError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [clipUrl, setClipUrl] = useState("");
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const photoKeys = useRef(new WeakMap<File, string>());
  const nextPhotoKey = useRef(0);
  const [placingPhotoKeys, setPlacingPhotoKeys] = useState<Set<string>>(() => new Set());
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordTimerRef = useRef<number | null>(null);
  const recordStartRef = useRef(false);

  function getPhotoKey(file: File) {
    const existingKey = photoKeys.current.get(file);
    if (existingKey) return existingKey;
    const key = `photo-${nextPhotoKey.current}`;
    nextPhotoKey.current += 1;
    photoKeys.current.set(file, key);
    return key;
  }

  useEffect(() => {
    const urls = photos.map((file) => URL.createObjectURL(file));
    setPhotoUrls(urls);
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [photos]);

  useEffect(() => {
    if (!clip) {
      setClipUrl("");
      return;
    }
    const url = URL.createObjectURL(clip);
    setClipUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [clip]);

  useEffect(() => {
    return () => {
      if (recordTimerRef.current !== null) window.clearTimeout(recordTimerRef.current);
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    };
  }, []);

  const reason = useMemo(() => {
    if (mediaKind === "photos" && photos.length < 1) return "写真を1枚以上えらんでください";
    if (mediaKind === "clip" && !clip) return "動画をえらんでください";
    if (body.trim() === "") return "本文を書いてください";
    if (signature.trim() === "") return "なまえを書いてください";
    if (body.length > 1000) return "本文は1000字以内にしてください";
    if (signature.length > 20) return "なまえは20字以内にしてください";
    return "";
  }, [mediaKind, photos, clip, body, signature]);

  function switchKind(next: MediaKind) {
    if (next === mediaKind) return;
    setMediaKind(next);
    setMediaError("");
    if (next === "photos") setClip(null);
    else setPhotos([]);
  }

  async function onPhotos(files: FileList | null) {
    if (!files) return;
    setMediaError("");
    const next = [...photos];
    const addedPhotoKeys: string[] = [];
    for (const file of Array.from(files)) {
      if (mediaKindRef.current !== "photos") return;
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        setMediaError("この写真は使えません");
        continue;
      }
      if (next.length >= 3) break;
      try {
        const compressed = await compressImage(file);
        if (mediaKindRef.current !== "photos") return;
        next.push(compressed);
        addedPhotoKeys.push(getPhotoKey(compressed));
      } catch {
        if (mediaKindRef.current !== "photos") return;
        setMediaError("この写真は使えません");
      }
    }
    if (mediaKindRef.current !== "photos") return;
    setPhotos(next);
    if (addedPhotoKeys.length > 0) {
      setPlacingPhotoKeys((current) => new Set([...current, ...addedPhotoKeys]));
    }
  }

  async function onClip(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const result = await prepareClip(file, measureDuration, transcodeClipTo720p);
    if (mediaKindRef.current !== "clip") return;
    if (!result.ok) {
      setClip(null);
      setMediaError(result.reason === "too_long" ? "30秒以内にしてください" : "この動画は使えません");
      return;
    }
    setMediaError("");
    setClip(result.file);
  }

  async function onAudioFile(file: File) {
    const result = await prepareAudio(file, measureDuration);
    if (!result.ok) {
      setAudio(null);
      setMediaError(result.reason === "too_long" ? "30秒以内にしてください" : "この音声は使えません");
      return;
    }
    setMediaError("");
    setAudio(result.file);
  }

  async function onAudio(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    await onAudioFile(file);
  }

  async function toggleRecord() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    if (recordStartRef.current) return;
    recordStartRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (recordTimerRef.current !== null) window.clearTimeout(recordTimerRef.current);
        recordStartRef.current = false;
        setRecording(false);
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        void onAudioFile(
          new File([blob], "voice.webm", { type: blob.type || "audio/webm" }),
        );
      };
      recorderRef.current = recorder;
      setRecording(true);
      recorder.start();
      recordTimerRef.current = window.setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, 30_000);
    } catch {
      recordStartRef.current = false;
      setMediaError("録音できません");
    }
  }

  function reorderPhotos(from: number, to: number) {
    setPhotos((current) => moveItem(current, from, to));
    setPhotoUrls((current) => moveItem(current, from, to));
  }

  function removePhoto(index: number) {
    const removedPhoto = photos[index];
    setPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index));
    setPhotoUrls((current) => current.filter((_, photoIndex) => photoIndex !== index));
    if (removedPhoto) {
      const removedKey = getPhotoKey(removedPhoto);
      setPlacingPhotoKeys((current) => {
        if (!current.has(removedKey)) return current;
        const next = new Set(current);
        next.delete(removedKey);
        return next;
      });
    }
    setMediaError("");
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

  const emptyPhotoSlotCount = Math.max(0, 2 - photos.length);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (reason || submitting) return;
    setSubmitting(true);
    setSaveError("");
    try {
      const { id } = await api.createLetter({
        addressTo,
        body,
        signature,
        media:
          mediaKind === "photos"
            ? { kind: "photos", photos }
            : { kind: "clip", clip: clip as File },
        ...(audio ? { audio } : {}),
      });
      navigate(`/letter/${id}`, { state: { fromCompose: true } });
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
          <h2 className="compose-title">こんなことがあったよ</h2>
          <p className="compose-intro">
            写真または短い動画と、ことばと声を1通にまとめる、Webのお手紙です。
          </p>
        </header>

        <form onSubmit={onSubmit} className="letter-form">
          <section className="album-section compose-step step-one">
            <div className="step-heading-row">
              <span className="step-index" aria-hidden="true">
                1
              </span>
              <div className="step-heading-copy">
                <div className="section-heading-row">
                  <h2 id="photos-heading" className="section-title">
                    {mediaKind === "photos" ? "写真" : "動画"}
                  </h2>
                  {mediaKind === "photos" ? (
                    <span className="section-count">{photos.length}/3</span>
                  ) : null}
                </div>
                {mediaKind === "photos" ? (
                  <p className="section-helper">写真は1〜3枚まで。選んだあと小さくします</p>
                ) : null}
              </div>
            </div>

            <div className="media-toggle" role="group" aria-label="写真または動画">
              <button
                type="button"
                aria-pressed={mediaKind === "photos"}
                onClick={() => switchKind("photos")}
              >
                写真
              </button>
              <button
                type="button"
                aria-pressed={mediaKind === "clip"}
                onClick={() => switchKind("clip")}
              >
                動画
              </button>
            </div>

            {mediaKind === "photos" ? (
              <>
                <div className="photo-slot-grid" role="group" aria-label="写真を飾る">
                  {photos.map((file, i) => (
                    <div
                      key={getPhotoKey(file)}
                      className={[
                        "photo-card",
                        "photo-slot",
                        placingPhotoKeys.has(getPhotoKey(file)) ? "is-placing" : "",
                        draggingIndex === i ? "is-dragging" : "",
                        dragOverIndex === i && draggingIndex !== i ? "is-drag-over" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      data-photo-index={i}
                      onAnimationEnd={() => {
                        const placedKey = getPhotoKey(file);
                        setPlacingPhotoKeys((current) => {
                          if (!current.has(placedKey)) return current;
                          const next = new Set(current);
                          next.delete(placedKey);
                          return next;
                        });
                      }}
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

                  {photos.length < 3 ? (
                    <label htmlFor="photos" className="photo-picker photo-slot">
                      <span className="photo-picker-mark" aria-hidden="true">
                        ＋
                      </span>
                      <span className="photo-picker-title">写真をえらぶ</span>
                    </label>
                  ) : null}

                  {Array.from({ length: emptyPhotoSlotCount }, (_, index) => (
                    <span key={index} className="photo-slot photo-slot-empty" aria-hidden="true" />
                  ))}
                </div>
                <input
                  id="photos"
                  aria-label="写真"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={(e) => void onPhotos(e.target.files)}
                  className="file-input"
                />
              </>
            ) : (
              <div className="clip-slot">
                <label htmlFor="clip" className="secondary-button">
                  動画をえらぶ
                </label>
                <input
                  id="clip"
                  aria-label="動画"
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  onChange={(e) => void onClip(e.target.files)}
                  className="file-input"
                />
                {clip && clipUrl ? (
                  <video className="clip-preview" src={clipUrl} controls playsInline />
                ) : null}
              </div>
            )}
            {mediaError ? <p className="form-error">{mediaError}</p> : null}
          </section>

          <section className="field-group compose-step step-two">
            <div className="step-heading-row">
              <span className="step-index" aria-hidden="true">
                2
              </span>
              <div>
                <h2 className="section-title">声（任意）</h2>
                <p className="section-helper">30秒以内。なくても作れます</p>
              </div>
            </div>
            <div className="audio-row">
              <button
                type="button"
                aria-pressed={recording}
                aria-label={recording ? "録音を止める" : "録音する"}
                onClick={() => void toggleRecord()}
              >
                {recording ? "録音を止める" : "録音する"}
              </button>
              <label htmlFor="audio" className="secondary-button">
                ファイルをえらぶ
              </label>
              <input
                id="audio"
                aria-label="声"
                type="file"
                accept="audio/mp4,audio/aac,audio/webm,audio/ogg"
                className="file-input"
                onChange={(e) => void onAudio(e.target.files)}
              />
            </div>
            {audio ? <p className="section-helper">声をのせました</p> : null}
          </section>

          <section className="field-group compose-step step-three">
            <div className="step-heading-row">
              <span className="step-index" aria-hidden="true">
                3
              </span>
              <label htmlFor="addressTo" className="field-label required-label">
                宛名
              </label>
            </div>
            <input
              id="addressTo"
              value={addressTo}
              onChange={(e) => setAddressTo(e.target.value)}
              className="field-input"
            />
          </section>

          <section className="field-group compose-step step-four">
            <div className="step-heading-row">
              <span className="step-index" aria-hidden="true">
                4
              </span>
              <div className="step-heading-copy">
                <div className="field-heading-row">
                  <label htmlFor="body" className="field-label required-label">
                    本文
                  </label>
                  <span className="field-limit">{body.length}/1000</span>
                </div>
              </div>
            </div>
            <textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="今週のできごとを、短くでよいので書いてください"
              rows={6}
              className="field-input field-textarea"
            />
          </section>

          <section className="field-group compose-step step-five">
            <div className="step-heading-row">
              <span className="step-index" aria-hidden="true">
                5
              </span>
              <label htmlFor="signature" className="field-label required-label">
                なまえ
              </label>
            </div>
            <input
              id="signature"
              aria-label="署名"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="はると"
              className="field-input"
            />
          </section>

          {reason ? <p className="form-hint">{reason}</p> : null}
          {saveError ? <p className="form-error">{saveError}</p> : null}
          <button
            type="submit"
            disabled={Boolean(reason) || submitting}
            aria-busy={submitting}
            className="primary-button"
          >
            {submitting ? "お手紙をつくっています…" : "お手紙をつくる"}
          </button>
        </form>
      </div>
    </main>
  );
}
