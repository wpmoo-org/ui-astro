import assert from "node:assert/strict";
import test from "node:test";

import {
  defineSite,
  getEntryClasses,
  getPageClasses,
  layoutSchema,
  normalizeSlug,
  resolvePageOptions,
} from "../src/config/index.js";

test("layout options are strict partial data and five layers preserve false and null", () => {
  assert.deepEqual(layoutSchema.parse({}), {});
  const input = {
    brand: "Example",
    defaults: { pageWidth: "lg", sidebar: { side: "right", rail: true } },
    types: {
      post: {
        sidebar: { variant: "inset" },
        views: { single: { sidebar: null } },
      },
    },
  };
  const original = structuredClone(input);
  const site = defineSite(input);
  const single = resolvePageOptions(site, "post", "single");
  const archive = resolvePageOptions(site, "post", "archive");
  const oneEntry = resolvePageOptions(site, "post", "single", {
    headerWidth: null, sidebar: { defaultOpen: false, rail: false },
  });
  assert.deepEqual(input, original);
  assert.equal(site.brand, "Example");
  assert.equal(single.sidebar, null);
  assert.equal(oneEntry.headerWidth, null);
  assert.equal(Object.hasOwn(oneEntry, "views"), false);
  assert.deepEqual(oneEntry.sidebar, {
    side: "right", variant: "inset", collapsible: "icon", rail: false,
    defaultOpen: false,
  });
  assert.equal(archive.sidebar.rail, true);
  assert.equal(resolvePageOptions(site, "page", "single").pageWidth, "lg");
  assert.equal(resolvePageOptions(defineSite(), "page", "single").headerWidth, null);
  assert.equal(resolvePageOptions(defineSite(), "page", "single").sidebar, null);
  assert.deepEqual(resolvePageOptions(defineSite({ types: { post: { sidebar: {} } } }), "post", "archive").sidebar, {
    side: "left", variant: "sidebar", collapsible: "icon", rail: true, defaultOpen: true,
  });
});

test("layout configuration rejects unknown fields and unsupported views", () => {
  assert.throws(() => defineSite({ defaults: { style: "width: 100px" } }), /style/);
  assert.throws(() => defineSite({ types: { post: { views: { loop: {} } } } }), /loop/);
  assert.throws(() => defineSite({ types: { post: { views: { single: { views: {} } } } } }), /views/);
  assert.throws(() => resolvePageOptions(defineSite(), "post", "loop"), /view/);
  assert.throws(() => resolvePageOptions(defineSite(), "post", "single", { pageWidth: "huge" }), /pageWidth/);
});

test("short classes use exact source identity and sorted direct term IDs", () => {
  const context = {
    type: "post", id: "duyuru.md", source: "markdown",
    taxonomies: { tag: ["astro"], category: ["kurumsal"] },
  };
  const original = structuredClone(context);
  assert.deepEqual(getEntryClasses(context), ["post", "post-duyuru", "category-kurumsal", "tag-astro"]);
  assert.deepEqual(getPageClasses({ view: "single", entry: context }), ["single", "post", "post-duyuru", "category-kurumsal", "tag-astro"]);
  assert.deepEqual(getPageClasses({ view: "single", entry: { type: "team", id: "cng", source: "json" } }), ["single", "type-team", "entry-team--cng"]);
  assert.deepEqual(getPageClasses({ view: "single", entry: { type: "page", id: "contact.md", source: "markdown" } }), ["page", "page-contact"]);
  assert.deepEqual(getPageClasses({ view: "archive", type: "post" }), ["archive", "post"]);
  assert.deepEqual(getPageClasses({ view: "taxonomy", taxonomy: "category", term: "kurumsal" }), ["archive", "category", "category-kurumsal"]);
  assert.deepEqual(getPageClasses({ view: "native", key: "contact" }), ["page", "route-contact"]);
  assert.deepEqual(context, original);
  assert.ok(Object.isFrozen(getEntryClasses(context)));
  assert.deepEqual(getPageClasses(), []);
});

test("identity escaping preserves nested, case, extension and taxonomy boundaries", () => {
  const key = (id, source = "markdown") => getEntryClasses({ type: "page", id, source })[1];
  assert.equal(key("contact.md"), "page-contact");
  assert.equal(key("guide/contact.md"), "page-id--guide_002f_contact_002e_md");
  assert.equal(key("contact.mdx"), "page-id--contact_002e_mdx");
  assert.equal(key("Contact.md"), "page-id--Contact_002e_md");
  assert.equal(key("cng_1", "json"), "page-id--cng_005f_1");
  assert.equal(key("ç.md"), "page-id--_00e7__002e_md");
  assert.equal(key("quote ' here.md"), "page-id--quote_0020__0027__0020_here_002e_md");
  assert.notEqual(key("contact.md"), key("contact.mdx"));
  assert.deepEqual(getEntryClasses({
    type: "team", id: "cng", source: "json", taxonomies: { "a-b": ["c"] },
  }), ["type-team", "entry-team--cng", "tax-a-b--c"]);
  assert.notEqual(
    getEntryClasses({ type: "team", id: "cng", source: "json", taxonomies: { "a-b": ["c"] } })[2],
    getEntryClasses({ type: "team", id: "cng", source: "json", taxonomies: { a: ["b-c"] } })[2],
  );
});

test("class contexts reject malformed keys and duplicate direct memberships", () => {
  assert.throws(() => getEntryClasses({ type: "post", id: "", source: "markdown" }), /id/);
  assert.throws(() => getEntryClasses({ type: "post", id: "x.md", source: "text" }), /source/);
  assert.throws(() => getEntryClasses({ type: "Post", id: "x.md", source: "markdown" }), /type/);
  assert.throws(() => getEntryClasses({ type: "post", id: "x.md", source: "markdown", taxonomies: { tag: ["astro", "astro"] } }), /duplicate/);
  assert.throws(() => getPageClasses({ view: "native", key: "x", style: "red" }), /style/);
});

test("URL normalization follows accepted Turkish and German mappings", () => {
  assert.equal(normalizeSlug("İletişim", { lang: "tr" }), "iletisim");
  assert.equal(normalizeSlug("Şirket Çözümleri", { lang: "tr" }), "sirket-cozumleri");
  assert.equal(normalizeSlug("IĞDIR", { lang: "tr" }), "igdir");
  assert.equal(normalizeSlug("Kılavuz/Kurulum", { lang: "tr" }), "kilavuz/kurulum");
  assert.equal(normalizeSlug("Über uns", { lang: "de-DE" }), "ueber-uns");
  assert.equal(normalizeSlug("Straße", { lang: "de" }), "strasse");
  assert.equal(normalizeSlug("STRAẞE", { lang: "de" }), "strasse");
  assert.equal(normalizeSlug("Äpfel", { lang: "de-CH" }), "aepfel");
  assert.equal(normalizeSlug("Äpfel"), "apfel");
  assert.equal(normalizeSlug("A\u0308pfel", { lang: "de" }), "aepfel");
  assert.equal(normalizeSlug("Smørrebrød"), "smorrebrod");
});

test("URL normalization rejects unsafe structure and unsupported scripts", () => {
  for (const input of ["", "/about", "about/", "about//me", ".", "..", "．．", "a\\b", "a?x", "a#x", "%2e", "about／team", "about？x", "☕", "中文", "a\u0000b"]) {
    assert.throws(() => normalizeSlug(input), /slug|segment|unsafe|ASCII/i, input);
  }
  assert.throws(() => normalizeSlug("about", { language: "tr" }), /language/);
  assert.throws(() => normalizeSlug("about", { lang: "en_US" }), /lang/);
  assert.equal(normalizeSlug("A + B"), "a-b");
});

test("config resolves through its exact public package entrypoint", async () => {
  const publicConfig = await import("@wpmoo/astro/config");
  assert.equal(publicConfig.defineSite, defineSite);
  assert.equal(publicConfig.normalizeSlug, normalizeSlug);
});
