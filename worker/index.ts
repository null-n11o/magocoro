import {
  addStamp,
  createLetter,
  getAudio,
  getClip,
  getLetter,
  getPhoto,
  toPublic,
} from "./store";

function notFound(): Response {
  return Response.json({ error: "not_found" }, { status: 404 });
}
function gone(): Response {
  return Response.json({ error: "expired" }, { status: 410 });
}
function mediaResponse(bytes: ArrayBuffer, contentType: string): Response {
  return new Response(bytes, {
    headers: {
      "content-type": contentType,
      "x-content-type-options": "nosniff",
    },
  });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);

    if (parts[0] !== "api" || parts[1] !== "letters") {
      return notFound();
    }

    if (request.method === "POST" && parts.length === 2) {
      let form: FormData;
      try {
        form = await request.formData();
      } catch {
        return Response.json({ error: "invalid_input" }, { status: 400 });
      }
      const result = await createLetter(env, form);
      if (!result.ok) {
        return Response.json(
          { error: result.status === 503 ? "unavailable" : "invalid_input" },
          { status: result.status },
        );
      }
      return Response.json({ id: result.id }, { status: 201 });
    }

    const id = parts[2] ?? "";

    if (request.method === "GET" && parts.length === 3) {
      const result = await getLetter(env, id);
      if (result.status === "not_found") return notFound();
      if (result.status === "expired") return gone();
      return Response.json(toPublic(result.record));
    }

    if (request.method === "GET" && parts[3] === "photos" && parts.length === 5) {
      const n = Number(parts[4]);
      const photo = await getPhoto(env, id, n);
      if (photo.status === "expired") return gone();
      if (photo.status !== "ok") return notFound();
      return mediaResponse(photo.bytes, photo.contentType);
    }

    if (request.method === "GET" && parts[3] === "clip" && parts.length === 4) {
      const clip = await getClip(env, id);
      if (clip.status === "expired") return gone();
      if (clip.status !== "ok") return notFound();
      return mediaResponse(clip.bytes, clip.contentType);
    }

    if (request.method === "GET" && parts[3] === "audio" && parts.length === 4) {
      const audio = await getAudio(env, id);
      if (audio.status === "expired") return gone();
      if (audio.status !== "ok") return notFound();
      return mediaResponse(audio.bytes, audio.contentType);
    }

    if (request.method === "POST" && parts[3] === "stamps" && parts.length === 4) {
      let kind = "";
      try {
        const body = (await request.json()) as { kind?: string };
        kind = String(body.kind ?? "");
      } catch {
        return Response.json({ error: "invalid_input" }, { status: 400 });
      }
      const result = await addStamp(env, id, kind);
      if (result === "bad_kind") {
        return Response.json({ error: "invalid_input" }, { status: 400 });
      }
      if (result === "not_found") return notFound();
      if (result === "expired") return gone();
      if (result === "unavailable") {
        return Response.json({ error: "unavailable" }, { status: 503 });
      }
      return Response.json({ stamps: result.stamps });
    }

    return notFound();
  },
} satisfies ExportedHandler<Env>;
