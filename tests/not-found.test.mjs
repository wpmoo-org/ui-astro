import assert from "node:assert/strict";
import test from "node:test";

import { defineSite } from "../packages/astro/src/config/index.js";
import { resolveI18n } from "../packages/astro/src/i18n/profile.js";
import {
  normalizeNotFound,
  resolveNotFoundOptions,
} from "../packages/astro/src/not-found/options.js";

function profile({
  lang = "en",
  locales = ["en", "de"],
  prefix = false,
  site = {},
  notFound,
  base = "/",
  trailingSlash = "ignore",
} = {}) {
  const config = defineSite({ ...site, defaults: { ...site.defaults, lang } });
  return {
    site: config,
    base,
    trailingSlash,
    i18n: resolveI18n(
      locales
        ? {
            locales,
            defaultLocale: lang,
            routing: { prefixDefaultLocale: prefix },
          }
        : undefined,
      config,
    ),
    notFound: normalizeNotFound(notFound),
  };
}

test("partial_copy_inherits_each_field", () => {
  const selected = profile({
    notFound: {
      messages: {
        de: { homeLabel: "Zurück", title: undefined },
        en: { title: "Missing" },
      },
    },
  });
  const de = resolveNotFoundOptions(selected, "de");
  assert.equal(de.title, "Seite nicht gefunden");
  assert.equal(de.description, "Die angeforderte Seite wurde nicht gefunden.");
  assert.equal(de.homeLabel, "Zurück");
  assert.equal(de.locale, "de");
  assert.equal(de.options.lang, "de");
  assert.equal(de.homeHref, "/de");
  assert.equal(resolveNotFoundOptions(selected).title, "Missing");
  assert.equal(resolveNotFoundOptions(selected).homeLabel, "Back to home");
  assert.equal(selected.notFound.routeOwner, "plugin");
});

test("third_locale_falls_back_to_main_copy", () => {
  const selected = profile({
    lang: "de",
    locales: ["en", "de", "fr"],
    notFound: {
      messages: { de: { title: "Nicht da" }, fr: { homeLabel: "Accueil" } },
    },
    trailingSlash: "always",
  });
  const fr = resolveNotFoundOptions(selected, "fr");
  assert.equal(fr.title, "Nicht da");
  assert.equal(fr.description, "Die angeforderte Seite wurde nicht gefunden.");
  assert.equal(fr.homeLabel, "Accueil");
  assert.equal(fr.locale, "fr");
  assert.equal(fr.options.lang, "fr");
  assert.equal(fr.homeHref, "/fr/");
  assert.equal(resolveNotFoundOptions(selected, "en").title, "Page not found");
  assert.equal(
    resolveNotFoundOptions(profile({ lang: "fr", locales: ["en", "fr"] }))
      .title,
    "Page not found",
  );
});

test("messages_are_owned_and_frozen", () => {
  const input = { routeOwner: "host", messages: { de: { title: "Fehlt" } } };
  const selected = profile({
    notFound: input,
    site: {
      defaults: {
        parts: { content: { utilities: [] } },
      },
    },
  });
  input.messages.de.title = "Mutated";
  const options = resolveNotFoundOptions(selected, "de");
  assert.equal(options.title, "Fehlt");
  assert.deepEqual(options.options.parts.content.utilities, []);
  assert.equal(options.brand, selected.site.brand);
  function frozen(value) {
    if (value && typeof value === "object") {
      assert.ok(Object.isFrozen(value));
      for (const child of Object.values(value)) frozen(child);
    }
  }
  frozen(selected.notFound);
  frozen(options);
  assert.throws(() => {
    options.languageLinks[0].href = "/changed";
  }, TypeError);
  assert.throws(() => {
    selected.notFound.messages.de.title = "Changed";
  }, TypeError);
});

test("invalid_copy_names_the_field", () => {
  for (const [input, field] of [
    [null, "moo.notFound"],
    [[], "moo.notFound"],
    [{ unknown: true }, "moo.notFound.unknown"],
    [{ routeOwner: "theme" }, "moo.notFound.routeOwner"],
    [{ routeOwner: null }, "moo.notFound.routeOwner"],
    [{ messages: null }, "moo.notFound.messages"],
    [{ messages: new Map() }, "moo.notFound.messages"],
    [{ messages: { en_US: {} } }, "moo.notFound.messages.en_US"],
    [{ messages: { en: [] } }, "moo.notFound.messages.en"],
    [{ messages: { en: { label: "Home" } } }, "moo.notFound.messages.en.label"],
    ...[null, false, 1, "", "  ", "Bad\u0000text"].map((title) => [
      { messages: { en: { title } } },
      "moo.notFound.messages.en.title",
    ]),
  ]) {
    assert.throws(
      () => normalizeNotFound(input),
      (error) => error instanceof TypeError && error.message.includes(field),
      field,
    );
  }
  const message = "<script>alert('text')</script>";
  assert.equal(
    normalizeNotFound({ messages: { en: { title: message } } }).messages.en
      .title,
    message,
  );
});

test("inactive_languages_are_diagnosed_without_changing_selected_language", () => {
  assert.throws(
    () => resolveNotFoundOptions(profile(), "fr"),
    /notFound.*locale.*fr/,
  );
  assert.throws(
    () => resolveNotFoundOptions(profile(), ""),
    /notFound.*locale/,
  );
  assert.throws(
    () =>
      resolveNotFoundOptions(
        profile({
          notFound: {
            messages: { fr: { title: "Missing" } },
          },
        }),
      ),
    /moo\.notFound\.messages\.fr/,
  );
  const single = profile({ lang: "de", locales: null });
  assert.equal(resolveNotFoundOptions(single).title, "Seite nicht gefunden");
  assert.equal(resolveNotFoundOptions(single).homeHref, "/");
  assert.throws(
    () => resolveNotFoundOptions(single, "en"),
    /notFound.*locale.*en/,
  );
  assert.deepEqual(resolveNotFoundOptions(single).languageLinks, [
    { locale: "de", href: "/" },
  ]);
});

test("home_links_follow_main_base_and_slashes", () => {
  for (const lang of ["en", "de"]) {
    for (const prefix of [false, true]) {
      for (const trailingSlash of ["always", "never", "ignore"]) {
        const selected = profile({
          lang,
          prefix,
          base: "/site",
          trailingSlash,
        });
        for (const locale of ["en", "de"]) {
          const options = resolveNotFoundOptions(selected, locale);
          const local = prefix || locale !== lang ? `/${locale}` : "";
          const slash = local
            ? trailingSlash === "always"
            : trailingSlash !== "never";
          assert.equal(options.homeHref, `/site${local}${slash ? "/" : ""}`);
          assert.equal(options.options.lang, locale);
          assert.deepEqual(
            options.languageLinks,
            ["en", "de"].map((value) => {
              const local = prefix || value !== lang ? `/${value}` : "";
              const slash = local
                ? trailingSlash === "always"
                : trailingSlash !== "never";
              return {
                locale: value,
                href: `/site${local}${slash ? "/" : ""}`,
              };
            }),
          );
        }
      }
    }
  }
});

test("error_preferences_inherit_shared_page_single_options", () => {
  const selected = profile({
    site: {
      defaults: {
        pageWidth: "lg",
        parts: { content: { utilities: ["py-2"] } },
      },
      types: { page: { views: { single: { theme: "dark" } } } },
      locales: { de: { dir: "rtl" } },
    },
  });
  const de = resolveNotFoundOptions(selected, "de");
  assert.equal(de.options.pageWidth, "lg");
  assert.equal(de.options.theme, "dark");
  assert.equal(de.options.dir, "rtl");
  assert.deepEqual(de.options.parts.content.utilities, ["py-2"]);
  assert.throws(
    () =>
      profile({
        site: {
          defaults: {
            parts: {
              pageHeader: { titleUtilities: ["fw-normal"] },
            },
          },
        },
      }),
    /pageHeader\.titleUtilities/,
  );
});
