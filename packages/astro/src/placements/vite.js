import { fileURLToPath } from "node:url";
import { statSync } from "node:fs";

const virtual = "virtual:wpmoo-astro/placements";
const resolved = `\0${virtual}`;
const facade = fileURLToPath(new URL("./index.js", import.meta.url));

export function validatePlacementRegistry(profile) {
  const locales = profile.i18n?.locales ?? [profile.site.defaults.lang];
  const dimensions = {
    types: profile.types,
    locales,
    terms: profile.taxonomies,
  };
  for (const placement of profile.placements) {
    for (const conditions of [placement.include, placement.exclude]) {
      for (const [field, allowed] of Object.entries(dimensions)) {
        const requested =
          field === "terms"
            ? Object.keys(conditions?.terms ?? {})
            : (conditions?.[field] ?? []);
        for (const value of requested) {
          if (!allowed.includes(value))
            throw new TypeError(
              `Placement ${placement.id}.${field} refers to unknown ${value}`,
            );
        }
      }
    }
  }
}

export function placementVitePlugin(getProfile) {
  return {
    name: "wpmoo-astro-placements",
    resolveId(source, importer, options) {
      if (source !== virtual && source !== resolved) return null;
      if (!options?.ssr) throw new Error(`${virtual} is server-only`);
      if (importer?.split("?")[0] !== facade)
        throw new Error(`${virtual} is private to @wpmoo/astro/placements`);
      return resolved;
    },
    load(id, options) {
      if (id !== resolved) return null;
      if (!options?.ssr) throw new Error(`${virtual} is server-only`);
      const profile = getProfile();
      if (!profile)
        throw new Error(
          `${virtual} is unavailable before Astro config resolves`,
        );
      const components = Object.entries(profile.blocks).filter(
        ([, block]) => block.kind === "component",
      );
      for (const [id, block] of components) {
        if (!statSync(block.path, { throwIfNoEntry: false })?.isFile())
          throw new TypeError(
            `Block ${id} component is missing: ${block.path}`,
          );
      }
      const imports = components
        .map(
          ([, block], i) =>
            `import Block${i} from ${JSON.stringify(block.path)};`,
        )
        .join("\n");
      const factories = components
        .map(([id], i) => `${JSON.stringify(id)}: Block${i}`)
        .join(",");
      const needsContent = Object.values(profile.blocks).some(
        (block) => block.kind === "content",
      );
      if (needsContent && !profile.hostContentConfig)
        throw new TypeError(
          "Native content blocks require src/content.config.ts or .js",
        );
      const collections = needsContent
        ? `import { collections } from ${JSON.stringify(profile.hostContentConfig)}; export { collections };`
        : "export const collections = {};";
      const siteContext = profile.active
        ? `export { getAssignedTerms, getKnownTerms, getChrome } from ${JSON.stringify(fileURLToPath(new URL("./site-context.js", import.meta.url)))};`
        : `import { emptySiteChrome } from ${JSON.stringify(fileURLToPath(new URL("./chrome.js", import.meta.url)))}; export async function getAssignedTerms() { return []; } export async function getKnownTerms() { return []; } export function getChrome(input) { return emptySiteChrome(profile, input); }`;
      const { hostContentConfig, ...publicProfile } = profile;
      return `${imports}\n${collections}\n${siteContext}\nexport const factories = {${factories}};\nconst profile = ${JSON.stringify(publicProfile)}; export default profile;`;
    },
  };
}
