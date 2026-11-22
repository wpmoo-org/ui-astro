import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { defineSite } from "../packages/astro/src/config/index.js";
import { resolveSeoMetadata } from "../packages/astro/src/seo/index.js";
import { createRenderer } from "./helpers/render-astro.mjs";

// The 404 route's robots meta is checked in the built fixture
// (tests/test_not_found_contract.py); rendering it here would need the
// routes, i18n and not-found virtual modules.
let renderer;
before(async () => { renderer = await createRenderer(undefined, { stubIntegration: true }); });
after(async () => { await renderer?.close(); });

const site = defineSite({ organization: { name: "Example Foundation" } });
const route = {
  title: "Contact",
  status: "publish",
  type: "page",
  view: "single",
  url: "https://example.test/contact/",
  alternates: [
    { locale: "en", url: "https://example.test/contact/" },
    { locale: "de", url: "https://example.test/de/kontakt/" },
  ],
};
const head = async (metadata, extra = {}) => {
  const html = await renderer.render("layouts/Layout.astro", {
    props: { title: "Contact", metadata, ...extra },
    slots: { default: "<p>x</p>" },
  });
  return html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
};
const count = (html, pattern) => html.match(new RegExp(pattern, "gu"))?.length ?? 0;

test("Layout renders one robots meta and no JSON-LD for a noindex page", async () => {
  const html = await head(resolveSeoMetadata(site, { ...route, noindex: true }));
  assert.equal(count(html, '<meta name="robots" content="noindex, follow">'), 1);
  assert.equal(count(html, "application/ld\\+json"), 0);
  assert.equal(count(html, '<link rel="canonical" href="https://example.test/contact/">'), 1);
  assert.equal(count(html, '<link rel="alternate" hreflang='), 2);
  assert.equal(count(html, 'property="og:url"'), 1);
});

test("Layout renders no robots meta for an indexable page or without metadata", async () => {
  const indexed = await head(resolveSeoMetadata(site, route));
  assert.equal(count(indexed, 'name="robots"'), 0);
  assert.equal(count(indexed, "application/ld\\+json"), 1);
  for (const metadata of [undefined, null]) {
    assert.equal(count(await head(metadata), 'name="robots"'), 0);
  }
});

test("Layout noindex writes one robots meta without a site, canonical or JSON-LD", async () => {
  for (const metadata of [undefined, null]) {
    const html = await head(metadata, { noindex: true });
    assert.equal(count(html, '<meta name="robots" content="noindex, follow">'), 1);
    assert.equal(count(html, 'rel="canonical"'), 0);
    assert.equal(count(html, "application/ld\\+json"), 0);
  }
  const both = await head(resolveSeoMetadata(site, { ...route, noindex: true }), { noindex: true });
  assert.equal(count(both, 'name="robots"'), 1);
  assert.equal(count(await head(undefined, { noindex: false }), 'name="robots"'), 0);
});

test("Layout noindex prop drops JSON-LD from indexable metadata, keeping canonical, alternates and OG", async () => {
  const html = await head(resolveSeoMetadata(site, route), { noindex: true });
  assert.equal(count(html, '<meta name="robots" content="noindex, follow">'), 1);
  assert.equal(count(html, "application/ld\\+json"), 0);
  assert.equal(count(html, '<link rel="canonical" href="https://example.test/contact/">'), 1);
  assert.equal(count(html, '<link rel="alternate" hreflang='), 2);
  assert.equal(count(html, 'property="og:url"'), 1);
});
