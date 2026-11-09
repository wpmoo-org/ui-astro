import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const block = (name) =>
  new URL(`../packages/astro/src/blocks/image-gallery/${name}`, import.meta.url);

// SHA-256 of Moo UI Core src/js/components/image-gallery.js at ui commit
// c919a79 (unchanged at e33ed6b). The Astro copy must stay byte-identical until @wpmoo/astro pins a
// Core release that exports @wpmoo/ui/image-gallery.js.
const CORE_MODULE_SHA256 =
  "e10c2c9d2864e67bd5f11a672dddea33d1edc2376a1f1c74dd6f506704133e61";

test("image gallery runtime is a byte copy of the Core module", async () => {
  const source = await readFile(block("image-gallery.js"));
  assert.equal(createHash("sha256").update(source).digest("hex"), CORE_MODULE_SHA256);
  const module = await import(block("image-gallery.js"));
  assert.equal(typeof module.default.getOrCreateInstance, "function");
  assert.equal(typeof module.initImageGalleries, "function");
});

test("image gallery bridge stylesheet carries the Core gallery rules", async () => {
  const css = (await readFile(block("image-gallery.css"), "utf8")).replace(/\s+/gu, " ");
  for (const rule of [
    ".ratio-3x2 { --bs-aspect-ratio: calc(2 / 3 * 100%); }",
    ".columns-2 { column-count: 2 !important; }",
    "@media (min-width: 768px) { .columns-md-1 { column-count: 1 !important; }",
    "@media (min-width: 1400px) { .columns-xxl-1 { column-count: 1 !important; }",
    ".gallery-justified { --moo-gallery-row-height: 6rem; display: flex; flex-wrap: wrap; }",
    "@media (min-width: 768px) { .gallery-justified { --moo-gallery-row-height: 8rem; } }",
    ".gallery-justified > * { flex: var(--moo-gallery-ratio, 1) 1 calc(var(--moo-gallery-ratio, 1) * var(--moo-gallery-row-height)); aspect-ratio: var(--moo-gallery-ratio, 1); }",
    '.gallery-justified::after { flex-grow: 1e9; content: ""; }',
    ".gallery-stage { height: min(62svh, 38rem); }",
    ".gallery-strip { display: flex; --moo-gallery-strip-height: 13rem; flex-wrap: nowrap; overflow-x: auto; scroll-snap-type: x proximity; contain: inline-size; }",
    ".gallery-strip > * { flex: none; width: calc(var(--moo-gallery-ratio, 1) * var(--moo-gallery-strip-height)); max-width: 85%; height: var(--moo-gallery-strip-height); scroll-snap-align: start; }",
    ".gallery-strip.gallery-strip-bleed { margin-inline: calc(-1 * var(--moo-gallery-strip-bleed, 0.75rem)); padding-inline: var(--moo-gallery-strip-bleed, 0.75rem); scroll-padding-inline: var(--moo-gallery-strip-bleed, 0.75rem); }",
    "@media (max-width: 767.98px) { .gallery-strip-md-down { --moo-gallery-strip-height: 13rem;",
    ".progress.gallery-progress { --bs-progress-height: var(--moo-gallery-progress-height, 0.25rem); opacity: var(--moo-gallery-progress-opacity, 0.08); }",
  ]) {
    assert.ok(css.includes(rule), rule);
  }
  const component = await readFile(block("ImageGallery.astro"), "utf8");
  assert.match(component, /^import "\.\/image-gallery\.css";$/mu);
});

test("image gallery markup mirrors the Core Image Gallery recipe", async () => {
  const source = await readFile(block("ImageGallery.astro"), "utf8");
  for (const fragment of [
    'data-image-gallery',
    '`gallery-justified gap-${gap}`',
    '"d-block rounded overflow-hidden"',
    "style={`--moo-gallery-ratio: ${ratioOf(entry)}`}",
    '`${masonryColumns} column-gap-${gap}`',
    "`d-inline-block w-100 mb-${gap} rounded overflow-hidden`",
    '"ratio ratio-16x9 d-block rounded overflow-hidden"',
    "`ratio ratio-${ratio} d-block rounded overflow-hidden`",
    'class="d-block w-100 h-auto"',
    'class="object-fit-cover"',
    '"data-bs-toggle": "modal"',
    '"data-gallery-index": String(index)',
    'size="xl" fullscreenDown="lg" centered ariaLabel={text.title}',
    'class="d-flex align-items-center justify-content-between gap-3 border-bottom ps-3 ps-sm-4 pe-2 py-2"',
    'class="m-0 small text-body-secondary" aria-live="polite" data-gallery-counter={text.counter}',
    'class="modal-body d-flex p-0 bg-body-tertiary"',
    '["carousel slide", transition === "fade" && "carousel-fade", "flex-grow-1 gallery-stage"]',
    'class={stripClasses} role="region" tabindex="0" aria-label={text.strip}',
    '`gallery-justified gallery-strip-${stripUntil}-down` : "gallery-strip"',
    'stripBleed && "gallery-strip-bleed"',
    'class="d-block w-100 h-100 object-fit-cover"',
    'data-bs-interval="false" data-bs-touch="true" data-gallery-stage',
    'class="h-100 d-flex align-items-center justify-content-center p-3 p-sm-4 bg-body-tertiary"',
    'class="mw-100 mh-100 w-auto h-auto rounded-2 border shadow-sm" data-gallery-src={entry.href}',
    'class="gallery-progress position-absolute bottom-0 start-0 z-2 w-100 rounded-0 bg-transparent d-none"',
    'class="d-flex flex-wrap align-items-center gap-3 border-top px-3 px-sm-4 py-3"',
    'class="m-0 fw-medium" data-gallery-caption',
    'id={`${lightboxId}-fullscreen`}',
    'id={`${lightboxId}-windowed`} class="d-none"',
    'id={`${lightboxId}-previous`}',
    'id={`${lightboxId}-play`}',
    'id={`${lightboxId}-pause`} class="d-none"',
    'id={`${lightboxId}-next`}',
    'dismiss="modal"',
  ]) {
    assert.ok(source.includes(fragment), fragment);
  }
  // A large image is never requested before the lightbox opens.
  assert.doesNotMatch(source, /<img class="mw-100[^>]*\ssrc=/u);
  assert.match(source, /from "astro:assets"/u);
});

test("image gallery labels default to English and are all overridable", async () => {
  const source = await readFile(block("ImageGallery.astro"), "utf8");
  for (const [name, value] of Object.entries({
    title: "Photos",
    strip: "Photos, scroll sideways",
    close: "Close",
    previous: "Previous",
    next: "Next",
    play: "Play slideshow",
    pause: "Pause slideshow",
    progress: "Time until the next photo",
    fullscreen: "Full screen",
    exitFullscreen: "Exit full screen",
    counter: "{current} of {total}",
    showAll: "Show all {total} photos",
  })) {
    assert.ok(source.includes(`  ${name}: "${value}",`), name);
  }
  assert.match(source, /const text: GalleryLabels = \{ \.\.\.DEFAULT_LABELS, \.\.\.labels \};/u);
});

test("dialog fills the screen below a breakpoint and accepts a full layout", async () => {
  const source = await readFile(
    new URL("../packages/astro/src/components/Dialog.astro", import.meta.url),
    "utf8",
  );
  assert.match(source, /fullscreenDown \? `modal-fullscreen-\$\{fullscreenDown\}-down` : ""/u);
  assert.match(source, /Unknown Dialog fullscreenDown breakpoint/u);
  assert.match(source, /<slot name="content" \/>/u);
  assert.match(source, /rawContent \? null : <div class:list=\{\["modal-body", bodyClass\]\}><slot \/><\/div>/u);
});

test("layout lifts dialogs out of the scrolling main content", async () => {
  const source = await readFile(
    new URL("../packages/astro/src/layouts/Layout.astro", import.meta.url),
    "utf8",
  );
  assert.match(source, /document\.addEventListener\("show\.bs\.modal", \(event\) => \{/u);
  assert.match(source, /if \(dialog\.closest\("#main-content"\)\) \{\s+owner\.append\(dialog\);/u);
  assert.match(source, /document\.querySelectorAll<HTMLElement>\("body > \.modal-backdrop"\)/u);
  assert.match(source, /if \(backdrop\) owner\.append\(backdrop\);/u);
});
