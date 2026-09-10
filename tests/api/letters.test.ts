import { describe, expect, it, vi } from "vitest";
import { createLetterApi } from "../../src/api/letters";

const id = "l_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("createLetterApi", () => {
  it("posts photos xor clip and optional audio", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id }),
    });
    const api = createLetterApi(fetchImpl as unknown as typeof fetch);
    const photo = new File([new Uint8Array(4)], "a.jpg", { type: "image/jpeg" });
    await api.createLetter({
      addressTo: "じいじ、ばあばへ",
      body: "きょうね",
      signature: "はると",
      media: { kind: "photos", photos: [photo] },
    });
    const photoInit = fetchImpl.mock.calls[0][1] as RequestInit;
    const photoForm = photoInit.body as FormData;
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/letters");
    expect(photoForm.getAll("photos")).toHaveLength(1);
    expect(photoForm.get("clip")).toBeNull();

    const clip = new File([new Uint8Array(8)], "a.mp4", { type: "video/mp4" });
    const voice = new File([new Uint8Array(4)], "a.webm", { type: "audio/webm" });
    await api.createLetter({
      addressTo: "じいじ、ばあばへ",
      body: "きょうね",
      signature: "はると",
      media: { kind: "clip", clip },
      audio: voice,
    });
    const clipForm = (fetchImpl.mock.calls[1][1] as RequestInit).body as FormData;
    expect(clipForm.get("clip")).toBe(clip);
    expect(clipForm.get("audio")).toBe(voice);
    expect(clipForm.getAll("photos")).toEqual([]);
  });

  it("maps 404 and 410 on get and stamp", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ status: 404, ok: false })
      .mockResolvedValueOnce({ status: 410, ok: false })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({
          id,
          createdAt: "2026-09-10T00:00:00.000Z",
          expiresAt: "2026-12-09T00:00:00.000Z",
          addressTo: "じいじ、ばあばへ",
          body: "きょうね",
          signature: "はると",
          media: { kind: "photos", photoUrls: [`/api/letters/${id}/photos/0`] },
          audioUrl: null,
          stamps: { read: 0, cute: 0 },
        }),
      })
      .mockResolvedValueOnce({ status: 410, ok: false });
    const api = createLetterApi(fetchImpl as unknown as typeof fetch);
    await expect(api.getLetter(id)).resolves.toEqual({ status: "not_found" });
    await expect(api.getLetter(id)).resolves.toEqual({ status: "expired" });
    await expect(api.getLetter(id)).resolves.toMatchObject({ status: "ok" });
    await expect(api.addStamp(id, "read")).resolves.toEqual({ status: "expired" });
  });
});
