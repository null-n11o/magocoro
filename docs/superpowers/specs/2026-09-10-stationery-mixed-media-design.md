# Magocoro stationery UI and mixed media

Status: authorized by the user's selected LP and explicit UI implementation request on 2026-09-10. This amendment supersedes conflicting XOR, mobile-only width, palette/font, and no child-voice guidance in older documents. Existing persistence/security/90-day constraints remain.

## Outcome
Apply the approved warm paper/linen, brick red CTA, generous editorial spacing, and restrained sage of the selected LP to the real compose and recipient UI. The source is docs/superpowers/assets/2026-09-10-approved-stationery.png. Main copy: 「なんでもない今日を、とっておきの一通に。」. No need to create a separate marketing route: retain / as composer and /letter/:id as receiver.

## Media
A letter contains 1–3 total media: photos, or one <=30-second video optionally with up to two photos. Never more than one video. Preserve existing photo-only and clip-only JSON; add mixed variant {kind:"mixed", photos:File[], clip:File} on create and {kind:"mixed",photoUrls:string[],clipUrl:string} on read. Mixed means 1–2 photos plus exactly one clip. Legacy files remain readable. Existing limits: photo <=1MiB, clip <=10MiB, audio <=1MiB, total <=10MiB; video/audio duration <=30 sec validated on client. No server transcoding. Strictly reject malformed/repeated clip form fields rather than silently discard. Maintain photo order; clip is placed in first/larger stamp frame with photos adjacent. No need to support arbitrary video reordering.

## UI
Responsive composer: editorial heading above a spacious desktop two-column form/live-preview layout; mobile single column. Controls use plain readable Japanese, minimum44px taps, clear focus, reduced motion. Paper must render 1 media beautifully, 2 as a pair, 3 as one large frame and two small neighboring frames (mobile may stack side pair under larger frame). Preserve photo order and remove/reorder controls. Photo selection and video addition coexist; additions never silently discard prior media. Report limit errors, disable creation during asynchronous preparations/recording, avoid concurrent stale-state overwrites. Replacing video must be explicit; overlong/unsupported replacements preserve selected valid media.

Paper text: hiragana default/sample addressee, childlike hiragana placeholder, signature (e.g. はるとより), static paper labels. Encourage parent to write in child's voice/hiragana. Never automatically convert or rewrite entered text: user's original body and linebreaks remain. Do not prefill dummy message in actual form. No unrequested ban on kanji/emoji in user-supplied text. Editorial headline remains standard Japanese. Use tasteful handwritten font for paper, serif headline, legible system sans controls. Actual user media remain primary, no stock photos in an empty actual letter. Existing botanical raster may be reused sparingly; no custom illustration/SVG stand-ins. Paper frames are functional containers.

Recipient uses same paper layout as live preview and export; native accessible voice/video controls; reactions remain persistent read/cute with visible hiragana labels. Existing share/copy/error/expired flows retained. Preview paper is explicitly labeled and only actual input is shown (empty hints clearly hints).

## Export
Photo-only/no-voice => one JPEG. Clip or voice (including mixed) => one video of entire same paper. Clip animates within its frame while adjacent photos remain static. Voice suppresses clip audio; preserve existing MP4 preference and fallback. Ensure snapshots wait for all image decoding and don't include editor/reaction/share controls. Avoid rotated/transformed paper/media that would misalign canvas capture. Actual implementation and browser validation; no deployment until explicitly asked. Create feature branch PR after tests.
