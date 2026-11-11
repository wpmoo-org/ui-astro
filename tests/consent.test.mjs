import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  consentLabels,
  localize,
  revisionOf,
  runtimeConfig,
  scriptJson,
  shownCategories,
} from "../packages/astro/src/blocks/consent/consent-config.js";
import { consent } from "../apps/demo/data/consent.js";

const block = (name) =>
  new URL(`../packages/astro/src/blocks/consent/${name}`, import.meta.url);

test("consent runtime is the Core public module", async () => {
  const facadeUrl = new URL("../packages/astro/src/runtime/consent.js", import.meta.url);
  assert.equal(
    (await readFile(facadeUrl, "utf8")).trim(),
    'export { default, initConsent, consentRevision } from "@wpmoo/ui/consent.js";',
  );
  const published = await import("@wpmoo/ui/consent.js");
  const facade = await import(facadeUrl);
  assert.equal(facade.default, published.default);
  assert.equal(facade.initConsent, published.initConsent);
  assert.match(
    await readFile(block("ConsentManager.astro"), "utf8"),
    /^  import \{ initConsent \} from "\.\.\/\.\.\/runtime\/consent\.js";$/mu,
  );
});

test("the build-time revision equals Core's rule and test vector", async () => {
  // functional/site, statistics/matomo, external_media/video in Core's tests.
  assert.equal(revisionOf(consent), "7b2ac531ea92");
  const { consentRevision } = await import("@wpmoo/ui/consent.js");
  assert.equal(await consentRevision(consent.categories), revisionOf(consent));
  assert.equal(await consentRevision(consent.categories, 2), revisionOf({ ...consent, reask: 2 }));
  assert.equal(revisionOf({ ...consent, revision: "fixed" }), "fixed");
});

test("only categories with services are shown and only functional is required", () => {
  assert.deepEqual(shownCategories(consent).map((category) => category.id), [
    "functional",
    "statistics",
    "external_media",
  ]);
  const runtime = runtimeConfig(consent);
  assert.deepEqual(runtime.categories[0], { id: "functional", required: true });
  assert.deepEqual(runtime.categories[1].storage, [
    { name: "_pk_id.*", type: "cookie" },
    { name: "_pk_ses.*", type: "cookie" },
  ]);
  assert.deepEqual(runtime.cookie, { name: "moo_consent_demo", days: 365 });
  const invalid = [
    { categories: [{ id: "statistics", label: "S", required: true, services: [] }] },
    { categories: [{ id: "a", label: "A" }, { id: "a", label: "B" }] },
    { categories: [{ id: "Bad id", label: "A" }] },
    { categories: [{ id: "a", label: "A", services: [{ id: "s", name: "S", storage: [{ name: "x", type: "indexeddb" }] }] }] },
  ];
  for (const config of invalid) assert.throws(() => shownCategories(config), TypeError);
});

test("text and labels follow the locale with English fallback", () => {
  assert.equal(localize({ en: "Statistics", de: "Statistiken" }, "de"), "Statistiken");
  assert.equal(localize({ en: "Statistics", de: "Statistiken" }, "de-AT"), "Statistiken");
  assert.equal(localize({ en: "Statistics" }, "fr"), "Statistics");
  assert.equal(localize("Matomo", "de"), "Matomo");
  const de = consentLabels("de");
  assert.equal(de.title, "Einwilligung verwalten");
  assert.equal(de.acceptAll, "Alle akzeptieren");
  assert.equal(de.decline, "Ablehnen");
  assert.equal(de.save, "Auswahl speichern");
  assert.equal(de.settings, "Cookie-Einstellungen");
  assert.equal(consentLabels("fr").title, "Manage consent");
  assert.equal(consentLabels("de", { title: "Datenschutz", types: { pixel: "Zählpixel" } }).types.pixel, "Zählpixel");
});

test("runtime JSON cannot close its script element", () => {
  const json = scriptJson({ name: "</script><b>&" });
  assert.ok(!json.includes("<") && !json.includes(">") && !json.includes("&"));
  assert.deepEqual(JSON.parse(json), { name: "</script><b>&" });
});

test("the demo page renders the card outside main with equal answers", async () => {
  const page = await readFile(
    new URL("../apps/demo/dist/preview/blocks/consent/index.html", import.meta.url),
    "utf8",
  );
  const card = page.match(/<aside[^>]*id="consent"[^>]*>/u)?.[0] ?? "";
  for (const attribute of ['role="dialog"', 'aria-modal="false"', "data-consent", "hidden"]) {
    assert.ok(card.includes(attribute), attribute);
  }
  const main = page.slice(page.indexOf("<main"), page.indexOf("</main>"));
  assert.ok(!main.includes('id="consent"'), "the card sits in the overlay slot, outside main");
  const switches = [...page.matchAll(/<input[^>]*role="switch"[^>]*>/gu)].map(([tag]) => tag);
  assert.equal(switches.length, 3);
  assert.match(switches[0], /checked/u);
  assert.match(switches[0], /disabled/u);
  for (const tag of switches.slice(1)) assert.doesNotMatch(tag, /checked|disabled/u);
  const answers = [...page.matchAll(/<button id="consent-(accept|decline|save)" class="([^"]+)"/gu)];
  assert.deepEqual(answers.map((match) => match[1]), ["accept", "decline", "save"]);
  assert.equal(new Set(answers.map((match) => match[2])).size, 1);
  assert.match(page, /data-consent-open="consent"[^>]*aria-haspopup="dialog"|aria-haspopup="dialog"[^>]*data-consent-open="consent"/u);
  assert.match(page, /data-consent-placeholder="external_media"/u);
  assert.equal([...page.matchAll(/data-consent-policy="/gu)].length, 3);
});
