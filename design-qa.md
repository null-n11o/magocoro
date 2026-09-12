# Landing page design QA

Date: 2026-09-12

## Evidence and comparison setup

- Source visual truth: `docs/superpowers/assets/2026-09-12-approved-lp.png` (1086 × 1448 pixels).
- Implementation: `http://127.0.0.1:5188/`, Chrome through CUA (in-app browser unavailable).
- State: public initial LP, no dialog; all illustrative images loaded before final captures.
- Desktop CSS viewport: 1086 × 1448; final full-page screenshot: 1086 × 1473 pixels. Screenshots have one output pixel per CSS pixel, so no density rescaling was needed.
- Desktop evidence: `work/lp-desktop-initial.png`, `work/lp-desktop-final.png`.
- Same-input side-by-side comparisons: `work/lp-comparison-initial.png`, `work/lp-comparison-final.png`. Source and implementation were rendered adjacent at their original 1086px width in a local comparison page, then captured together. The final 25px height difference is natural copy wrapping and meets the composition goal.
- Responsive evidence: `work/lp-mobile-initial.png`, `work/lp-mobile-final.png` at 390px; `work/lp-tablet-initial.png`, `work/lp-tablet-final.png` at 768px.
- Dialog evidence: `work/lp-sample-mobile.png`, `work/lp-faq-mobile.png` at 390 × 844.
- Additional live checks at 320px and 961px. No horizontal page overflow at 320, 390, 768, 961, or 1086px.
- Evidence files under `work/` are local verification artifacts, intentionally git-ignored.

## Comparison history

1. Initial desktop comparison: headline, CTA hierarchy, hero photograph, three steps, sage reaction band and footer matched the target composition. Existing approved brand logo replaces the older text-only wordmark intentionally. Generated individual illustration subjects/layouts retain the same stationery art direction; stock-like imagery is used only in explicitly identified examples.
2. [P2] Initial 390px how-to heading broke the word 一通. Fixed with two unbroken phrase spans; final mobile capture reads 「いつもの一枚が、／うれしい一通に。」.
3. [P2] Initial navigation links were 36–39px wide. Added minimum 44px width. Browser measured every visible LP link/button at least 44 × 44px after correction. Explicit minima were also added to all scoped LP buttons following code review.
4. [P3] Initial desktop content extended to 1504px versus reference1448. Reduced step/reaction padding and widened step copy. Final height1473 retains readable copy without compressed text.
5. [P2] At768px the original desktop breakpoint cropped the child portrait and narrowed step copy. Extended stacked layout through960px. Final768 capture contains the complete child/letter;961px desktop capture keeps the portrait visible. Mobile/desktop page width equals scrollWidth.

## Required fidelity surfaces

- Fonts/typography: Japanese serif headline (Noto Serif JP with system Mincho fallbacks), two-line hero, serif step headings, legible sans controls/body, raster handwritten letter. Natural mobile heading wraps verified. The design's hierarchy and approximate optical scale are retained.
- Spacing/layout rhythm: ~65px desktop side margins, hero606px, three evenly divided step columns, restrained vertical rules, sage band and compact footer. At narrow widths, text precedes the full letter image and steps stack. No clipped interactive controls.
- Colors/tokens: warm ivory paper, charcoal text, brick-red CTA, muted sage reaction section. Source image's texture is represented by real photographic raster assets and feathered image masks.
- Image quality/asset fidelity: all five individual raster illustrations are supplied and displayed without placeholder artwork. Hero child, scalloped photo border, handwriting, voice graphic, stacked prints, letter, phone message and response card are present. The small decorative pen from the reference is absent and botanical placement differs; these are acceptable illustration-level differences. No fake whole-page screenshot replaces HTML.
- Copy/content: approved hero/service/step/reaction copy and Japanese controls. Photo/video XOR text was corrected to current mixed-media limits. FAQ discloses registration, free use, optional voice,90 days, link visibility and manual LINE sharing. Static sample is labeled and never injected into real letters.

Focused inspection used the live hero at1086/961px, mobile navigation/heading at390px, and both390px dialogs; their text and control sizes were readable independently of the scaled full-page comparison.

## Functional and accessibility checks

- Header creation CTA opens `/compose` with the actual photo file input; existing form starts without demo media/body.
- How-to links navigate to `#how-it-works`.
- Top and bottom sample triggers open the same native dialog.
- Escape closes the sample and returns focus to the originating trigger.
- FAQ open/close works and returns focus; its long content scrolls inside the mobile viewport.
- All visible navigation/button targets meet44px. Focus styles, native modal semantics and CSS reduced-motion handling are present; no decorative autoplay.
- Console checked after sample, FAQ and composer navigation: zero warnings/errors.
- Automated route/recovery/dialog tests cover135 total tests across app and Worker; final commands are recorded in the task report and PR.

## Findings / follow-up polish

No actionable P0/P1/P2 findings remain. Optional P3: compress the generated PNG assets (about4.3MB combined) for slower mobile connections. Hero is prioritized and supporting images are lazy-loaded. No throttled-network performance audit was performed.

## Implementation checklist

- [x] Compare source and implementation together at matching desktop width.
- [x] Fix mobile typography and tap targets, recapture.
- [x] Fix tablet crop, check both sides of responsive breakpoint.
- [x] Verify navigation, dialogs, Escape/focus and console.
- [x] Preserve service constraints and real form behavior.

final result: passed
