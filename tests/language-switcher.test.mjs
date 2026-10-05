import assert from "node:assert/strict";
import test from "node:test";

const api =
  await import("../packages/astro/src/blocks/language-switcher/language-switcher.js").catch(
    (error) => {
      if (error.code !== "ERR_MODULE_NOT_FOUND") throw error;
      return {};
    },
  );
function resolve(input) {
  assert.equal(
    typeof api.resolveLanguageSwitcher,
    "function",
    "language switcher resolver must exist",
  );
  return api.resolveLanguageSwitcher(input);
}
const links = Object.freeze([
  Object.freeze({ locale: "en", href: "/base/project/about-us/" }),
  Object.freeze({ locale: "de", href: "/base/de/projekt/%C3%BCber-uns/" }),
]);
const input = { links, currentLocale: "de", label: "Sprache" };

test("language choices preserve canonical hrefs and published ordering", () => {
  const result = resolve(input);
  assert.deepEqual(
    result.items.map((item) => item.href),
    links.map((link) => link.href),
  );
  assert.equal(result.items[1].active, true);
  assert.equal(result.items[0].active, false);
  assert.equal(result.items[1].lang, "de");
  assert.equal(result.items[1].hreflang, "de");
  assert.equal(result.visible, true);
});

test("native language names have explicit project overrides", () => {
  assert.deepEqual(
    resolve(input).items.map((item) => item.label),
    ["English", "Deutsch"],
  );
  assert.equal(
    resolve({ ...input, languageNames: { de: "German content" } }).items[1]
      .label,
    "German content",
  );
  assert.equal(
    resolve({ ...input, links: [{ locale: "zz", href: "/zz" }] }).items[0]
      .label,
    "zz",
  );
});

test("readonly inputs are preserved and the owned projection is immutable", () => {
  const names = Object.freeze({ en: "English", de: "Deutsch" });
  const source = Object.freeze({ ...input, languageNames: names });
  const result = resolve(source);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.items), true);
  assert.equal(Object.isFrozen(result.items[1]), true);
  assert.notEqual(result.items, links);
  assert.deepEqual(source, { ...input, languageNames: names });
});

test("zero and one available language need no switcher", () => {
  assert.equal(resolve({ ...input, links: [] }).visible, false);
  assert.equal(resolve({ ...input, links: [links[0]] }).visible, false);
});

test("sparse language lists fail validation before visibility", () => {
  const partial = new Array(2);
  partial[1] = links[1];
  for (const sparse of [new Array(1), new Array(2), partial]) {
    assert.throws(
      () => resolve({ ...input, links: Object.freeze(sparse) }),
      /must be a language link/,
    );
  }
});

test("invalid hrefs still fail in a hidden single-language list", () => {
  for (const href of [
    "//example.org/de",
    "https://example.org/de",
    "javascript:alert(1)",
    "de/page",
    "/\\example.org",
    "/de\npage",
    "/de page",
    "",
  ]) {
    assert.throws(
      () => resolve({ ...input, links: [{ locale: "de", href }] }),
      TypeError,
    );
  }
});

test("local URLs retain Unicode, a base, query strings and fragments", () => {
  const href = "/base/de/über-uns/?a=1&b=2#team";
  assert.equal(
    resolve({ ...input, links: [{ locale: "de", href }] }).items[0].href,
    href,
  );
});

test("equivalent locale codes are duplicate choices", () => {
  for (const locales of [
    ["en-gb", "en-GB"],
    ["iw", "he"],
  ]) {
    assert.throws(
      () =>
        resolve({
          ...input,
          links: locales.map((locale) => ({ locale, href: "/" })),
        }),
      /duplicate.*locale/i,
    );
  }
});

test("current state compares canonical locale identity", () => {
  const result = resolve({
    ...input,
    currentLocale: "en-gb",
    links: [{ locale: "en-GB", href: "/british" }, links[1]],
  });
  assert.equal(result.items[0].active, true);
  assert.equal(result.items[0].hreflang, "en-GB");
});

test("an absent current locale never selects an unrelated translation", () => {
  const result = resolve({ ...input, currentLocale: "fr" });
  assert.equal(
    result.items.some((item) => item.active),
    false,
  );
});

test("invalid locale fields produce a configuration error", () => {
  for (const locale of ["", "en_US", " de ", undefined, 5]) {
    assert.throws(
      () => resolve({ ...input, currentLocale: locale }),
      TypeError,
    );
    assert.throws(
      () => resolve({ ...input, links: [{ locale, href: "/de" }] }),
      TypeError,
    );
  }
});

test("required names and supplied headings must be nonempty text", () => {
  for (const value of ["", " ", null, 5]) {
    assert.throws(() => resolve({ ...input, label: value }), TypeError);
    assert.throws(() => resolve({ ...input, menuLabel: value }), TypeError);
    assert.throws(
      () => resolve({ ...input, languageNames: { de: value } }),
      TypeError,
    );
  }
  const result = resolve({
    ...input,
    menuLabel: "Sprache auswählen",
    languageNames: { de: "<Deutsch>" },
  });
  assert.equal(result.menuLabel, "Sprache auswählen");
  assert.equal(result.items[1].label, "<Deutsch>");
});

test("the three label modes have a responsive default", () => {
  assert.equal(resolve(input).labelVisibility, "responsive");
  for (const labelVisibility of ["responsive", "visible", "hidden"])
    assert.equal(
      resolve({ ...input, labelVisibility }).labelVisibility,
      labelVisibility,
    );
  assert.throws(
    () => resolve({ ...input, labelVisibility: "mobile" }),
    TypeError,
  );
});

test("choices and language names require array and map data", () => {
  for (const value of [null, {}, "en"])
    assert.throws(() => resolve({ ...input, links: value }), TypeError);
  for (const value of [null, [], "Deutsch"])
    assert.throws(() => resolve({ ...input, languageNames: value }), TypeError);
});
