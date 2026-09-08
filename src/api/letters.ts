import type { CreateLetterInput, LetterApi, LetterPublic, StampKind, Stamps } from "./types";

export function createLetterApi(fetchImpl: typeof fetch = fetch): LetterApi {
  return {
    async createLetter(input: CreateLetterInput): Promise<{ id: string }> {
      const form = new FormData();
      form.set("addressTo", input.addressTo);
      form.set("body", input.body);
      form.set("signature", input.signature);
      for (const photo of input.photos) form.append("photos", photo);
      const res = await fetchImpl("/api/letters", { method: "POST", body: form });
      if (!res.ok) throw new Error("create_failed");
      return (await res.json()) as { id: string };
    },
    async getLetter(id: string): Promise<LetterPublic | null> {
      const res = await fetchImpl(`/api/letters/${id}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("get_failed");
      return (await res.json()) as LetterPublic;
    },
    async addStamp(id: string, kind: StampKind): Promise<Stamps | null> {
      const res = await fetchImpl(`/api/letters/${id}/stamps`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("stamp_failed");
      const json = (await res.json()) as { stamps: Stamps };
      return json.stamps;
    },
  };
}
