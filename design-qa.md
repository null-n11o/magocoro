# Stationery UI verification — 2026-09-11

Result: PASS for the selected LP art direction applied to the existing composer/recipient flow and the requested combined media rule. No unresolved critical or important review findings. This is a functional UI adaptation, not a pixel clone of the marketing image.

## Reference and visual comparison

Reference: `docs/superpowers/assets/2026-09-10-approved-stationery.png` (user-selected first design with revised headline). Compared the source and actual browser captures together. Retained ivory paper/background, warm brick accents, serif hierarchy, handwritten hiragana letter guidance, generous spacing, subtle rules and real scalloped postage frames. Desktop uses a form beside a live letter; mobile stacks them. The requested three-item composition uses one large frame with two smaller frames. Video occupies the main frame; photo order is preserved. Actual user text is never rewritten.

Final captures are available in the task's outputs directory as `magocoro-ui-desktop.png` (1440×1000) and `magocoro-letter-mobile.png` (390×844). Native viewport screenshots were used because the browser's full-page stitching distorted the layout. Synthetic toddler photos were used only in local QA letters, never as default user content.

Initial review corrected desktop preview alignment, narrow photo controls, raster/export frame differences, bottom rule rendering, image decode timeout, M4A aliases and soundtrack retention. A second review caught early recorder failure handling; the regression now fails promptly, cancels frames and cleans resources. Final source review passed after these fixes.

## Browser and export evidence

Local Vite + Worker/R2 at `http://127.0.0.1:4173/`; no production writes.

- Actual composer created a three-photo letter and two-photo/video letters, including optional voice. Reload retained media and text. Read reaction retained its count after reload. Copy reported success.
- The 30-second video limit and combined three-item capacity are enforced by client tests; malformed/duplicate media, combined capacity, old records, expiry and persistence are covered by Worker tests.
- M4A import accepted the real AAC fixture and displayed the voice player. Native clip playback reached its two-second end. Imported OGG voice was also created and retrieved.
- Photo-only JPEG downloaded successfully. Inspected its three media frames, hiragana body/signature and address rule; no editing or sharing controls were included.
- Mixed MP4 downloaded with H264 video and AAC audio. Inspected a decoded frame: video stayed in its postage slot and both static photos remained. A 440Hz source clip produced a strong 440Hz output signal (1363 versus 0.25 at330Hz).
- Mixed plus voice MP4 had H264/AAC streams, about2seconds duration. A 330Hz voice fixture replaced the440Hz clip soundtrack (330Hz magnitude1404 versus0.91 at440Hz), verifying audible voice priority rather than merely an audio-track declaration.
- JPEG/MP4 checks used an ignored local harness importing the production LetterPaper and buildKeepVideo, bypassing only the OS share sheet. The application's native share sheet was also opened and canceled successfully.
- Receiver widths320,390 and768 matched document scroll width. At320, all six three-photo action buttons measured74.66×44px. Desktop composer checked at1440.
- Unknown letter shows a friendly recovery page with a creation link. Final recipient browser error/warning log was empty.

## Automated verification

Final production source `fa01fda`: frontend98 tests and Worker26 tests pass (124total). Frontend used maxWorkers2 to avoid local resource contention. TypeScript/Vite build passes. A test-only lint warning was subsequently removed and checked separately. Functional, API, export geometry, audio setup/failure and media-readiness cases are covered; no screenshot assertions claim exact browser pixels.

## Limits

Actual iPhone hardware, Safari, microphone permission/device recording, and sharing into LINE were not exercised. These remain platform acceptance checks; this report does not claim them. Existing microphone-start failure cleanup behavior remains outside this UI change. Browser media support determines available output formats, with visible errors instead of silently dropping soundtrack. No deployment or merge performed.
