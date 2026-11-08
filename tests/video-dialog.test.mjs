import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  initVideoDialogs,
  videoSource,
} from "../packages/astro/src/blocks/video-dialog/video-dialog.js";

function fixture(src = "https://www.youtube-nocookie.com/embed/M7lc1UVf-VE") {
  const attributes = new Map();
  const frame = {
    dataset: { videoSrc: src },
    set src(value) {
      attributes.set("src", value);
    },
    get src() {
      return attributes.get("src") ?? "";
    },
    removeAttribute: (name) => attributes.delete(name),
    hasAttribute: (name) => attributes.has(name),
  };
  const dialog = new EventTarget();
  dialog.ownerDocument = { baseURI: "https://kita.example/" };
  dialog.querySelector = () => frame;
  const root = { querySelectorAll: () => [dialog] };
  return { dialog, frame, root };
}

test("video dialog loads its frame only when shown and unloads it on hide", () => {
  const { dialog, frame, root } = fixture();
  initVideoDialogs(root);
  assert.equal(frame.hasAttribute("src"), false);

  dialog.dispatchEvent(new Event("shown.bs.modal"));
  assert.equal(
    frame.src,
    "https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?autoplay=1",
  );

  dialog.dispatchEvent(new Event("hidden.bs.modal"));
  assert.equal(frame.hasAttribute("src"), false);
});

test("video dialog binds each dialog once", () => {
  const { dialog, frame, root } = fixture();
  initVideoDialogs(root);
  initVideoDialogs(root);
  let writes = 0;
  const original = Object.getOwnPropertyDescriptor(frame, "src");
  Object.defineProperty(frame, "src", {
    set(value) {
      writes += 1;
      original.set.call(frame, value);
    },
    get: original.get,
  });
  dialog.dispatchEvent(new Event("shown.bs.modal"));
  assert.equal(writes, 1);
});

test("video dialog never loads a non-https address", () => {
  for (const value of ["http://example.com/embed/x", "javascript:alert(1)", "not a url ::"]) {
    assert.equal(videoSource(value, "about:blank"), "", value);
  }
  const { dialog, frame, root } = fixture("http://example.com/embed/x");
  initVideoDialogs(root);
  dialog.dispatchEvent(new Event("shown.bs.modal"));
  assert.equal(frame.hasAttribute("src"), false);
});

test("video play markup mirrors the Core Video Dialog block recipe", async () => {
  const source = await readFile(
    new URL("../packages/astro/src/blocks/video-dialog/VideoPlay.astro", import.meta.url),
    "utf8",
  );
  for (const classes of [
    "d-inline-flex rounded-circle p-3 bg-white bg-opacity-25 animate-breathe",
    "btn btn-light btn-lg rounded-circle p-4 shadow",
    "btn rounded-pill d-inline-flex align-items-center gap-3 p-0 pe-4 border-0 bg-white bg-opacity-25 text-white fw-semibold",
    "d-inline-flex rounded-circle bg-white p-3 shadow animate-breathe",
  ]) {
    assert.ok(source.includes(classes), classes);
  }
  assert.match(source, /VideoPlay without a visible label requires ariaLabel/);
});
