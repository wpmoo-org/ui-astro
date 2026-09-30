import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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

test("omitted and undefined layout fields preserve complete inherited preferences", () => {
  const empty = resolvePageOptions(defineSite(), "page", "single");
  const site = defineSite({
    defaults: { pageWidth: undefined, sidebar: { rail: undefined, side: "right" } },
    types: { post: { sidebar: { variant: "inset", side: undefined } } },
  });
  const resolved = resolvePageOptions(site, "post", "single", {
    theme: undefined, headerWidth: undefined,
    sidebar: { rail: false, defaultOpen: undefined },
  });
  assert.deepEqual(resolved, {
    ...empty, sidebar: {
      side: "right", variant: "inset", collapsible: "icon", rail: false,
      defaultOpen: true,
    },
  });
  assert.deepEqual(layoutSchema.parse({}), {});
  assert.deepEqual(resolvePageOptions(defineSite(), "page", "single", {}), empty);
});

test("normalized type, view and Sidebar records are owned immutable preferences", () => {
  const input = { types: { post: {
    sidebar: { rail: false }, views: { single: { sidebar: { side: "right" } } },
  } } };
  const original = structuredClone(input);
  const site = defineSite(input);
  assert.ok(Object.isFrozen(site.types.post.sidebar));
  assert.ok(Object.isFrozen(site.types.post.views.single.sidebar));
  assert.throws(() => { site.types.post.sidebar.rail = true; }, TypeError);
  input.types.post.sidebar.rail = true;
  input.types.post.views.single.sidebar.side = "left";
  const resolved = resolvePageOptions(site, "post", "single");
  assert.equal(resolved.sidebar.rail, false);
  assert.equal(resolved.sidebar.side, "right");
  assert.deepEqual(site.types.post.sidebar, original.types.post.sidebar);
});

test("five preference layers isolate Single, Archive and per-entry Sidebar overrides", () => {
  const site = defineSite({
    defaults: { pageWidth: "lg", sidebar: { side: "right", defaultOpen: false } },
    types: { post: {
      sidebar: { variant: "floating" },
      views: { single: { theme: "dark", sidebar: null } },
    } },
  });
  const retained = structuredClone(site);
  assert.equal(resolvePageOptions(site, "post", "single").sidebar, null);
  const restored = resolvePageOptions(site, "post", "single", { sidebar: {} });
  assert.deepEqual(restored.sidebar, {
    side: "right", variant: "floating", collapsible: "icon", rail: true,
    defaultOpen: false,
  });
  assert.equal(restored.theme, "dark");
  assert.equal(resolvePageOptions(site, "post", "archive").theme, "light");
  assert.deepEqual(resolvePageOptions(site, "post", "archive").sidebar, restored.sidebar);
  assert.equal(resolvePageOptions(site, "post", "single", { pageWidth: "sm" }).pageWidth, "sm");
  assert.equal(resolvePageOptions(site, "post", "single").pageWidth, "lg");
  assert.deepEqual(resolvePageOptions(site, "unknown", "single"), site.defaults);
  assert.deepEqual(structuredClone(site), retained);
});

test("finite layout errors identify defaults, view and Sidebar fields", () => {
  for (const [input, field] of [
    [{ defaults: { views: {} } }, "site.defaults.views"],
    [{ types: { post: { views: { singel: {} } } } }, "site.types.post.views.singel"],
    [{ types: { post: { views: { archive: { views: {} } } } } }, "site.types.post.views.archive.views"],
    [{ defaults: { sidebar: { rail: "false" } } }, "site.defaults.sidebar.rail"],
    [{ defaults: { sidebar: { id: "owned-by-route" } } }, "site.defaults.sidebar.id"],
  ]) {
    assert.throws(() => defineSite(input), (error) => error.message.includes(field), field);
  }
  assert.throws(() => resolvePageOptions(defineSite(), "post", "single", { views: {} }), /page\.views/);
});

test("class keys preserve every identity distinction and source enumeration order", () => {
  const inputs = [
    ["contact.md", "markdown", "contact"],
    ["guide/contact.md", "markdown", "id--guide_002f_contact_002e_md"],
    ["guide-contact.md", "markdown", "guide-contact"],
    ["contact.mdx", "markdown", "id--contact_002e_mdx"],
    ["Contact.md", "markdown", "id--Contact_002e_md"],
    ["cng", "json", "cng"],
    ["cng_1", "json", "id--cng_005f_1"],
    ["id--contact_002e_md", "json", "id--id--contact_005f_002e_005f_md"],
    ["ç.md", "markdown", "id--_00e7__002e_md"],
    ["😀.md", "markdown", "id--_d83d__de00__002e_md"],
  ];
  const output = ([id, source]) => getEntryClasses({ type: "page", id, source })[1];
  for (const [id, source, expected] of inputs) assert.equal(output([id, source]), `page-${expected}`);
  assert.deepEqual(inputs.toReversed().map(output).toReversed(), inputs.map(output));
  assert.deepEqual(getEntryClasses({ type: "card", id: "cng", source: "json" }), ["type-card", "entry-card--cng"]);
  assert.deepEqual(getPageClasses({ view: "taxonomy", taxonomy: "tag", term: "astro" }), ["archive", "tag", "tag-astro"]);
});

test("class arrays are fresh, frozen and sorted independently of supplied memberships", () => {
  const context = { type: "post", id: "news.md", source: "markdown", taxonomies: {
    tag: ["zebra", "astro"], category: ["news"], sector: ["education"],
  } };
  const original = structuredClone(context);
  const classes = getEntryClasses(context);
  assert.deepEqual(classes, ["post", "post-news", "category-news", "tax-sector--education", "tag-astro", "tag-zebra"]);
  assert.notEqual(getEntryClasses(context), classes);
  assert.ok(Object.isFrozen(classes));
  assert.deepEqual(context, original);
  assert.throws(() => getEntryClasses({ ...context, slug: "new-title" }), /entryContext\.slug/);
  assert.throws(() => getPageClasses({ view: "archive", type: "post", entry: context }), /pageContext\.entry/);
  assert.throws(() => getEntryClasses({ ...context, taxonomies: { tag: ["not a term"] } }), /taxonomies\.tag/);
});

test("slug mapping is Unicode-equivalent and independent of the process locale", () => {
  const cases = [
    ["Äpfel", "de-AT", "aepfel"], ["Über uns", "de-CH", "ueber-uns"],
    ["Ü Ö Ä ß", "en", "u-o-a-ss"],
    ["Łódź Æsir Œuvre Þing Đorđe", "en", "lodz-aesir-oeuvre-thing-dorde"],
    [" A -- B  ", "en", "a-b"],
  ];
  for (const [input, lang, expected] of cases) {
    assert.equal(normalizeSlug(input, { lang }), expected);
    assert.equal(normalizeSlug(input.normalize("NFD"), { lang }), expected);
  }
  const script = "import { normalizeSlug } from '@wpmoo/astro/config'; console.log(JSON.stringify(['İletişim','Äpfel','Straße'].map(x => normalizeSlug(x,{lang:'de'}))));";
  const outputs = ["C", "tr_TR.UTF-8", "de_DE.UTF-8"].map((locale) => {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      env: { ...process.env, LANG: locale, LC_ALL: locale }, encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  });
  for (const output of outputs) assert.deepEqual(output, ["iletisim", "aepfel", "strasse"]);
  for (const input of ["\ud800", "a\udc00", "\ud800x", "a/../b", "a\u007fb", "---"]) {
    assert.throws(() => normalizeSlug(input), /slug|segment|ASCII/i);
  }
  assert.equal(normalizeSlug("zhong-wen"), "zhong-wen");
});

test("one-language permalink mapping uses the normalized site's default locale", () => {
  const defaultSite = defineSite();
  const germanSite = defineSite({ defaults: { lang: "de-DE" }, types: {
    post: { views: { single: { theme: "dark" } } },
  } });
  const slug = (site) => normalizeSlug("Über uns", { lang: site.defaults.lang });
  assert.equal(defaultSite.defaults.lang, "en");
  assert.equal(slug(defaultSite), "uber-uns");
  assert.equal(slug(germanSite), "ueber-uns");
  assert.equal(resolvePageOptions(germanSite, "post", "single").lang, "de-DE");
  assert.equal(slug(germanSite), "ueber-uns");
});

test("undefined optional view records behave like omitted view overrides", () => {
  const input = { types: { post: {
    sidebar: {}, views: { single: undefined, archive: undefined },
  } } };
  const site = defineSite(input);
  assert.deepEqual(site.types.post.views, {});
  assert.deepEqual(resolvePageOptions(site, "post", "single"), resolvePageOptions(site, "post", "archive"));
  assert.equal(resolvePageOptions(site, "post", "single").sidebar.rail, true);
  assert.equal(input.types.post.views.single, undefined);
});

test("preference resolver requires a literal string content type ID", () => {
  for (const type of [42, true, { toString: () => "post" }]) {
    assert.throws(() => resolvePageOptions(defineSite(), type, "single"), /type/i);
  }
});
