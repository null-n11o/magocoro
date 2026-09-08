import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

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

  it("rejects missing body and oversized photo", async () => {
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
    big.append("photos", photo("image/jpeg", 2 * 1024 * 1024 + 1, "a.jpg"));
    const bigRes = await exports.default.fetch(
      new Request("http://example.com/api/letters", { method: "POST", body: big }),
    );
    expect(bigRes.status).toBe(400);
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
});
