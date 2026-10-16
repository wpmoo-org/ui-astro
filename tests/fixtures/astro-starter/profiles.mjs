import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

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
  const preferences = join(sitePath, "src/preferences.js");
  const copy = await readFile(preferences, "utf8");
  assert.ok(copy.includes("  sidebar: {},"), "ordinary Sidebar input differs");
  await writeFile(
    preferences,
    copy.replace(
      "  sidebar: {},",
      '  sidebar: {},\n  parts: { content: { utilities: ["py-2"] } },',
    ),
  );
}
