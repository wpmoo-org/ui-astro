import assert from "node:assert/strict";
import test from "node:test";
import { defineSite, resolvePageOptions } from "../src/config/index.js";
import { entrySchema } from "../src/content/index.js";
import { page } from "../src/plugins/page/index.js";
import { post } from "../src/plugins/post/index.js";
import { buildRegistry } from "../src/integration/registry.js";
import { validateTerms } from "../src/taxonomies/paths.js";
import { defineTaxonomy } from "../src/taxonomies/index.js";

const profileApi = await import("../src/i18n/profile.js").catch(() => null);
const graphApi = await import("../src/i18n/graph.js").catch(() => null);
const native = {
  locales: ["en", "de"],
  defaultLocale: "en",
  routing: { prefixDefaultLocale: false },
};
const profile = () => {
  assert.ok(profileApi, "Native locale profile must be implemented");
  return profileApi.resolveI18n(native, defineSite());
};
const entry = (id, locale, translationKey, status = "publish") => ({
  collection: "page",
  id,
  data: { title: id, locale, translationKey, status },
});

test("native content locale and translation key preserve exact source identity", () => {
  const data = entrySchema.parse({
    title: "Contact",
    status: "publish",
    locale: "de",
    translationKey: "contact",
  });
  assert.equal(data.locale, "de");
  assert.equal(data.translationKey, "contact");
  assert.equal(
    entrySchema.safeParse({ ...data, locale: "not_a_locale" }).success,
    false,
  );
  assert.equal(
    entrySchema.safeParse({ ...data, translationKey: "../contact" }).success,
    false,
  );
});

test("locale defaults refine the site layer and preserve theme replacement and direction", () => {
  const input = {
    defaults: { parts: { loop: { emptyText: "No items." } } },
    locales: {
      de: {
        dir: "rtl",
        parts: { loop: { emptyText: "No translated items." } },
      },
    },
    types: { post: { parts: { loop: { emptyText: "Type override." } } } },
  };
  const site = defineSite(input);
  input.locales.de.parts.loop.emptyText = "Changed after definition";
  const pageOptions = resolvePageOptions(
    site,
    "page",
    "single",
    undefined,
    "de",
  );
  assert.equal(pageOptions.lang, "de");
  assert.equal(pageOptions.dir, "rtl");
  assert.equal(pageOptions.parts.loop.emptyText, "No translated items.");
  assert.equal(
    resolvePageOptions(site, "post", "single", undefined, "de").parts.loop
      .emptyText,
    "Type override.",
  );
  assert.equal(resolvePageOptions(site, "page", "single").lang, "en");
  assert.ok(Object.isFrozen(site.locales.de.parts));
  assert.throws(
    () => resolvePageOptions(site, "page", "single", { lang: "en" }, "de"),
    /options.lang.*de/,
  );
  assert.throws(
    () => defineSite({ locales: { de: { dir: "sideways" } } }),
    /locales.de.dir/,
  );
});

test("resolved native locale profile has one authority and explicit unsupported-profile errors", () => {
  assert.deepEqual(profile(), {
    locales: ["en", "de"],
    defaultLocale: "en",
    prefixDefaultLocale: false,
  });
  assert.equal(profileApi.resolveI18n(undefined, defineSite()), null);
  assert.throws(
    () =>
      profileApi.resolveI18n(native, defineSite({ defaults: { lang: "de" } })),
    /defaults.lang.*defaultLocale/,
  );
  assert.throws(
    () => profileApi.resolveI18n(native, defineSite({ locales: { fr: {} } })),
    /locales.fr.*native/,
  );
  assert.throws(
    () =>
      profileApi.resolveI18n(
        native,
        defineSite({ locales: { de: { lang: "en" } } }),
      ),
    /site.locales.de.lang.*de/,
  );
  for (const change of [
    { locales: [{ path: "de", codes: ["de"] }, "en"] },
    { routing: "manual" },
    { fallback: { de: "en" } },
    { domains: { de: "https://example.de" } },
  ]) {
    assert.throws(
      () => profileApi.resolveI18n({ ...native, ...change }, defineSite()),
      /i18n/,
    );
  }
});

test("localized plugin namespaces keep one route owner and reject locale collisions", () => {
  const posts = post({
    locales: { de: { label: "News", basePath: "/beitraege" } },
  });
  const registry = buildRegistry([page(), posts]);
  const localized = profileApi.localizeRegistry(registry, profile());
  assert.deepEqual(
    localized.routes.map((route) => route.pattern),
    [
      "/[...slug]",
      "/posts",
      "/posts/[...slug]",
      "/de/[...slug]",
      "/de/beitraege",
      "/de/beitraege/[...slug]",
    ],
  );
  assert.equal(
    localized.routeClaims.filter(
      (route) => route.pattern === "/de/beitraege/[...slug]",
    ).length,
    1,
  );
  assert.throws(
    () =>
      profileApi.localizeRegistry(
        buildRegistry([page(), post({ locales: { de: { basePath: "/de" } } })]),
        profile(),
      ),
    /locale.*namespace|namespace.*locale/,
  );
  assert.throws(
    () =>
      profileApi.localizeRegistry(
        buildRegistry([post({ locales: { fr: {} } })]),
        profile(),
      ),
    /locales.fr.*native/,
  );
});

test("published translation graph is reciprocal self-inclusive and excludes partial nonpublic targets", () => {
  assert.ok(graphApi, "Translation graph must be implemented");
  const entries = [
    entry("en/contact.md", "en", "contact"),
    entry("de/kontakt.md", "de", "contact"),
    entry("en/only.md", "en", undefined),
    entry("en/upcoming.md", "en", "upcoming"),
    entry("de/spaeter.md", "de", "upcoming", "future"),
  ];
  const source = { type: { id: "page" }, entries };
  const graph = graphApi.translationGraph(
    [source],
    profile(),
    "en",
    (_type, item) =>
      item.id === "en/contact.md"
        ? "/contact"
        : item.id === "de/kontakt.md"
          ? "/de/kontakt"
          : `/${item.id}`,
  );
  const links = graphApi.languageLinks(graph, "page", entries[0]);
  assert.deepEqual(links, [
    { locale: "en", href: "/contact" },
    { locale: "de", href: "/de/kontakt" },
  ]);
  assert.deepEqual(graphApi.languageLinks(graph, "page", entries[1]), links);
  assert.deepEqual(graphApi.languageLinks(graph, "page", entries[2]), []);
  assert.deepEqual(graphApi.languageLinks(graph, "page", entries[3]), [
    { locale: "en", href: "/en/upcoming.md" },
  ]);
  assert.throws(
    () => graphApi.languageLinks(graph, "page", entries[4]),
    /must be publish/,
  );
  assert.ok(Object.isFrozen(links));
  assert.ok(Object.isFrozen(links[0]));
});

test("all statuses validate translation uniqueness and real language with scoped type identity", () => {
  const first = entry("en/contact.md", "en", "contact");
  const build = (entries) =>
    graphApi.translationGraph(
      [{ type: { id: "page" }, entries }],
      profile(),
      "en",
      (_type, value) => `/${value.id}`,
    );
  assert.throws(
    () => build([first, entry("en/duplicate.md", "en", "contact", "draft")]),
    /page.*contact.*en.*duplicate/,
  );
  assert.throws(
    () => build([entry("unknown.md", "fr", "contact", "pending")]),
    /locale.*fr/,
  );
  assert.throws(
    () => build([{ ...first, data: { ...first.data, locale: undefined } }]),
    /locale.*required/,
  );
  assert.throws(
    () =>
      build([{ ...first, data: { ...first.data, options: { lang: "de" } } }]),
    /options.lang/,
  );
  assert.doesNotThrow(() =>
    graphApi.translationGraph(
      [
        { type: { id: "page" }, entries: [first] },
        {
          type: { id: "sample" },
          entries: [{ ...first, collection: "sample" }],
        },
      ],
      profile(),
      "en",
      (type, value) => `/${type}/${value.id}`,
    ),
  );
});

test("one term source retains stable identity and validates localized slug collisions", () => {
  const taxonomy = defineTaxonomy({
    id: "category",
    label: "Categories",
    source: new URL("file:///tmp/category.json"),
    locales: { de: { label: "Topics", slug: "kategorie" } },
  });
  const term = {
    collection: "category",
    id: "guide",
    data: {
      id: "guide",
      name: "Guide",
      slug: "guide",
      locales: { de: { name: "Localized guide", slug: "Äpfel" } },
    },
  };
  const graph = validateTerms(taxonomy, [term], { lang: "de" });
  assert.equal(graph.get("guide").id, "guide");
  assert.equal(graph.get("guide").name, "Localized guide");
  assert.equal(graph.get("guide").slug, "Äpfel");
  assert.ok(Object.isFrozen(graph.get("guide").locales));
  assert.ok(Object.isFrozen(graph.get("guide").locales.de));
  assert.throws(
    () =>
      validateTerms(
        taxonomy,
        [
          term,
          {
            collection: "category",
            id: "other",
            data: {
              id: "other",
              name: "Other",
              slug: "other",
              locales: { de: { slug: "aepfel" } },
            },
          },
        ],
        { lang: "de" },
      ),
    /URL collision/,
  );
});

test("localized taxonomy namespaces remain unique within each native locale", () => {
  const taxonomy = (id, slug) =>
    defineTaxonomy({
      id,
      label: id,
      source: new URL(`file:///tmp/${id}.json`),
      archive: {},
      locales: { de: { slug } },
    });
  const registry = buildRegistry([page()], {
    taxonomies: [taxonomy("category", "topics"), taxonomy("tag", "topics")],
  });
  assert.throws(
    () => profileApi.localizeRegistry(registry, profile()),
    /taxonomy.*de.*collision.*category.*tag/,
  );
  const reserved = buildRegistry([page()], {
    taxonomies: [taxonomy("category", "category")],
    taxonomyBasePath: "/de",
  });
  assert.throws(
    () => profileApi.localizeRegistry(reserved, profile()),
    /taxonomyBasePath.*locale prefix/,
  );
});
