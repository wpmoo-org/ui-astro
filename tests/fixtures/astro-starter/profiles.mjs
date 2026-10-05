import assert from "node:assert/strict";
import { readFile, rename, rm, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function configureStarterProfile(
  sitePath,
  { mainLanguage, categoryProfile },
) {
  assert.ok(
    ["en", "de"].includes(mainLanguage),
    "supported main language required",
  );
  const prefixes = {
    category: { en: "/category", de: "/kategorie" },
    short: { en: "/c", de: "/k" },
    root: { en: "/", de: "/" },
  };
  assert.ok(
    Object.hasOwn(prefixes, categoryProfile),
    "supported category profile required",
  );
  const config = join(sitePath, "src/config.js");
  const original = await readFile(config, "utf8");
  assert.ok(
    original.includes('export const mainLanguage = "en";'),
    "portable main language input differs",
  );
  await writeFile(
    config,
    original
      .replace(
        'export const mainLanguage = "en";',
        `export const mainLanguage = "${mainLanguage}";`,
      )
      .replace(
        'export const categoryPrefixes = { en: "/category", de: "/kategorie" };',
        `export const categoryPrefixes = ${JSON.stringify(prefixes[categoryProfile])};`,
      ),
  );
  if (categoryProfile !== "category") {
    for (const tree of ["en", "de"])
      for (const locale of ["en", "de"]) {
        const parent = join(
          sitePath,
          "routes",
          tree,
          "pages",
          locale === tree ? "" : locale,
        );
        const old = join(
          parent,
          locale === "en" ? "category" : "kategorie",
          "[slug].astro",
        );
        if (categoryProfile === "root") await rm(old);
        else {
          const next = join(
            parent,
            locale === "en" ? "c" : "k",
            "[slug].astro",
          );
          await mkdir(dirname(next), { recursive: true });
          await rename(old, next);
        }
      }
  }
}
