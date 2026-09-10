export type KeepShareKind = "image" | "video";

export type PaperBundlePlan = {
  paper: CanvasImageSource;
  width: number;
  height: number;
  durationMs: number;
  audio?: Blob;
  clip?: {
    source: CanvasImageSource;
    x: number;
    y: number;
    width: number;
    height: number;
    mute: boolean;
    useClipAudio: boolean;
  };
};

export function keepShareKind(letter: {
  media: { kind: "photos" | "clip" | "mixed" };
  audioUrl: string | null;
}): KeepShareKind {
  if (letter.media.kind !== "photos" || letter.audioUrl) return "video";
  return "image";
}

export function letterBundleDurationMs(input: {
  audioDurationSec: number | null;
  clipDurationSec: number | null;
}): number {
  const audioMs =
    input.audioDurationSec && input.audioDurationSec > 0
      ? Math.round(input.audioDurationSec * 1000)
      : 0;
  const clipMs =
    input.clipDurationSec && input.clipDurationSec > 0
      ? Math.round(input.clipDurationSec * 1000)
      : 0;
  return Math.max(audioMs, clipMs);
}

export function clipInPaperPlan(hasParentAudio: boolean): {
  muteClip: boolean;
  useParentAudio: boolean;
} {
  return {
    muteClip: hasParentAudio,
    useParentAudio: hasParentAudio,
  };
}

export function mediaRectInPaper(
  paper: HTMLElement,
  media: HTMLElement,
): { x: number; y: number; width: number; height: number } {
  const paperRect = paper.getBoundingClientRect();
  const mediaRect = media.getBoundingClientRect();
  return {
    x: mediaRect.left - paperRect.left,
    y: mediaRect.top - paperRect.top,
    width: mediaRect.width,
    height: mediaRect.height,
  };
}

export function keepRecorderMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4;codecs=avc1",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export function keepVideoFile(blob: Blob): File {
  const raw = blob.type || "video/webm";
  if (raw.includes("mp4")) {
    return new File([blob], "magocoro.mp4", { type: "video/mp4" });
  }
  const type = raw.startsWith("video/webm") ? raw.split(";")[0] : "video/webm";
  return new File([blob], "magocoro.webm", { type });
}

export async function renderPaperBundle(input: {
  plan: PaperBundlePlan;
  record: (plan: PaperBundlePlan) => Promise<Blob>;
}): Promise<Blob> {
  return input.record(input.plan);
}

export async function snapshotToJpeg(
  canvas: HTMLCanvasElement,
  encode: (source: HTMLCanvasElement) => Promise<Blob> = canvasToJpeg,
): Promise<Blob> {
  return encode(canvas);
}

export function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("no_jpeg"));
        else resolve(blob);
      },
      "image/jpeg",
      0.92,
    );
  });
}

export async function addParentAudioTrack(
  stream: MediaStream,
  audioBlob: Blob,
): Promise<void> {
  const audio = document.createElement("audio");
  audio.src = URL.createObjectURL(audioBlob);
  if (audio.readyState < HTMLMediaElement.HAVE_METADATA) {
    await new Promise<void>((resolve, reject) => {
      audio.addEventListener("loadedmetadata", () => resolve(), { once: true });
      audio.addEventListener(
        "error",
        () => reject(new Error("no_parent_audio")),
        { once: true },
      );
    });
  }
  await audio.play();
  const captured = (
    audio as HTMLMediaElement & { captureStream?: () => MediaStream }
  ).captureStream?.();
  const track = captured?.getAudioTracks()[0];
  if (!track) throw new Error("no_parent_audio");
  stream.addTrack(track);
}

function keepRecorder(stream: MediaStream): MediaRecorder {
  const mime = keepRecorderMime();
  if (mime) {
    try {
      return new MediaRecorder(stream, { mimeType: mime });
    } catch {
      // Browser listed the type but rejected it; use the default container.
    }
  }
  return new MediaRecorder(stream);
}

export async function recordPaperCanvas(plan: PaperBundlePlan): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = plan.width;
  canvas.height = plan.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no_canvas");
  const stream = canvas.captureStream(24);
  if (plan.audio) {
    await addParentAudioTrack(stream, plan.audio);
  } else if (plan.clip?.useClipAudio) {
    const clipAudio = (
      plan.clip.source as HTMLVideoElement & { captureStream?: () => MediaStream }
    ).captureStream?.();
    const track = clipAudio?.getAudioTracks()[0];
    if (track) stream.addTrack(track);
  }
  const recorder = keepRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });
  const clipEl = plan.clip?.source as HTMLVideoElement | undefined;
  if (clipEl && typeof clipEl.play === "function") {
    clipEl.muted = Boolean(plan.clip?.mute);
    clipEl.currentTime = 0;
    await clipEl.play();
  }
  recorder.start();
  const started = performance.now();
  await new Promise<void>((resolve) => {
    const draw = () => {
      ctx.drawImage(plan.paper, 0, 0, plan.width, plan.height);
      if (plan.clip) {
        ctx.drawImage(
          plan.clip.source,
          plan.clip.x,
          plan.clip.y,
          plan.clip.width,
          plan.clip.height,
        );
      }
      if (performance.now() - started >= plan.durationMs) {
        recorder.stop();
        resolve();
        return;
      }
      requestAnimationFrame(draw);
    };
    draw();
  });
  await stopped;
  clipEl?.pause?.();
  return new Blob(chunks, { type: recorder.mimeType || "video/webm" });
}
