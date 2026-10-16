import assert from "node:assert/strict";
import test from "node:test";
import { defineSite } from "../packages/astro/src/config/index.js";
import { resolveSeoMetadata } from "../packages/astro/src/seo/index.js";

const route = {
  title: "Contact",
  status: "publish",
  type: "page",
  view: "single",
  url: "https://example.test/docs/contact/",
};
const organization = {
  name: "Example Foundation",
  names: { de: "German foundation" },
};

test("default and home titles use the registered publisher independently of the visible brand", () => {
  const site = defineSite({ brand: "UI label", organization });
  assert.equal(
    resolveSeoMetadata(site, route).title,
    "Contact | Example Foundation",
  );
  assert.equal(
    resolveSeoMetadata(site, { ...route, view: "home" }).title,
    "Example Foundation",
  );
  assert.equal(
    resolveSeoMetadata(site, { ...route, lang: "de" }).title,
    "Contact | German foundation",
  );
  assert.equal(resolveSeoMetadata(defineSite(), route).title, "Contact");
  assert.equal(
    resolveSeoMetadata(defineSite(), route).jsonLd.publisher,
    undefined,
  );
});

test("template precedence follows locale type/view, site type/view, locale default, then site default", () => {
  const titleTemplates = {
    default: "site default: {title}",
    home: "site home: {title}",
    types: { page: { single: "site single: {title}" } },
    locales: {
      de: {
        default: "locale default: {title}",
        home: "locale home: {title}",
        types: { page: { single: "locale single: {title}" } },
      },
    },
  };
  const resolve = (templates, extra = {}) =>
    resolveSeoMetadata(defineSite({ seo: { titleTemplates: templates } }), {
      ...route,
      lang: "de",
      ...extra,
    }).title;
  assert.equal(resolve(titleTemplates), "locale single: Contact");
  assert.equal(
    resolve({
      ...titleTemplates,
      locales: { de: { default: "locale default: {title}" } },
    }),
    "site single: Contact",
  );
  assert.equal(
    resolve({ ...titleTemplates, types: {} }),
    "locale single: Contact",
  );
  assert.equal(
    resolve({
      ...titleTemplates,
      types: {},
      locales: { de: { default: "locale default: {title}" } },
    }),
    "locale default: Contact",
  );
  assert.equal(
    resolve({ ...titleTemplates, types: {}, locales: {} }),
    "site default: Contact",
  );
  assert.equal(
    resolve(titleTemplates, { view: "home" }),
    "locale home: Contact",
  );
  assert.equal(
    resolve(
      {
        ...titleTemplates,
        locales: { de: { default: "locale default: {title}" } },
      },
      { view: "home" },
    ),
    "site home: Contact",
  );
  assert.equal(
    resolve(
      {
        ...titleTemplates,
        home: undefined,
        locales: { de: { default: "locale default: {title}" } },
      },
      { view: "home" },
    ),
    "locale default: Contact",
  );
});

test("title substitution preserves literal authored text without recursive interpolation or double escaping", () => {
  const authored = '<script>alert("title")</script> & {organization.name}';
  const metadata = resolveSeoMetadata(defineSite({ organization }), {
    ...route,
    title: authored,
  });
  assert.equal(metadata.title, `${authored} | Example Foundation`);
  assert.equal(metadata.jsonLd.name, authored);
});

test("canonical URLs preserve the caller's actual emitted base and trailing slash", () => {
  for (const url of [
    "https://example.test/",
    "https://example.test/docs/",
    "https://example.test/docs",
    "https://example.test/docs/contact",
    "https://example.test/docs/contact/",
  ]) {
    const metadata = resolveSeoMetadata(defineSite(), { ...route, url });
    assert.equal(metadata.canonical, url);
    assert.equal(metadata.openGraph.url, url);
    assert.equal(metadata.jsonLd.url, url);
  }
});

test("omitted fields produce no invented description, author, image, dates or publisher", () => {
  const metadata = resolveSeoMetadata(defineSite(), route);
  assert.equal(metadata.description, undefined);
  assert.deepEqual(metadata.openGraph, {
    title: "Contact",
    type: "website",
    url: route.url,
  });
  assert.deepEqual(metadata.twitter, { card: "summary", title: "Contact" });
  assert.deepEqual(metadata.jsonLd, {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Contact",
    url: route.url,
  });
});

test("only explicit publish status produces public metadata", () => {
  for (const status of ["draft", "pending", "future"]) {
    assert.equal(
      resolveSeoMetadata(defineSite(), {
        ...route,
        status,
        published_at: "2099-10-01T12:00:00Z",
      }),
      null,
    );
  }
});

test("BlogPosting uses only authored dates and real author/image data with owned immutable output", () => {
  const input = {
    ...route,
    type: "post",
    title: "Announcement",
    description: "A real summary.",
    created_at: "2026-09-27",
    published_at: new Date("2026-09-28T12:00:00Z"),
    updated_at: "2026-09-29T12:00:00+02:00",
    author: { name: "Alex", url: "https://example.test/team/alex" },
    image: "https://example.test/assets/article.png",
  };
  const original = structuredClone(input);
  const metadata = resolveSeoMetadata(defineSite({ organization }), input);
  assert.equal(metadata.jsonLd["@type"], "BlogPosting");
  assert.equal(metadata.jsonLd.headline, input.title);
  assert.equal(metadata.jsonLd.dateCreated, "2026-09-27T00:00:00.000Z");
  assert.equal(metadata.jsonLd.datePublished, "2026-09-28T12:00:00.000Z");
  assert.equal(metadata.jsonLd.dateModified, "2026-09-29T10:00:00.000Z");
  assert.deepEqual(metadata.jsonLd.publisher, {
    "@type": "Organization",
    name: "Example Foundation",
  });
  assert.deepEqual(metadata.jsonLd.author, {
    "@type": "Person",
    name: "Alex",
    url: input.author.url,
  });
  assert.equal(metadata.jsonLd.image, input.image);
  assert.equal(metadata.twitter.card, "summary_large_image");
  assert.equal(metadata.openGraph.type, "article");
  assert.deepEqual(input, original);
  assert.ok(Object.isFrozen(metadata.jsonLd.author));
  input.author.name = "Changed";
  input.published_at.setFullYear(2000);
  assert.equal(metadata.jsonLd.author.name, "Alex");
  assert.equal(metadata.jsonLd.datePublished, "2026-09-28T12:00:00.000Z");
});

test("Post archives and external content types remain truthful WebPage records", () => {
  for (const extra of [
    { type: "post", view: "archive" },
    { type: "team", view: "single" },
    { type: "category", view: "archive" },
  ]) {
    assert.equal(
      resolveSeoMetadata(defineSite(), { ...route, ...extra }).jsonLd["@type"],
      "WebPage",
    );
  }
});

test("unsafe URL, malformed date and unknown metadata fields fail with precise diagnostics", () => {
  for (const url of [
    "/contact",
    "javascript:alert(1)",
    "https:example.test",
    "https:\\example.test\\contact",
    "https://user:pass@example.test/contact",
    "https://example.test/contact?draft=1",
    "https://example.test/contact#section",
    "https://example.test/\ncontact",
  ]) {
    assert.throws(
      () => resolveSeoMetadata(defineSite(), { ...route, url }),
      /route.url/,
    );
  }
  assert.throws(
    () =>
      resolveSeoMetadata(defineSite(), { ...route, updated_at: "2026-02-30" }),
    /route.updated_at/,
  );
  assert.throws(
    () => resolveSeoMetadata(defineSite(), { ...route, status: "archive" }),
    /route.status/,
  );
  assert.throws(
    () => resolveSeoMetadata(defineSite(), { ...route, type: "post" }),
    /route.published_at/,
  );
  assert.throws(
    () =>
      resolveSeoMetadata(defineSite(), {
        ...route,
        type: "post",
        published_at: "2026-09-28",
      }),
    /route.published_at/,
  );
  assert.throws(
    () =>
      resolveSeoMetadata(defineSite(), {
        ...route,
        author: { name: "Alex", url: "javascript:alert(1)" },
      }),
    /route.author.url/,
  );
  assert.throws(
    () =>
      resolveSeoMetadata(defineSite(), {
        ...route,
        image: "data:image/svg+xml,x",
      }),
    /route.image/,
  );
  assert.throws(
    () => resolveSeoMetadata(defineSite(), { ...route, trustedHtml: true }),
    /route.trustedHtml/,
  );
  assert.throws(
    () =>
      resolveSeoMetadata(defineSite({ defaults: { lang: "en_US" } }), route),
    /site.defaults.lang/,
  );
});

test("metadata resolver is available through its one declared public entrypoint", async () => {
  assert.equal(
    (await import("@wpmoo/astro/seo")).resolveSeoMetadata,
    resolveSeoMetadata,
  );
});
