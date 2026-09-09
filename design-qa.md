# Design QA

source visual truth path: `docs/design-directions/02-family-album.png`
implementation screenshot path: `docs/design-directions/implementation-family-album.png`
responsive captures: `docs/design-directions/implementation-family-album-desktop-before.png`, `docs/design-directions/implementation-family-album-desktop-after.png`, `docs/design-directions/implementation-family-album-tablet-after.png`, `docs/design-directions/implementation-family-album-mobile-after.png`
copy verification captures: `docs/design-directions/implementation-family-album-desktop-copy-final.png`, `docs/design-directions/implementation-family-album-mobile-copy-final.png`
viewport: source image is 853 x 1844 pixels; captures cover 1440 x 900, 1024 x 768, and 390 x 844 CSS viewports
state: `/` compose screen, initial empty state

## Comparison evidence

Full-view comparison: completed for the initial empty state at desktop, tablet, and mobile widths.

Focused region comparison: completed for the header, photo picker, form fields, CTA, and footer before and after the desktop fix.

## Findings

- [P1] Desktop title wrapping made the first screen look broken.
  Location: `/` compose screen, title block.
  Evidence: the 1440px capture wrapped the title into four lines because `.compose-title` combined a `21rem` max-width with a `48px` computed font size.
  Fix status: verified.
  Commit: `49ecf88`.
  Before: `docs/design-directions/implementation-family-album-desktop-before.png`.
  After: `docs/design-directions/implementation-family-album-desktop-after.png`.

- [P2] The initial empty state is structurally aligned with the selected family-album direction.
  Location: `/` compose screen.
  Evidence: the responsive captures show the warm paper background, vermilion wordmark/CTA, Japanese-only form, photo-first hierarchy, thin separators, and botanical accent without horizontal overflow.
  Impact: the reference's selected-photo collage state is not represented by this capture because no files are selected.
  Follow-up: capture the same screen after selecting 1–3 photos when a file-upload-capable browser runner is available.

- [P2] The shared compose and letter screens now use the same child-voice heading.
  Location: `/` compose screen and `/letter/:id` shared letter screen.
  Evidence: the copy verification captures show `きょうねこんなことがあったよ`; the component tests assert the same heading in both flows.
  Fix status: verified.
  Commit: `6f37b5d`.

## Automated checks

- `npm test`: passed (24 tests)
- `npm run build`: passed
- `npm run lint`: passed

## Comparison history

No P0/P1/P2 visual iteration was run because the first comparison was blocked before capture.

## Implementation checklist

- [x] Apply the family-album visual direction to the compose and letter screens.
- [x] Preserve the existing create, copy, stamp, validation, and error behaviors.
- [x] Capture the rendered implementation and run the visual comparison.
- [x] Verify the desktop layout after correcting the title wrapping.
- [x] Verify the child-voice heading on compose and shared letter screens.

final result: passed with follow-up for selected-photo state
