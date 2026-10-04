const supportedSchemes = new Set(["http:", "https:", "mailto:", "tel:"]);

export function navigationHref(href, field = "href") {
  if (typeof href !== "string" || !href || href !== href.trim() ||
      /[\x00-\x20\x7f\\]/u.test(href) || href.startsWith("//")) {
    throw new TypeError(`${field} must be a safe navigation URL`);
  }
  let url;
  try {
    url = new URL(href, "https://wpmoo.invalid/");
  } catch {
    throw new TypeError(`${field} must be a valid navigation URL`);
  }
  const explicitScheme = /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(href);
  if (explicitScheme && !supportedSchemes.has(url.protocol)) {
    throw new TypeError(`${field} uses an unsupported navigation scheme`);
  }
  if (!explicitScheme && url.protocol !== "https:") {
    throw new TypeError(`${field} must resolve to a local or HTTPS URL`);
  }
  if ((url.protocol === "http:" || url.protocol === "https:") && !url.hostname) {
    throw new TypeError(`${field} must name a host`);
  }
  if ((url.protocol === "mailto:" || url.protocol === "tel:") && !url.pathname) {
    throw new TypeError(`${field} must name a destination`);
  }
  return href;
}
