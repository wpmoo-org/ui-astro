// Loads a Video Dialog frame only when its dialog is shown and unloads it when
// the dialog hides, so no video request happens before the visitor asks for
// it and closing stops playback.
const bound = new WeakSet();

/** The https address to load, with autoplay on; empty when unsafe. */
export function videoSource(value, base) {
  let url;
  try {
    url = new URL(value, base);
  } catch {
    return "";
  }
  if (url.protocol !== "https:") return "";
  url.searchParams.set("autoplay", "1");
  return url.href;
}

export function initVideoDialogs(root = document) {
  for (const dialog of root.querySelectorAll("[data-moo-video-dialog]")) {
    if (bound.has(dialog)) continue;
    bound.add(dialog);
    const frame = dialog.querySelector("iframe[data-video-src]");
    if (!frame) continue;
    dialog.addEventListener("shown.bs.modal", () => {
      const source = videoSource(frame.dataset.videoSrc, dialog.ownerDocument?.baseURI);
      if (source) frame.src = source;
    });
    dialog.addEventListener("hidden.bs.modal", () => frame.removeAttribute("src"));
  }
}
