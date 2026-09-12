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
import brandLogo from "../assets/magocoro-logo.png";
import { LetterPaper } from "../letter/LetterPaper";
import { compressImage } from "../media/compressImage";
import { measureDuration } from "../media/measureDuration";
import { prepareAudio } from "../media/prepareAudio";
import { prepareClip, transcodeClipTo720p } from "../media/prepareClip";

function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  ) {
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
  const processingRef = useRef(false);
  const [processing, setProcessing] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  function lock() {
    if (processingRef.current || submitting) return false;
    processingRef.current = true;
    setProcessing(true);
    return true;
  }
  function unlock() {
    processingRef.current = false;
    setProcessing(false);
  }
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
  const [placingPhotoKeys, setPlacingPhotoKeys] = useState<Set<string>>(
    () => new Set(),
  );
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
      if (recordTimerRef.current !== null)
        window.clearTimeout(recordTimerRef.current);
      if (recorderRef.current?.state === "recording")
        recorderRef.current.stop();
    };
  }, []);

  const reason = useMemo(() => {
    if (!photos.length && !clip) return "写真か動画をえらんでください";
    if (body.trim() === "") return "本文を書いてください";
    if (signature.trim() === "") return "なまえを書いてください";
    if (body.length > 1000) return "本文は1000字以内にしてください";
    if (signature.length > 20) return "なまえは20字以内にしてください";
    return "";
  }, [photos, clip, body, signature]);

  async function onPhotos(files: FileList | null) {
    if (!files || !lock()) return;
    setMediaError("");
    const next = [...photos];
    const added: string[] = [];
    try {
      for (const file of Array.from(files)) {
        if (next.length + Number(Boolean(clip)) >= 3) {
          setMediaError("写真と動画はあわせて3つまでです");
          break;
        }
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
          setMediaError("この写真は使えません");
          continue;
        }
        try {
          const prepared = await compressImage(file);
          next.push(prepared);
          added.push(getPhotoKey(prepared));
        } catch {
          setMediaError("この写真は使えません");
        }
      }
      setPhotos(next);
      setPlacingPhotoKeys((current) => new Set([...current, ...added]));
    } finally {
      unlock();
    }
  }
  async function onClip(files: FileList | null) {
    const file = files?.[0];
    if (!file || !lock()) return;
    try {
      if (!clip && photos.length >= 3) {
        setMediaError("写真と動画はあわせて3つまでです");
        return;
      }
      const result = await prepareClip(
        file,
        measureDuration,
        transcodeClipTo720p,
      );
      if (!result.ok) {
        setMediaError(
          result.reason === "too_long"
            ? "30秒以内にしてください"
            : "この動画は使えません",
        );
        return;
      }
      setClip(result.file);
      setMediaError("");
    } catch {
      setMediaError("この動画は使えません");
    } finally {
      unlock();
    }
  }
  async function onAudioFile(file: File) {
    try {
      const result = await prepareAudio(file, measureDuration);
      if (!result.ok) {
        setMediaError(
          result.reason === "too_long"
            ? "30秒以内にしてください"
            : "この音声は使えません",
        );
        return;
      }
      setAudio(result.file);
      setMediaError("");
    } catch {
      setMediaError("この音声は使えません");
    } finally {
      unlock();
    }
  }
  async function onAudio(files: FileList | null) {
    const file = files?.[0];
    if (file && lock()) await onAudioFile(file);
  }
  useEffect(() => {
    if (!audio) {
      setAudioUrl("");
      return;
    }
    const url = URL.createObjectURL(audio);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audio]);

  async function toggleRecord() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    if (recordStartRef.current || !lock()) return;
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
        if (recordTimerRef.current !== null)
          window.clearTimeout(recordTimerRef.current);
        recordStartRef.current = false;
        setRecording(false);
        const blob = new Blob(chunks, {
          type: recorder.mimeType || "audio/webm",
        });
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
      unlock();
      setMediaError("録音できません");
    }
  }

  function reorderPhotos(from: number, to: number) {
    setPhotos((current) => moveItem(current, from, to));
    setPhotoUrls((current) => moveItem(current, from, to));
  }

  function removePhoto(index: number) {
    const removedPhoto = photos[index];
    setPhotos((current) =>
      current.filter((_, photoIndex) => photoIndex !== index),
    );
    setPhotoUrls((current) =>
      current.filter((_, photoIndex) => photoIndex !== index),
    );
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

  function onPhotoPointerDown(
    index: number,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDraggingIndex(index);
    setDragOverIndex(index);
  }

  function onPhotoPointerMove(
    index: number,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (draggingIndex !== index) return;
    event.preventDefault();
    const elementFromPoint = (
      document as Document & {
        elementFromPoint?: (x: number, y: number) => Element | null;
      }
    ).elementFromPoint;
    const element = elementFromPoint?.call(
      document,
      event.clientX,
      event.clientY,
    );
    const card = element?.closest<HTMLElement>("[data-photo-index]");
    const targetIndex = Number(card?.dataset.photoIndex);
    if (card && Number.isInteger(targetIndex)) setDragOverIndex(targetIndex);
  }

  function endPhotoPointerDrag(
    index: number,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (draggingIndex !== index) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (dragOverIndex !== null) reorderPhotos(index, dragOverIndex);
    setDraggingIndex(null);
    setDragOverIndex(null);
  }

  function cancelPhotoPointerDrag(
    index: number,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (draggingIndex !== index) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDraggingIndex(null);
    setDragOverIndex(null);
  }

  function onPhotoHandleKeyDown(
    index: number,
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) {
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
    if (reason || submitting || processingRef.current || recording) return;
    setSubmitting(true);
    setSaveError("");
    try {
      const { id } = await api.createLetter({
        addressTo,
        body,
        signature,
        media: clip
          ? photos.length
            ? { kind: "mixed", photos, clip }
            : { kind: "clip", clip }
          : { kind: "photos", photos },
        ...(audio ? { audio } : {}),
      });
      navigate(`/letter/${id}?sender=1`);
    } catch {
      setSaveError("いま保存できません");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page-shell compose-shell">
      <div className="page-column">
        <header className="site-header">
          <a href="/" className="brand-link">
            <img className="brand-logo" src={brandLogo} alt="Magocoro" />
          </a>
          <span>写真に、ことばに、ときどき声。</span>
        </header>
        <div className="compose-intro">
          <p className="eyebrow">いつもの日から、ひとつのお手紙。</p>
          <h1>
            なんでもない今日を、
            <br />
            とっておきの一通に。
          </h1>
          <p>
            じいじ・ばあばへ、いつものLINEで。
            <br />
            写真とことばを、ゆっくり選んでみませんか。
          </p>
        </div>
        <div className="compose-layout">
          <form onSubmit={onSubmit} className="compose-form">
            <section className="compose-step">
              <div className="step-heading-row">
                <span className="step-index">01</span>
                <div>
                  <h2>思い出をえらぶ</h2>
                  <p className="section-helper">
                    写真と動画をあわせて3つ。動画は1本・30秒まで。
                  </p>
                </div>
              </div>
              <fieldset
                disabled={processing || submitting}
                className="media-fieldset"
              >
                <div className="media-pickers">
                  <label className="file-picker">
                    ＋ 写真をえらぶ
                    <input
                      aria-label="写真"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      onChange={async (e) => {
                        const input = e.currentTarget;
                        await onPhotos(input.files);
                        input.value = "";
                      }}
                    />
                  </label>
                  <label className="file-picker">
                    {clip ? "動画を入れ替える" : "＋ 動画をえらぶ"}
                    <input
                      aria-label="動画"
                      type="file"
                      accept="video/mp4,video/webm,video/quicktime"
                      onChange={async (e) => {
                        const input = e.currentTarget;
                        await onClip(input.files);
                        input.value = "";
                      }}
                    />
                  </label>
                </div>
                <div className="photo-slot-grid">
                  {photos.map((file, i) => (
                    <div
                      key={getPhotoKey(file)}
                      data-photo-index={i}
                      className={`photo-card ${placingPhotoKeys.has(getPhotoKey(file)) ? "is-placing" : ""} ${dragOverIndex === i && draggingIndex !== i ? "is-drag-over" : ""}`}
                      onAnimationEnd={() =>
                        setPlacingPhotoKeys((current) => {
                          const next = new Set(current);
                          next.delete(getPhotoKey(file));
                          return next;
                        })
                      }
                    >
                      <img src={photoUrls[i]} alt={`選んだ写真 ${i + 1}`} />
                      <div className="photo-actions">
                        <button
                          type="button"
                          className="photo-drag-handle"
                          aria-label={`写真${i + 1}を並べ替え`}
                          onPointerDown={(e) => onPhotoPointerDown(i, e)}
                          onPointerMove={(e) => onPhotoPointerMove(i, e)}
                          onPointerUp={(e) => endPhotoPointerDrag(i, e)}
                          onPointerCancel={(e) => cancelPhotoPointerDrag(i, e)}
                          onKeyDown={(e) => onPhotoHandleKeyDown(i, e)}
                        >
                          移動
                        </button>
                        <button
                          type="button"
                          aria-label={`写真${i + 1}を削除`}
                          onClick={() => removePhoto(i)}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {clip && (
                  <div className="selected-file">
                    <span>動画をのせました</span>
                    <button
                      type="button"
                      onClick={() => {
                        setClip(null);
                        setMediaError("");
                      }}
                    >
                      動画を削除
                    </button>
                  </div>
                )}
              </fieldset>
              <p className="section-helper">
                {photos.length + Number(Boolean(clip))} / 3 選択中
                {photos.length > 1
                  ? " ・ 写真は移動ボタンをドラッグ、または左右キーで並べ替え"
                  : ""}
              </p>
            </section>
            <section className="compose-step">
              <div className="step-heading-row">
                <span className="step-index">02</span>
                <div>
                  <h2>ことばを添える</h2>
                  <p className="section-helper">
                    お子さまの声を思い浮かべて、ひらがなで書いてみても。
                  </p>
                </div>
              </div>
              <label className="field-label" htmlFor="addressTo">
                宛名
              </label>
              <input
                id="addressTo"
                className="field-input"
                value={addressTo}
                onChange={(e) => setAddressTo(e.target.value)}
              />
              <div className="field-heading-row">
                <label className="field-label" htmlFor="body">
                  本文
                </label>
                <span className="field-limit">{body.length}/1000</span>
              </div>
              <textarea
                id="body"
                className="field-input field-textarea"
                rows={6}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="きょうのできごとを、ここにかいてね"
              />
              <label className="field-label" htmlFor="signature">
                なまえ
              </label>
              <input
                id="signature"
                aria-label="署名"
                className="field-input"
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                placeholder="はるとより"
              />
            </section>
            <section className="compose-step audio-section">
              <div className="step-heading-row">
                <span className="step-index">03</span>
                <div>
                  <h2>
                    声も、いっしょに <small>任意</small>
                  </h2>
                  <p className="section-helper">
                    30秒までの「だいすき」を添えられます。
                  </p>
                </div>
              </div>
              <div className="audio-row">
                <button
                  type="button"
                  disabled={(processing && !recording) || submitting}
                  aria-pressed={recording}
                  aria-label={recording ? "録音を止める" : "録音する"}
                  onClick={() => void toggleRecord()}
                >
                  {recording ? "録音を止める" : "録音する"}
                </button>
                <label className="file-picker">
                  ファイルをえらぶ
                  <input
                    disabled={processing || submitting}
                    aria-label="声"
                    type="file"
                    accept="audio/mp4,audio/x-m4a,audio/m4a,audio/aac,audio/x-aac,audio/webm,audio/ogg,.m4a,.aac"
                    onChange={async (e) => {
                      const input = e.currentTarget;
                      await onAudio(input.files);
                      input.value = "";
                    }}
                  />
                </label>
              </div>
              {audio && (
                <div className="audio-selected">
                  <audio src={audioUrl} controls aria-label="選んだ声" />
                  <button
                    type="button"
                    disabled={processing || submitting}
                    onClick={() => setAudio(null)}
                  >
                    声を削除
                  </button>
                </div>
              )}
            </section>
            <div aria-live="polite">
              {processing && (
                <p className="form-hint">
                  {recording ? "録音しています…" : "素材を準備しています…"}
                </p>
              )}
              {mediaError && (
                <p className="form-error" role="alert">
                  {mediaError}
                </p>
              )}
              {reason && <p className="form-hint">{reason}</p>}
              {saveError && (
                <p className="form-error" role="alert">
                  {saveError}
                </p>
              )}
            </div>
            <button
              type="submit"
              className="primary-button"
              disabled={
                Boolean(reason) || submitting || processing || recording
              }
              aria-busy={submitting}
            >
              {submitting ? "お手紙をつくっています…" : "お手紙をつくる"}
            </button>
            <p className="privacy-note">
              登録不要。できあがったリンクは90日間ひらけます。
            </p>
          </form>
          <aside className="preview-column" aria-label="お手紙のプレビュー">
            <div className="preview-heading">
              <span>できあがりのプレビュー</span>
              <span>あなたのことばが、そのまま届きます</span>
            </div>
            <LetterPaper
              photoUrls={photoUrls}
              clipUrl={clipUrl}
              audioUrl={audioUrl}
              addressTo={addressTo}
              body={body}
              signature={signature}
              preview
            />
            <p className="preview-note">
              小さな毎日が、うれしい贈りものになります。
            </p>
          </aside>
        </div>
        <footer className="site-footer">
          <img className="brand-logo" src={brandLogo} alt="Magocoro" />
          <span>離れていても、すぐそばに。</span>
        </footer>
      </div>
    </main>
  );
}
