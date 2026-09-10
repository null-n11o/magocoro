export function photoDurationsMs(
  count: number,
  audioDurationSec: number | null,
): number[] {
  if (count < 1) return [];
  const total =
    audioDurationSec && audioDurationSec > 0
      ? Math.round(audioDurationSec * 1000)
      : Math.min(15000, Math.max(6000, count * 3000));
  const each = Math.floor(total / count);
  return Array.from({ length: count }, (_, index) =>
    index === count - 1 ? total - each * (count - 1) : each,
  );
}

export function planClipBundle(hasParentAudio: boolean): {
  muteClip: boolean;
  useParentAudio: boolean;
  overlayBody: boolean;
} {
  return {
    muteClip: hasParentAudio,
    useParentAudio: hasParentAudio,
    overlayBody: true,
  };
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

export async function renderPhotoBundle(input: {
  frames: Array<{ source: CanvasImageSource; durationMs: number }>;
  audio?: Blob;
  width: number;
  height: number;
  record: (session: {
    frames: Array<{ source: CanvasImageSource; durationMs: number }>;
    audio?: Blob;
    width: number;
    height: number;
  }) => Promise<Blob>;
}): Promise<Blob> {
  return input.record({
    frames: input.frames,
    audio: input.audio,
    width: input.width,
    height: input.height,
  });
}

export async function recordTimeline(session: {
  frames: Array<{ source: CanvasImageSource; durationMs: number }>;
  audio?: Blob;
  width: number;
  height: number;
}): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = session.width;
  canvas.height = session.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no_canvas");
  const stream = canvas.captureStream(24);
  if (session.audio) {
    await addParentAudioTrack(stream, session.audio);
  }
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });
  recorder.start();
  for (const frame of session.frames) {
    ctx.fillStyle = "#f7f2e9";
    ctx.fillRect(0, 0, session.width, session.height);
    ctx.drawImage(frame.source, 0, 0, session.width, session.height);
    await new Promise((resolve) => window.setTimeout(resolve, frame.durationMs));
  }
  recorder.stop();
  await stopped;
  return new Blob(chunks, { type: recorder.mimeType || "video/webm" });
}

export async function recordClipBundle(input: {
  clip: Blob;
  body: string;
  parentAudio?: Blob;
}): Promise<Blob> {
  const plan = planClipBundle(Boolean(input.parentAudio));
  const url = URL.createObjectURL(input.clip);
  const video = document.createElement("video");
  video.src = url;
  video.muted = plan.muteClip;
  await video.play();
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 720;
  canvas.height = video.videoHeight || 1280;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no_canvas");
  const stream = canvas.captureStream(24);
  if (plan.useParentAudio && input.parentAudio) {
    await addParentAudioTrack(stream, input.parentAudio);
  } else {
    const clipAudio = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.();
    const track = clipAudio?.getAudioTracks()[0];
    if (track) stream.addTrack(track);
  }
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });
  recorder.start();
  const draw = () => {
    if (video.ended) {
      recorder.stop();
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    if (plan.overlayBody) {
      ctx.fillStyle = "rgba(51, 48, 42, 0.55)";
      ctx.fillRect(0, canvas.height - 64, canvas.width, 64);
      ctx.fillStyle = "#fffdf8";
      ctx.font = "20px 'Noto Sans JP', sans-serif";
      ctx.fillText(input.body.slice(0, 40), 16, canvas.height - 28);
    }
    requestAnimationFrame(draw);
  };
  draw();
  await stopped;
  URL.revokeObjectURL(url);
  return new Blob(chunks, { type: recorder.mimeType || "video/webm" });
}
