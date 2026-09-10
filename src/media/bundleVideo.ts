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

export type Soundtrack = {
  start: () => Promise<void>;
  dispose: () => Promise<void>;
};

// A dedicated element avoids permanently attaching a Web Audio source to the visible player.
export async function prepareSoundtrack(
  stream: MediaStream,
  url: string,
): Promise<Soundtrack> {
  const audio = document.createElement("audio");
  audio.src = url;
  audio.preload = "auto";
  let context: AudioContext | undefined;
  let source: MediaElementAudioSourceNode | undefined;
  let destination: MediaStreamAudioDestinationNode | undefined;
  let track: MediaStreamTrack | undefined;
  const dispose = async () => {
    audio.pause();
    source?.disconnect();
    destination?.disconnect();
    track?.stop();
    if (context) await context.close();
    audio.removeAttribute("src");
  };
  try {
    if (typeof AudioContext !== "undefined") {
      context = new AudioContext();
      source = context.createMediaElementSource(audio);
      destination = context.createMediaStreamDestination();
      source.connect(destination);
      await context.resume();
      track = destination.stream.getAudioTracks()[0];
    } else {
      const capture = (
        audio as HTMLAudioElement & { captureStream?: () => MediaStream }
      ).captureStream;
      if (!capture) throw new Error("no_audio_capture");
      // Implementations exposing captureStream may not expose tracks until playback starts.
      await audio.play();
      track = capture.call(audio).getAudioTracks()[0];
      audio.pause();
      audio.currentTime = 0;
    }
    if (!track) throw new Error("no_audio_capture");
    stream.addTrack(track);
    return {
      start: async () => {
        audio.currentTime = 0;
        await audio.play();
      },
      dispose,
    };
  } catch (error) {
    await dispose();
    throw error;
  }
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

export function drawClipCover(
  ctx: CanvasRenderingContext2D,
  clip: NonNullable<PaperBundlePlan["clip"]>,
): void {
  const video = clip.source as HTMLVideoElement;
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight) return;
  const scale = Math.max(clip.width / sourceWidth, clip.height / sourceHeight);
  const width = clip.width / scale;
  const height = clip.height / scale;
  ctx.drawImage(
    clip.source,
    (sourceWidth - width) / 2,
    (sourceHeight - height) / 2,
    width,
    height,
    clip.x,
    clip.y,
    clip.width,
    clip.height,
  );
}

export async function recordPaperCanvas(plan: PaperBundlePlan): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = plan.width;
  canvas.height = plan.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no_canvas");
  const stream = canvas.captureStream(24);
  const clip = plan.clip?.source as HTMLVideoElement | undefined;
  const original = clip
    ? { muted: clip.muted, time: clip.currentTime, paused: clip.paused }
    : null;
  const audioUrl = plan.audio ? URL.createObjectURL(plan.audio) : undefined;
  let sound: Soundtrack | undefined;
  let recorder: MediaRecorder | undefined;
  let animation = 0;
  try {
    const soundUrl =
      audioUrl ??
      (plan.clip?.useClipAudio ? clip?.currentSrc || clip?.src : undefined);
    if (plan.clip?.useClipAudio && !soundUrl)
      throw new Error("no_audio_capture");
    if (soundUrl) sound = await prepareSoundtrack(stream, soundUrl);
    if (clip) {
      clip.pause();
      clip.muted = true; // The dedicated soundtrack supplies the selected sound exactly once.
      clip.currentTime = 0;
    }
    recorder = keepRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    const stopped = new Promise<void>((resolve, reject) => {
      if (!recorder) return;
      recorder.onstop = () => resolve();
      recorder.onerror = () => reject(new Error("recording_failed"));
    });
    const draw = () => {
      ctx.drawImage(plan.paper, 0, 0, plan.width, plan.height);
      if (plan.clip) drawClipCover(ctx, plan.clip);
    };
    draw();
    recorder.start();
    // Start sound only after the recorder is running, so its beginning cannot be lost.
    await Promise.all([sound?.start(), clip?.play()]);
    const started = performance.now();
    await new Promise<void>((resolve, reject) => {
      const frame = () => {
        try {
          draw();
          if (performance.now() - started >= plan.durationMs) {
            resolve();
            return;
          }
          animation = requestAnimationFrame(frame);
        } catch (error) {
          reject(error);
        }
      };
      frame();
    });
    recorder.stop();
    await stopped;
    return new Blob(chunks, { type: recorder.mimeType || "video/webm" });
  } finally {
    cancelAnimationFrame(animation);
    if (recorder?.state === "recording") recorder.stop();
    await sound?.dispose().catch(() => undefined);
    stream.getTracks().forEach((track) => track.stop());
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    if (clip && original) {
      clip.pause();
      clip.muted = original.muted;
      clip.currentTime = original.time;
      if (!original.paused) await clip.play().catch(() => undefined);
    }
  }
}
