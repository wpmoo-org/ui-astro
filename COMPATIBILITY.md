# Compatibility and local certification

`@wpmoo/astro` 0.1.0 is an unpublished MIT package. Its public integration,
component, content and theme contracts are validated against exact dependency
versions. A broader Astro peer range requires new certification and migration
evidence before it is advertised.

## Version contract

| Dependency or contract   | Version    | Ownership                                                                    |
| ------------------------ | ---------- | ---------------------------------------------------------------------------- |
| Astro                    | 7.3.3      | One exact host peer; also the local development dependency                   |
| Moo UI                   | 1.0.0-rc.9 | Published dependency; immutable registry URL, integrity and file hashes      |
| Bootstrap                | 5.3.8      | Exact runtime dependency                                                     |
| Plugin API               | 1          | Built-in and separately packaged descriptors                                 |
| Node                     | >=22.12.0  | Declared engine minimum; exact minimum-runtime certification remains pending |
| Astro checker            | 0.9.10     | Consumer verification tooling                                                |
| TypeScript               | 6.0.3      | Consumer verification tooling                                                |
| Official MDX integration | 8.0.2      | Explicit optional host integration, tested with Astro 7.3.3                  |

MD-only consumers do not install MDX. All certification profiles are independent
of React, CMS, authentication and database dependencies. An editor adapter and
a site's publication workflow have their own compatibility contracts.

## Package boundary

The explicit public export/file ledger is `contracts/astro-public-surface.json`.
It includes the 45 component wrappers, Layout, shared includes/views, pure
configuration/schema factories and server APIs. Private implementation and
injected route files stay closed to deep imports. CSS and browser interaction
come from the published Moo UI and Bootstrap contracts.

The archive contains package source, licenses, documentation and release
provenance. It excludes demo content/configuration, test fixtures, scripts,
installed dependencies and sibling HTML source. A theme supplies its own
configuration, content, routes and section renderers through the public API.

## Consumer profiles

The local controller prepares one main archive and retains its exact bytes,
execution locks, fixture sources, installed package files, command logs and
actual container inspection. Its runner uses network `none`, a prepared proof
mount and a read-only primed npm cache. Packing and cache preparation happen
outside that runner; no workspace checkout or dependency tree is mounted.

The required matrix is:

1. `default`: all public entrypoints, Page routing, runtime and types.
2. `theme`: host routes/slots, shared preferences and entry overrides.
3. `ui-only`: all component wrappers without content integration.
4. `page-only`: Page without Post or MDX.
5. `post-only`: Post with a host-selected namespace, without Page or MDX.
6. `mdx`: native MD/MDX identity, official activation and host Astro sections.
7. `external-plugin`: a separately packed API-1 content plugin.
8. `taxonomy`: shared Page/Post category and tag queries and archives.
9. `external-taxonomy`: mixed built-in/external types and custom taxonomy.
10. `content-editing`: CMS-free Markdown and flat JSON directories, stable
    identity, native references and host-owned finite section data.

The reviewed local candidate ran all ten on Linux ARM64 Node 22.23.2 and
26.8.1, using immutable identities of existing local images. The same main
archive passed both installations. The parent independently checked actual
archives, source paths, installed bytes, compiled namespaces, type-check logs
and output; its mutation suite rejected corrupted evidence with the child
success unchanged. Browser inspection covered 48 desktop/narrow,
light/dark and LTR/RTL states, including Sidebar keyboard and ARIA behavior.

Each retained proof identifies its own artifact and runtime. Final packed
documentation changes require repeating that proof against the final archive;
a historical successful output is not reused for different package bytes.

## Remaining release gates

Exact Node-floor coverage and final browser/acceptance evidence remain required
before release readiness can be claimed. In particular, inspection of the
editable/taxonomy examples is separate from their pending human visual
acceptance. The controller leaves certification flags pending for the external
parent/browser/minimum-runtime gates; it cannot approve itself. A focused
profile run is local evidence, insufficient for release.

Known published Core gaps, including the historical contained mobile Sidebar
behavior and the separately reported Icon/Blocks capabilities, require a Core
contract/release decision. Development sync bytes retain separate provenance.

An upgrade must review official Astro/Core changes, update exact approved pins
and locks, rerun every advertised profile/runtime, verify route/schema/output
and migration effects, and ship a new version. Themes update their dependency
and lock through their own review, build and deployment workflow.

The announced Moo UI RC10 is a separate intake. When its artifact is published,
review its complete public exports, Layout/Sidebar/Page contract, CSS/ESM bytes,
registry integrity and migration effects, then certify a new exact pin through
the matrix and browser workflow. RC9 records remain immutable; development
sync and a version change alone do not certify RC10 compatibility.
