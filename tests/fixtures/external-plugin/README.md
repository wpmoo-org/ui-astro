# External content fixture

This private test artifact defines `sample` content at `/sample` using only
the public `@wpmoo/astro` plugin, content, config, context and view contracts.
It is packed separately and is excluded from the main npm archive.

The host owns its JSON records, native loader and any taxonomy references.
`sample({ source, sourceKind, taxonomies })` selects a JSON array file or a
flat JSON directory. The schema and factory are pure configuration imports;
queries and routes require the Astro server context. The three props-only
views preserve the shared Single/Archive/Loop slots and appearance. Private
route files are injected by their package-local URLs and are not exports.

This fixture certifies the selected single-language static profile. It is
not a shipped plugin, theme, editor or CMS integration.
