import type {
  CreateLetterInput,
  LetterApi,
  LetterGetResult,
  StampKind,
  StampResult,
  Stamps,
} from "./types";

export function createLetterApi(fetchImpl: typeof fetch = fetch): LetterApi {
  return {
    async createLetter(input: CreateLetterInput): Promise<{ id: string }> {
      const form = new FormData();
      form.set("addressTo", input.addressTo);
      form.set("body", input.body);
      form.set("signature", input.signature);
      if (input.media.kind !== "clip") {
        for (const photo of input.media.photos) form.append("photos", photo);
      }
      if (input.media.kind !== "photos") {
        form.set("clip", input.media.clip);
      }
      if (input.audio) form.set("audio", input.audio);
      const res = await fetchImpl("/api/letters", { method: "POST", body: form });
      if (!res.ok) throw new Error("create_failed");
      return (await res.json()) as { id: string };
    },
    async getLetter(id: string): Promise<LetterGetResult> {
      const res = await fetchImpl(`/api/letters/${id}`);
      if (res.status === 404) return { status: "not_found" };
      if (res.status === 410) return { status: "expired" };
      if (!res.ok) throw new Error("get_failed");
      return { status: "ok", letter: await res.json() };
    },
    async addStamp(id: string, kind: StampKind): Promise<StampResult> {
      const res = await fetchImpl(`/api/letters/${id}/stamps`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      if (res.status === 404) return { status: "not_found" };
      if (res.status === 410) return { status: "expired" };
      if (!res.ok) throw new Error("stamp_failed");
      const json = (await res.json()) as { stamps: Stamps };
      return { status: "ok", stamps: json.stamps };
    },
  };
}
