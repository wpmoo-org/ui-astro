import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { configureStarterProfile, migrateStarterBreadcrumbs } from "./fixtures/astro-starter/profiles.mjs";
import { starterRoutes } from "../scripts/astro_starter_contracts.mjs";

test("content breadcrumb proof migration moves only the recognized localized preference", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "astro-starter-breadcrumb-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, "src"));
  const path = join(directory, "src/definitions.js");
  const original = `export const parts = {
            header: {
              toggleLabel: copy.toggle,
              navigationLabel: copy.navigation,
              breadcrumbLabel: copy.breadcrumb,
              skipLabel: copy.skip,
            },
            loop: { emptyText: copy.empty },
};\n`;
  await writeFile(path, original);
  await migrateStarterBreadcrumbs(directory);
  assert.equal(await readFile(path, "utf8"), original
    .replace("              breadcrumbLabel: copy.breadcrumb,\n", "")
    .replace("            loop:", "            pageHeader: { breadcrumbLabel: copy.breadcrumb },\n            loop:"));
  const migrated = await readFile(path, "utf8");
  await assert.rejects(migrateStarterBreadcrumbs(directory), /one recognized legacy/);
  assert.equal(await readFile(path, "utf8"), migrated);
});

for (const locale of ["en", "de"]) {
  for (const invalidBlock of ["missing", "missing-link"]) {
    test(`German-main proof rejects ${invalidBlock} in the ${locale} information block`, async (t) => {
      const directory = await mkdtemp(join(tmpdir(), "astro-starter-profile-"));
      t.after(() => rm(directory, { recursive: true, force: true }));
      await mkdir(join(directory, "src"));
      await writeFile(
        join(directory, "src/config.js"),
        'export const mainLanguage = "en";\nexport const categoryPrefixes = { en: "/category", de: "/kategorie" };\n',
      );
      await writeFile(
        join(directory, "src/preferences.js"),
        "export const projectDefaults = {};\n",
      );
      for (const [language, href] of [
        ["en", "/contact"],
        ["de", "/de/kontakt"],
      ]) {
        if (language === locale && invalidBlock === "missing") continue;
        const parent = join(directory, "src/content/block", language);
        await mkdir(parent, { recursive: true });
        await writeFile(
          join(parent, "page-information.md"),
          language === locale && invalidBlock === "missing-link"
            ? "Contact details without the required link.\n"
            : `[Contact](${href})\n`,
        );
      }
      await assert.rejects(
        configureStarterProfile(directory, {
          mainLanguage: "de",
          categoryProfile: "category",
        }),
        invalidBlock === "missing"
          ? (error) =>
              error.code === "ENOENT" &&
              error.path ===
                join(directory, "src/content/block", locale, "page-information.md")
          : new RegExp(`expected contact link .* in ${locale} page-information\\.md`),
      );
    });
  }
}

test("starter proof includes both placement guides in every locale profile", () => {
  for (const mainLanguage of ["en", "de"])
    for (const categoryProfile of ["category", "short", "root"]) {
      const routes = starterRoutes({ mainLanguage, categoryProfile });
      assert.equal(Object.keys(routes).length, 38);
      for (const [locale, slug] of [
        ["en", "placement-guide"],
        ["de", "platzierungen"],
      ]) {
        const href = `/${locale === mainLanguage ? "" : `${locale}/`}${slug}`;
        assert.deepEqual(routes[`${href.slice(1)}/index.html`], {
          key: "guide",
          locale,
          href,
        });
      }
    }
});

for (const defaults of [
  { theme: "dark", sidebar: {} },
  {
    theme: "dark",
    sidebar: { mode: "drawer" },
    aside: { side: "right", columns: 3 },
    parts: {
      content: { utilities: ["py-4"], attributes: { "data-host": "content" } },
      header: { utilities: ["px-3"] },
    },
  },
]) {
  test(`starter proof adapts ${defaults.sidebar.mode ?? "default"} preferences without losing other settings`, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "astro-starter-profile-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    await mkdir(join(directory, "src"));
    await writeFile(
      join(directory, "src/config.js"),
      'export const mainLanguage = "en";\nexport const categoryPrefixes = { en: "/category", de: "/kategorie" };\n',
    );
    const preferences = join(directory, "src/preferences.js");
    await writeFile(
      preferences,
      `export const projectDefaults = ${JSON.stringify(defaults, null, 2)};\n`,
    );
    for (const [locale, href] of [
      ["en", "/contact"],
      ["de", "/de/kontakt"],
    ]) {
      const directoryName = join(directory, "src/content/block", locale);
      await mkdir(directoryName, { recursive: true });
      await writeFile(
        join(directoryName, "page-information.md"),
        `[Contact](${href})\n`,
      );
    }
    await configureStarterProfile(directory, {
      mainLanguage: "de",
      categoryProfile: "short",
    });
    const importSource = async (path) =>
      import(
        `data:text/javascript;base64,${Buffer.from(await readFile(path)).toString("base64")}`
      );
    const actual = (await importSource(preferences)).projectDefaults;
    assert.deepEqual(actual, {
      ...defaults,
      sidebar: {},
      parts: {
        ...defaults.parts,
        content: { ...defaults.parts?.content, utilities: ["py-2"] },
      },
    });
    const config = await importSource(join(directory, "src/config.js"));
    assert.equal(config.mainLanguage, "de");
    assert.deepEqual(config.categoryPrefixes, { en: "/c", de: "/k" });
    for (const [locale, href] of [
      ["en", "/en/contact"],
      ["de", "/kontakt"],
    ])
      assert.equal(
        await readFile(
          join(directory, "src/content/block", locale, "page-information.md"),
          "utf8",
        ),
        `[Contact](${href})\n`,
      );
  });
}
