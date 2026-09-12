import { useState } from "react";
import { Link } from "react-router-dom";
import type { LetterApi, LetterPublic } from "../api/types";
import { LetterPage } from "../letter/LetterPage";
import samplePhotos from "../assets/lp-step-photos.png";

// Only the explicit LP sample uses this data; it never enters the creation API.
function createSampleApi(): LetterApi {
  const created = new Date();
  const letter: LetterPublic = {
    id: "sample",
    createdAt: created.toISOString(),
    expiresAt: new Date(created.getTime() + 90 * 86400000).toISOString(),
    addressTo: "じいじ、ばあばへ",
    body: "きょうは、こうえんでしゃぼんだまをしたよ。\nおおきなしゃぼんだま、つかまえられるかな？\n\nこんどはいっしょにあそぼうね。",
    signature: "はるとより",
    media: { kind: "photos", photoUrls: [samplePhotos] },
    audioUrl: null,
    stamps: { read: 0, cute: 0 },
  };
  return {
    async getLetter() { return { status: "ok", letter: { ...letter, stamps: { ...letter.stamps } } }; },
    async addStamp(_id, kind) {
      letter.stamps[kind] += 1;
      return { status: "ok", stamps: { ...letter.stamps } };
    },
    async createLetter() { throw new Error("sample_is_read_only"); },
  };
}

export function SampleLetter() {
  const [api] = useState(createSampleApi);
  return <>
    <p className="landing-dialog-note">実際と同じ便箋で、開封・スタンプ・画像保存を試せます。見本のスタンプは誰にも送信されません。</p>
    <LetterPage api={api} sample />
    <div className="sample-create"><Link className="primary-button" to="/compose">自分の手紙をつくる</Link></div>
  </>;
}
