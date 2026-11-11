import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  autoplayInterval,
  initCarousels,
  nearbySlides,
} from "../packages/astro/src/blocks/carousel/carousel.js";

const source = (name) =>
  readFile(new URL(`../packages/astro/src/blocks/carousel/${name}`, import.meta.url), "utf8");

function classList(initial = []) {
  const set = new Set(initial);
  return {
    contains: (name) => set.has(name),
    toggle: (name, force) => (force ? set.add(name) : set.delete(name), force),
  };
}

function node(classes = []) {
  const target = new EventTarget();
  target.classList = classList(classes);
  target.attributes = new Map();
  target.setAttribute = (name, value) => target.attributes.set(name, value);
  target.closest = () => null;
  target.focus = () => {};
  return target;
}

function fixture({ autoplay, reducedMotion = false, slides = 3 } = {}) {
  const images = Array.from({ length: slides }, (_, index) => ({ loading: index === 0 ? "eager" : "lazy" }));
  const items = images.map((image, index) => {
    const item = node(index === 0 ? ["carousel-item", "active"] : ["carousel-item"]);
    item.querySelector = () => (image.loading === "lazy" ? image : null);
    return item;
  });
  const captions = images.map((_, index) => node(index === 0 ? [] : ["d-none"]));
  const play = node(["d-none"]);
  const pause = node();
  const live = node();
  const element = node();
  element.dataset = autoplay ? { mooCarouselAutoplay: String(autoplay) } : {};
  element.ownerDocument = {
    defaultView: { matchMedia: () => ({ matches: reducedMotion }) },
  };
  element.contains = (other) => [play, pause, ...items].includes(other);
  element.querySelectorAll = (selector) =>
    selector === ".carousel-item" ? items : selector === "[data-carousel-caption]" ? captions : [];
  element.querySelector = (selector) =>
    ({ "[data-carousel-play]": play, "[data-carousel-pause]": pause, "[data-carousel-live]": live })[selector] ?? null;
  const calls = [];
  const instance = {
    cycle: () => calls.push("cycle"),
    pause: () => calls.push("pause"),
  };
  const Carousel = {
    options: null,
    getOrCreateInstance(target, options) {
      assert.equal(target, element);
      Carousel.options = options;
      return instance;
    },
  };
  return { Carousel, calls, captions, element, images, live, pause, play, root: { querySelectorAll: () => [element] } };
}

test("nearby slides wrap around the sequence", () => {
  assert.deepEqual(nearbySlides(0, 4), [0, 1, 3]);
  assert.deepEqual(nearbySlides(3, 4), [3, 0, 2]);
  assert.deepEqual(nearbySlides(0, 1), [0]);
  assert.deepEqual(nearbySlides(0, 0), []);
});

test("autoplay accepts whole intervals from one second and is otherwise off", () => {
  assert.equal(autoplayInterval("6000"), 6000);
  assert.equal(autoplayInterval("1000"), 1000);
  for (const value of [undefined, "", "0", "999", "1.5e3x", "abc"]) {
    assert.equal(autoplayInterval(value), 0, String(value));
  }
});

test("a manual carousel starts at once without Bootstrap's ride or interval", () => {
  const { Carousel, calls, captions, element, images, root } = fixture();
  initCarousels(Carousel, root);
  initCarousels(Carousel, root);
  assert.deepEqual(Carousel.options, { interval: false, ride: false, pause: false });
  assert.deepEqual(calls, []);

  const slide = new Event("slide.bs.carousel");
  slide.to = 1;
  element.dispatchEvent(slide);
  // The target photo and both neighbours load; the caption follows the slide.
  assert.deepEqual(images.map((image) => image.loading), ["eager", "eager", "eager"]);
  assert.deepEqual(captions.map((caption) => caption.classList.contains("d-none")), [true, false, true]);
});

test("autoplay cycles with Pause shown and a silent live region", () => {
  const { Carousel, calls, live, pause, play, root } = fixture({ autoplay: 6000 });
  initCarousels(Carousel, root);
  assert.deepEqual(Carousel.options, { interval: 6000, ride: false, pause: false });
  assert.equal(calls.at(-1), "cycle");
  assert.equal(play.classList.contains("d-none"), true);
  assert.equal(pause.classList.contains("d-none"), false);
  assert.equal(live.attributes.get("aria-live"), "off");

  pause.dispatchEvent(new Event("click"));
  assert.equal(calls.at(-1), "pause");
  assert.equal(play.classList.contains("d-none"), false);
  assert.equal(live.attributes.get("aria-live"), "polite");

  play.dispatchEvent(new Event("click"));
  assert.equal(calls.at(-1), "cycle");
});

test("autoplay holds under the pointer and stops when the visitor navigates", () => {
  const { Carousel, calls, element, root } = fixture({ autoplay: 6000 });
  initCarousels(Carousel, root);
  element.dispatchEvent(new Event("mouseenter"));
  assert.equal(calls.at(-1), "pause");
  element.dispatchEvent(new Event("mouseleave"));
  assert.equal(calls.at(-1), "cycle");

  element.dispatchEvent(new Event("keydown"));
  assert.equal(calls.at(-1), "pause");
  element.dispatchEvent(new Event("mouseleave"));
  assert.equal(calls.at(-1), "pause");
});

test("autoplay stops on pointer navigation and when focus enters", () => {
  for (const type of ["pointerdown", "focusin"]) {
    const { Carousel, calls, element, root } = fixture({ autoplay: 6000 });
    initCarousels(Carousel, root);
    element.dispatchEvent(new Event(type));
    assert.equal(calls.at(-1), "pause", type);
  }
});

test("autoplay never starts for visitors who ask for reduced motion", () => {
  const { Carousel, calls, play, root } = fixture({ autoplay: 6000, reducedMotion: true });
  initCarousels(Carousel, root);
  assert.equal(calls.includes("cycle"), false);
  assert.equal(play.classList.contains("d-none"), false);
});

test("carousel markup is Bootstrap's native Carousel with accessible slides", async () => {
  const component = await source("Carousel.astro");
  for (const fragment of [
    '["carousel slide", transition === "fade" && "carousel-fade", className]',
    'aria-roledescription="carousel"',
    "aria-label={label}",
    'data-bs-ride="false"',
    'data-bs-interval="false"',
    "data-moo-carousel-autoplay={cycles ? String(autoplay) : undefined}",
    'data-bs-touch="true"',
    'class="carousel-inner rounded overflow-hidden bg-body-tertiary"',
    'role="group" aria-roledescription="slide" aria-label={slideName(index)}',
    'loading={index === 0 ? "eager" : "lazy"}',
    'fetchpriority={index === 0 ? "high" : undefined}',
    'class="object-fit-cover"',
    '{ "4x5": "125%", "3x4": "133.3333%" }',
    "`--bs-aspect-ratio: ${CUSTOM_RATIOS[ratio]}`",
    '<div class="carousel-indicators">',
    'class:list={["bg-white", index === 0 && "active"]}',
    'aria-current={index === 0 ? "true" : undefined}',
    "`position-absolute bottom-0 ${corner} z-2 d-flex gap-2 m-3`",
    'const corner = dir === "rtl" ? "start-0" : "end-0";',
    'class="d-flex align-items-start gap-3 mt-3"',
    '["m-0 fs-5 fw-medium", index !== 0 && "d-none"]',
    "pauseControl: cycles && pauseControl",
    'size: controlSize',
    '["default", "lg"].includes(controlSize)',
    'initCarousels(bootstrap.Carousel);',
  ]) {
    assert.ok(component.includes(fragment), fragment);
  }
  // Captions are below the photo, never Bootstrap's overlaid caption.
  assert.doesNotMatch(component, /(?<![\w-])carousel-caption(?![\w-])/u);
  // The block adds no stylesheet of its own.
  assert.doesNotMatch(component, /<style|\.css["']/u);
});

test("carousel controls are Moo Buttons that follow the direction", async () => {
  const controls = await source("CarouselControls.astro");
  for (const fragment of [
    'dir === "rtl" ? ["chevron-right", "chevron-left"] : ["chevron-left", "chevron-right"]',
    '{ variant: "light", class: "rounded-circle shadow-sm" }',
    '{ variant: "outline", class: "" }',
    'const iconSize = size === "lg" ? "icon-lg" : "icon";',
    "const shared = { variant: look.variant, size: iconSize, ariaControls: innerId };",
    'ariaLabel={labels.previous} data-bs-target={`#${carouselId}`} data-bs-slide="prev"',
    'ariaLabel={labels.next} data-bs-target={`#${carouselId}`} data-bs-slide="next"',
    "ariaLabel={labels.play} data-carousel-play",
    "ariaLabel={labels.pause} data-carousel-pause",
  ]) {
    assert.ok(controls.includes(fragment), fragment);
  }
});

test("Bootstrap's carousel rules come from the Core stylesheet", async () => {
  const css = (
    await readFile(new URL(import.meta.resolve("@wpmoo/ui/moo-ui.css")), "utf8")
  ).replace(/\s+/gu, " ");
  for (const rule of [
    ".carousel { position: relative; }",
    ".carousel-fade .carousel-item { opacity: 0; transition-property: opacity; transform: none; }",
    ".carousel-indicators { position: absolute;",
    "@media (prefers-reduced-motion: reduce) { .carousel-item { transition: none; } }",
  ]) {
    assert.ok(css.includes(rule), rule);
  }
});
