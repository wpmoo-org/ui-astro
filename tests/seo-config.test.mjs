import assert from "node:assert/strict";
import test from "node:test";
import { defineSite, resolvePageOptions } from "../src/config/index.js";

test("registered organization supplies an omitted brand without overriding an explicit brand", () => {
  let site;
  assert.doesNotThrow(() => {
    site = defineSite({ organization: { name: "Example Foundation" } });
  });
  assert.equal(site.brand, "Example Foundation");
  assert.equal(site.organization.name, "Example Foundation");
  assert.equal(
    defineSite({ brand: "Site label", organization: { name: "Publisher" } })
      .brand,
    "Site label",
  );
  assert.equal(defineSite().brand, "Moo UI");
  assert.equal(Object.hasOwn(defineSite(), "organization"), false);
  assert.equal(resolvePageOptions(site, "page", "single").sidebar, null);
});

test("finite localized title templates and organization names are owned immutable data", () => {
  const input = {
    organization: { name: "Publisher", names: { de: "German publisher" } },
    seo: {
      titleTemplates: {
        home: "{organization.name}",
        default: "{title} | {organization.name}",
        types: { post: { single: "{title} — Article" } },
        locales: {
          de: {
            default: "{title} — {organization.name}",
            types: { post: { archive: "News — {organization.name}" } },
          },
        },
      },
    },
  };
  const original = structuredClone(input);
  let site;
  assert.doesNotThrow(() => {
    site = defineSite(input);
  });
  assert.deepEqual(input, original);
  assert.ok(Object.isFrozen(site.organization.names));
  assert.ok(Object.isFrozen(site.seo.titleTemplates.locales.de.types.post));
  input.organization.names.de = "Changed";
  input.seo.titleTemplates.locales.de.types.post.archive = "Changed";
  assert.equal(site.organization.names.de, "German publisher");
  assert.equal(
    site.seo.titleTemplates.locales.de.types.post.archive,
    "News — {organization.name}",
  );
});

test("title template errors identify the exact configuration field", () => {
  for (const [input, field] of [
    [{ organization: { name: "" } }, "site.organization.name"],
    [
      { organization: { name: "Publisher", names: { en_US: "Publisher" } } },
      "site.organization.names",
    ],
    [
      { seo: { titleTemplates: { default: "{unknown}" } } },
      "site.seo.titleTemplates.default",
    ],
    [
      { seo: { titleTemplates: { home: "{title" } } },
      "site.seo.titleTemplates.home",
    ],
    [
      { seo: { titleTemplates: { types: { Post: { single: "{title}" } } } } },
      "site.seo.titleTemplates.types",
    ],
    [
      { seo: { titleTemplates: { types: { post: { loop: "{title}" } } } } },
      "site.seo.titleTemplates.types.post.loop",
    ],
    [
      { seo: { titleTemplates: { locales: { de: { locales: {} } } } } },
      "site.seo.titleTemplates.locales.de.locales",
    ],
    [
      { seo: { titleTemplates: { default: "{organization.name}" } } },
      "site.seo.titleTemplates.default",
    ],
  ]) {
    assert.throws(
      () => defineSite(input),
      (error) => error.message.includes(field),
      field,
    );
  }
});
