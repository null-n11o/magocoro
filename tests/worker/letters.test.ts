import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { addStamp, createLetter } from "../../worker/store";

function photo(type: string, size: number, name: string): File {
  return new File([new Uint8Array(size)], name, { type });
}

async function createValid(): Promise<string> {
  const form = new FormData();
  form.set("addressTo", "じいじ、ばあばへ");
  form.set("body", "きょうね、たてたよ");
  form.set("signature", "はると");
  form.append("photos", photo("image/jpeg", 32, "a.jpg"));
  const res = await exports.default.fetch(
    new Request("http://example.com/api/letters", { method: "POST", body: form }),
  );
  expect(res.status).toBe(201);
  const json = (await res.json()) as { id: string };
  expect(json.id).toMatch(/^l_[0-9a-f]{32}$/);
  return json.id;
}

describe("letters api", () => {
  it("creates, fetches, and increments stamps", async () => {
    const id = await createValid();
    const got = await exports.default.fetch(
      new Request(`http://example.com/api/letters/${id}`),
    );
    expect(got.status).toBe(200);
    const letter = (await got.json()) as {
      addressTo: string;
      body: string;
      signature: string;
      photoUrls: string[];
      stamps: { read: number; cute: number };
    };
    expect(letter.addressTo).toBe("じいじ、ばあばへ");
    expect(letter.body).toBe("きょうね、たてたよ");
    expect(letter.signature).toBe("はると");
    expect(letter.photoUrls).toEqual([`/api/letters/${id}/photos/0`]);
    expect(letter.stamps).toEqual({ read: 0, cute: 0 });

    const img = await exports.default.fetch(
      new Request(`http://example.com/api/letters/${id}/photos/0`),
    );
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/jpeg");
    expect(img.headers.get("x-content-type-options")).toBe("nosniff");

    const stamped = await exports.default.fetch(
      new Request(`http://example.com/api/letters/${id}/stamps`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "read" }),
      }),
    );
    expect(stamped.status).toBe(200);
    expect(await stamped.json()).toEqual({ stamps: { read: 1, cute: 0 } });
  });

  it("uses default addressTo when empty", async () => {
    const form = new FormData();
    form.set("addressTo", "  ");
    form.set("body", "げんき？");
    form.set("signature", "はると");
    form.append("photos", photo("image/png", 16, "a.png"));
    const res = await exports.default.fetch(
      new Request("http://example.com/api/letters", { method: "POST", body: form }),
    );
    const { id } = (await res.json()) as { id: string };
    const got = await exports.default.fetch(
      new Request(`http://example.com/api/letters/${id}`),
    );
    const letter = (await got.json()) as { addressTo: string };
    expect(letter.addressTo).toBe("じいじ、ばあばへ");
  });

  it("rejects missing body and photos larger than 10MB", async () => {
    const empty = new FormData();
    empty.set("addressTo", "じいじ、ばあばへ");
    empty.set("body", "");
    empty.set("signature", "はると");
    empty.append("photos", photo("image/jpeg", 8, "a.jpg"));
    const emptyRes = await exports.default.fetch(
      new Request("http://example.com/api/letters", { method: "POST", body: empty }),
    );
    expect(emptyRes.status).toBe(400);

    const big = new FormData();
    big.set("addressTo", "じいじ、ばあばへ");
    big.set("body", "きょうね");
    big.set("signature", "はると");
    big.append("photos", photo("image/jpeg", 10 * 1024 * 1024 + 1, "a.jpg"));
    const bigRes = await exports.default.fetch(
      new Request("http://example.com/api/letters", { method: "POST", body: big }),
    );
    expect(bigRes.status).toBe(400);
  });

  it("accepts a photo up to 10MB", async () => {
    const form = new FormData();
    form.set("addressTo", "じいじ、ばあばへ");
    form.set("body", "きょうね");
    form.set("signature", "はると");
    form.append("photos", photo("image/jpeg", 10 * 1024 * 1024, "large.jpg"));

    const res = await exports.default.fetch(
      new Request("http://example.com/api/letters", { method: "POST", body: form }),
    );

    expect(res.status).toBe(201);
  });

  it("returns invalid_input for a non-multipart create request", async () => {
    const res = await exports.default.fetch(
      new Request("http://example.com/api/letters", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_input" });
  });

  it("returns not_found for unknown id and corrupt json", async () => {
    const missing = await exports.default.fetch(
      new Request("http://example.com/api/letters/l_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "not_found" });

    await env.LETTERS.put(
      "letters/l_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.json",
      "not-json",
    );
    const corrupt = await exports.default.fetch(
      new Request("http://example.com/api/letters/l_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
    );
    expect(corrupt.status).toBe(404);

    await env.LETTERS.put(
      "letters/l_dddddddddddddddddddddddddddddddd.json",
      "{}",
    );
    const structurallyCorrupt = await exports.default.fetch(
      new Request("http://example.com/api/letters/l_dddddddddddddddddddddddddddddddd"),
    );
    expect(structurallyCorrupt.status).toBe(404);
    expect(await structurallyCorrupt.json()).toEqual({ error: "not_found" });
  });

  it("cleans up attempted R2 keys after a failed create", async () => {
    const deleted: string[] = [];
    const bucket = {
      async put(key: string) {
        if (key.endsWith(".json")) throw new Error("write failed");
      },
      async delete(key: string | string[]) {
        deleted.push(...(Array.isArray(key) ? key : [key]));
      },
    } as unknown as R2Bucket;
    const form = new FormData();
    form.set("body", "きょうね、たてたよ");
    form.set("signature", "はると");
    form.append("photos", photo("image/jpeg", 32, "a.jpg"));

    await expect(createLetter({ LETTERS: bucket }, form)).resolves.toEqual({
      ok: false,
      status: 503,
    });
    expect(deleted).toHaveLength(2);
    expect(deleted[0]).toMatch(/^letters\/l_[0-9a-f]{32}\/photo-0$/);
    expect(deleted[1]).toMatch(/^letters\/l_[0-9a-f]{32}\.json$/);
  });

  it("rejects unknown stamp kind and missing letter stamps", async () => {
    const id = await createValid();
    const bad = await exports.default.fetch(
      new Request(`http://example.com/api/letters/${id}/stamps`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "love" }),
      }),
    );
    expect(bad.status).toBe(400);
    const missing = await exports.default.fetch(
      new Request(
        "http://example.com/api/letters/l_cccccccccccccccccccccccccccccccc/stamps",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind: "cute" }),
        },
      ),
    );
    expect(missing.status).toBe(404);
  });

  it("reports unavailable when persisting a stamp fails", async () => {
    const id = "l_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    const record = {
      id,
      createdAt: "2026-09-08T12:00:00.000Z",
      addressTo: "じいじ、ばあばへ",
      body: "きょうね、たてたよ",
      signature: "はると",
      photos: [{ contentType: "image/jpeg" }],
      stamps: { read: 0, cute: 0 },
    };
    const bucket = {
      async get() {
        return { text: async () => JSON.stringify(record) };
      },
      async put() {
        throw new Error("write failed");
      },
    } as unknown as R2Bucket;

    await expect(addStamp({ LETTERS: bucket }, id, "read")).resolves.toBe("unavailable");
  });
});
