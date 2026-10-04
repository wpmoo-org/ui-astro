import { normalizeSlug } from "../config/index.js";

const canonical =
  /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$/u;
const reserved = new Set([
  "404",
  "_astro",
  "_server_islands",
  "_actions",
  "__moo_content_integrity",
]);

export function archiveBasePath(value, field) {
  const path =
    typeof value === "string" && value !== "/"
      ? value.replace(/\/$/u, "")
      : value;
  if (
    typeof path !== "string" ||
    !canonical.test(path) ||
    reserved.has(path.split("/")[1])
  )
    throw new TypeError(
      `${field} must be a canonical literal archive path: ${String(value)}`,
    );
  return path;
}

export function taxonomyMount(value = "/topics") {
  const field = "moo.taxonomyBasePath";
  const path = archiveBasePath(value, field);
  if (path === "/")
    throw new TypeError(`${field} must be a canonical nonroot namespace`);
  return path;
}

export function resolveTaxonomyArchive(
  taxonomy,
  { lang, taxonomyBasePath = "/topics" },
) {
  const explicit =
    taxonomy.locales?.[lang]?.basePath ?? taxonomy.archive?.basePath;
  if (explicit !== undefined) {
    const root = explicit === "/";
    return {
      basePath: explicit,
      pattern: root ? "/[...slug]" : `${explicit}/[slug]`,
      root,
    };
  }
  const mount = taxonomyMount(taxonomyBasePath);
  const taxonomySegment = taxonomy.locales?.[lang]?.slug ?? taxonomy.id;
  return {
    basePath: `${mount}/${taxonomySegment}`,
    pattern: `${mount}/[taxonomy]/[slug]`,
    taxonomySegment,
    root: false,
  };
}

export function taxonomyTermPath(taxonomy, term, options) {
  const { basePath } = resolveTaxonomyArchive(taxonomy, options);
  const slug = term.locales?.[options.lang]?.slug ?? term.slug;
  return `${basePath === "/" ? "" : basePath}/${normalizeSlug(slug, { lang: options.lang })}`;
}

export function taxonomyNamespaces(context, lang) {
  return [
    ...new Set(
      context.taxonomies
        .filter((taxonomy) => taxonomy.archive)
        .flatMap((taxonomy) => {
          const archive = resolveTaxonomyArchive(taxonomy, {
            lang,
            taxonomyBasePath: context.taxonomyBasePath,
          });
          return archive.root
            ? []
            : [
                archive.taxonomySegment === undefined
                  ? archive.basePath
                  : taxonomyMount(context.taxonomyBasePath),
              ];
        }),
    ),
  ];
}
