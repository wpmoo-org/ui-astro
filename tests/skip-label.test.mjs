// Skip link text: Layout skipText prop > host skipLabel (page, type, locale,
// defaults) > built-in copy by page lang (primary subtag) > English.
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import {
  defineSite,
  resolvePageOptions,
  resolveParts,
} from "../packages/astro/src/config/index.js";
import { createRenderer } from "./helpers/render-astro.mjs";

let renderer;
before(async () => { renderer = await createRenderer(undefined, { stubIntegration: true }); });
after(async () => { await renderer?.close(); });

const skipText = (html) =>
  /<a [^>]*href="#main-content"[^>]*>\s*([^<]*?)\s*<\/a>/u.exec(html)?.[1];

async function render(site, locale, props = {}) {
  const options = resolvePageOptions(site, "page", "single", undefined, locale);
  return skipText(await renderer.render("layouts/Layout.astro", {
    props: { title: "T", lang: options.lang, parts: options.parts, ...props },
    slots: { default: "<p>x</p>" },
  }));
}

const i18nSite = (input = {}) =>
  defineSite({ defaults: { lang: "en" }, ...input });

test("resolved parts carry no skipLabel unless the host sets one", () => {
  assert.equal(resolveParts().header.skipLabel, undefined);
  assert.equal(defineSite().defaults.parts.header.skipLabel, undefined);
  assert.equal(
    resolveParts({ header: { skipLabel: "Skip to main content" } }).header.skipLabel,
    "Skip to main content",
  );
});

test("a German page without a host value uses the built-in German text", async () => {
  assert.equal(await render(i18nSite(), "de"), "Zum Hauptinhalt springen");
  assert.equal(await render(i18nSite(), "en"), "Skip to main content");
});

test("the primary language subtag selects the built-in text", async () => {
  const html = await renderer.render("layouts/Layout.astro", {
    props: { title: "T", lang: "de-DE" },
    slots: { default: "<p>x</p>" },
  });
  assert.equal(skipText(html), "Zum Hauptinhalt springen");
});

test("an unknown locale falls back to English", async () => {
  assert.equal(await render(i18nSite(), "fr"), "Skip to main content");
  for (const lang of ["fr", "constructor", "x-klingon"]) {
    const html = await renderer.render("layouts/Layout.astro", {
      props: { title: "T", lang },
      slots: { default: "<p>x</p>" },
    });
    assert.equal(skipText(html), "Skip to main content");
  }
});

test("a host value in site.defaults wins on de and en pages", async () => {
  const site = i18nSite({
    defaults: { lang: "en", parts: { header: { skipLabel: "Host skip" } } },
  });
  assert.equal(await render(site, "de"), "Host skip");
  assert.equal(await render(site, "en"), "Host skip");
});

test("a host English value in site.defaults stays English on de pages", async () => {
  const site = i18nSite({
    defaults: { lang: "en", parts: { header: { skipLabel: "Skip to main content" } } },
  });
  assert.equal(await render(site, "de"), "Skip to main content");
});

test("a per-locale host value wins for that locale only", async () => {
  const site = i18nSite({
    defaults: { lang: "en", parts: { header: { skipLabel: "Default skip" } } },
    locales: { de: { parts: { header: { skipLabel: "Lokaler Sprung" } } } },
  });
  assert.equal(await render(site, "de"), "Lokaler Sprung");
  assert.equal(await render(site, "en"), "Default skip");
  const localeOnly = i18nSite({
    locales: { fr: { parts: { header: { skipLabel: "Aller au contenu" } } } },
  });
  assert.equal(await render(localeOnly, "fr"), "Aller au contenu");
  assert.equal(await render(localeOnly, "de"), "Zum Hauptinhalt springen");
  assert.equal(await render(localeOnly, "en"), "Skip to main content");
});

test("the Layout skipText prop still wins over every other level", async () => {
  const site = i18nSite({
    defaults: { lang: "en", parts: { header: { skipLabel: "Default skip" } } },
    locales: { de: { parts: { header: { skipLabel: "Lokaler Sprung" } } } },
  });
  assert.equal(await render(site, "de", { skipText: "Prop skip" }), "Prop skip");
  assert.equal(await render(i18nSite(), "de", { skipText: "Prop skip" }), "Prop skip");
});
