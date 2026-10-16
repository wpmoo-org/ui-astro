import assert from "node:assert/strict";
import test from "node:test";
import {
  defineSite,
  resolvePageOptions,
} from "../packages/astro/src/config/index.js";
import { resolveI18n } from "../packages/astro/src/i18n/profile.js";

const presentation = () => import("../packages/astro/src/site/presentation.js");
const native = { locales: ["en", "de"], defaultLocale: "de" };

test("presentation_defaults_keep_blocks_optional", () => {
  const site = defineSite();
  assert.equal(site.presentation?.navigation, "flat");
  assert.equal(site.presentation.assignedTaxonomies, true);
  assert.equal(site.presentation.themeToggle, false);
  assert.equal(site.presentation.languageSwitcher, false);
  assert.deepEqual(site.links, {});
  assert.ok(Object.isFrozen(site.presentation));
});

test("localized_copy_overrides_only_explicit_labels", async () => {
  const input = {
    defaults: { lang: "de" },
    presentation: {
      navigation: "grouped",
      themeToggle: true,
      languageSwitcher: { size: "sm" },
      brandDescription: "Studio",
      labels: { site: "Home" },
      locales: {
        de: {
          brandDescription: "Unser Studio",
          labels: { darkMode: "Dunkel" },
        },
      },
    },
  };
  const original = structuredClone(input);
  const site = defineSite(input);
  const { resolveSitePresentation } = await presentation();
  const de = resolveSitePresentation(site, "de");
  const en = resolveSitePresentation(site, "en");
  assert.equal(de.labels.site, "Home");
  assert.equal(de.labels.pages, "Seiten");
  assert.equal(de.labels.darkMode, "Dunkel");
  assert.equal(de.labels.lightMode, "Hellen Modus aktivieren");
  assert.equal(de.brandDescription, "Unser Studio");
  assert.equal(en.brandDescription, "Studio");
  assert.equal(en.labels.pages, "Pages");
  assert.equal(de.themeToggle, true);
  assert.ok(Object.isFrozen(de.labels));
  assert.deepEqual(input, original);
  assert.deepEqual(defineSite(site), site);
  assert.equal(resolvePageOptions(site, "page", "single").lang, "de");
});

test("named_links_use_main_locale_base_and_slash_once", async () => {
  const site = defineSite({
    defaults: { lang: "de" },
    links: {
      home: "/",
      nativeAction: "/native-action",
      help: { en: "/help", de: "/hilfe" },
    },
  });
  const i18n = resolveI18n(native, site);
  const { resolveContentLinks } = await presentation();
  assert.deepEqual(
    resolveContentLinks(site, {
      locale: "de",
      i18n,
      base: "/docs",
      trailingSlash: "always",
    }),
    {
      home: "/docs/",
      nativeAction: "/docs/native-action/",
      help: "/docs/hilfe/",
    },
  );
  assert.deepEqual(
    resolveContentLinks(site, {
      locale: "en",
      i18n,
      base: "/docs",
      trailingSlash: "always",
    }),
    {
      home: "/docs/en/",
      nativeAction: "/docs/en/native-action/",
      help: "/docs/en/help/",
    },
  );
  const monolingual = defineSite({
    defaults: { lang: "de" },
    links: { nativeAction: "/native-action" },
  });
  assert.equal(
    resolveContentLinks(monolingual, { base: "/docs", trailingSlash: "never" })
      .nativeAction,
    "/docs/native-action",
  );
  assert.ok(Object.isFrozen(site.links.help));
});

test("named_links_reject_unsafe_paths_and_incomplete_locale_maps", async () => {
  for (const href of [
    "javascript:alert(1)",
    "//host/path",
    "/../help",
    "/help/",
    "/en?query=1",
  ]) {
    assert.throws(
      () => defineSite({ links: { help: href } }),
      /site.links.help/,
    );
  }
  const site = defineSite({
    defaults: { lang: "de" },
    links: { help: { de: "/hilfe" } },
  });
  assert.throws(() => resolveI18n(native, site), /site.links.help.*en/);
  const { resolveContentLinks } = await presentation();
  assert.throws(
    () =>
      resolveContentLinks(site, {
        locale: "en",
        i18n: { ...native, prefixDefaultLocale: false },
      }),
    /site.links.help.*en/,
  );
});

test("presentation_rejects_unknown_fields_and_invalid_controls", () => {
  for (const value of [
    { callback: () => "x" },
    { navigation: "tree" },
    { themeToggle: "yes" },
    { labels: { unknown: "x" } },
    { labels: { language: "" } },
    { languageSwitcher: { links: [] } },
    { languageSwitcher: { size: "giant" } },
    { locales: { de: { themeToggle: false } } },
  ])
    assert.throws(
      () => defineSite({ presentation: value }),
      /site.presentation/,
    );
});

test("presentation_and_link_locale_keys_follow_the_native_profile", () => {
  for (const input of [
    { presentation: { locales: { tr: { labels: { pages: "Sayfalar" } } } } },
    { links: { help: { en: "/help", de: "/hilfe", tr: "/yardim" } } },
    { presentation: { languageSwitcher: { languageNames: { tr: "Türkçe" } } } },
  ]) {
    const site = defineSite({ ...input, defaults: { lang: "de" } });
    assert.throws(
      () => resolveI18n(native, site),
      /tr.*native Astro i18n.locales/,
    );
  }
});

test("monolingual_region_language_remains_valid_in_copy_and_link_maps", async () => {
  const site = defineSite({
    defaults: { lang: "en-US" },
    presentation: { locales: { "en-US": { labels: { pages: "US pages" } } } },
    links: { home: { "en-US": "/" } },
  });
  const { resolveContentLinks, resolveSitePresentation } = await presentation();
  assert.equal(resolveContentLinks(site).home, "/");
  assert.equal(resolveSitePresentation(site, "en-US").labels.pages, "US pages");
});
