import { addStamp, createLetter, getLetter, getPhoto, toPublic } from "./store";

function notFound(): Response {
  return Response.json({ error: "not_found" }, { status: 404 });
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
      const record = await getLetter(env, id);
      if (!record) return notFound();
      return Response.json(toPublic(record));
    }

    if (request.method === "GET" && parts[3] === "photos" && parts.length === 5) {
      const n = Number(parts[4]);
      if (!Number.isInteger(n)) return notFound();
      const photo = await getPhoto(env, id, n);
      if (!photo) return notFound();
      return new Response(photo.bytes, {
        headers: { "content-type": photo.contentType },
      });
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
      return Response.json({ stamps: result.stamps });
    }

    return notFound();
  },
} satisfies ExportedHandler<Env>;
