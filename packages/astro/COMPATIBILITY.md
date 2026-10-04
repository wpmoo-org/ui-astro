# Compatibility and local certification

`@wpmoo/astro` 0.1.0 is an unpublished MIT package. Its public integration,
component, content and theme contracts are validated against exact dependency
versions. A broader Astro peer range requires new certification and migration
evidence before it is advertised.

## Version contract

| Dependency or contract   | Version     | Ownership                                                                     |
| ------------------------ | ----------- | ----------------------------------------------------------------------------- |
| Astro                    | 7.3.3       | One exact host peer; also the local development dependency                    |
| Moo UI                   | 1.0.0-rc.10 | Published dependency; immutable registry URL, integrity and file hashes       |
| Bootstrap                | 5.3.8       | Exact runtime dependency                                                      |
| Plugin API               | 1           | Built-in and separately packaged descriptors                                  |
| Node                     | >=22.12.0   | Declared engine minimum; exact 22.12.0 and current-runtime consumers verified |
| Astro checker            | 0.9.10      | Consumer verification tooling                                                 |
| TypeScript               | 6.0.3       | Consumer verification tooling                                                 |
| Official MDX integration | 8.0.2       | Explicit optional host integration, tested with Astro 7.3.3                   |

MD-only consumers do not install MDX. All certification profiles are independent
of React, CMS, authentication and database dependencies. An editor adapter and
a site's publication workflow have their own compatibility contracts.

The static profile uses native Astro collections, prerendered routes and local
declared sources. Active multilingual routing is an explicit native Astro
configuration, not a database or CMS. SSR/admin/editor runtime, remote loaders,
automatic locale fallbacks and other Astro/MDX combinations require separate
certification. Plugin `apiVersion: 1` versions descriptors; it does not version
frontmatter, Layout options, storage or the Astro peer contract.

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

The preceding RC9 candidate ran all ten on Linux ARM64 Node 22.23.2 and
26.8.1, using immutable identities of existing local images. Its parent proof
checked archives, source paths, installed bytes, namespaces, type-check logs
and output. Its mutation suite rejected corrupted evidence with the child
success unchanged; its browser checks covered 48 desktop/narrow,
light/dark and LTR/RTL states, including Sidebar keyboard and ARIA behavior.
Those retained results remain historical and do not certify changed RC10 bytes.
The 2026-10-03 RC10 local certification covers all ten profiles on these exact
Linux ARM64 runtimes:

| Node    | npm     | Profiles |
| ------- | ------- | -------- |
| 22.12.0 | 10.9.0  | 10/10    |
| 22.23.2 | 10.9.8  | 10/10    |
| 26.8.1  | 11.19.0 | 10/10    |

Each runtime has independent parent validation. The 46 parent contract and
mutation tests reject corrupted evidence without relying on child success.
Image identities, archive hashes and actual execution records are retained in
the parent handoff, outside the npm archive.

Each retained proof identifies its own artifact and runtime. Final packed
documentation changes require repeating that proof against the final archive;
a historical successful output is not reused for different package bytes.

## Local evidence and capability limits

Packed browser inspection covers 24 selected routes across all ten profiles
at desktop and narrow widths: 48 light/dark LTR states, nine mobile Sidebar
keyboard/modal/focus-return checks, and two host section Action navigations.
A representative theme profile adds 16 dark RTL states and five modal checks;
this is not full RTL coverage of every consumer. Output equivalence binds the
retained observations to the final consumer builds. Live inspection also
covers Chart initialization and the corrected contained mobile Sidebar.

The maintainer accepted the Page with sections and taxonomy foundation layouts
on 2026-10-03. All 40 positive acceptance tests pass without skips, including
shared Layout spacing, section identity/order, mixed canonical links and
responsive Sidebar behavior. Acceptance certifies these foundation contracts;
finished theme styling and an in-browser editor are separate products.

The controller leaves certification flags pending for external parent,
browser and minimum-runtime readers; it cannot approve itself. Their actual
results and the scoped source/handoff commits are recorded separately. Local
certification does not authorize publication or broaden the supported host,
editor or runtime profiles.

RC10 removes the historical contained mobile Sidebar flow override.
Remaining capability gaps include configurable Core runtime labels, a public
Icon renderer for arbitrary glyph/Avatar/Toast parity, and full structured
Sidebar account/workspace dropdown, item-action and subtitle anatomy for the
catalog Blocks. Supported floating/inset shells compose through existing
Layout props; there is no dedicated Astro Block export or full Block-parity
claim. These gaps require their own contract/release decision. PageHeader also
cannot replace Typography's fixed
weight/color styles: incompatible utility overrides fail explicitly.
Development sync bytes retain separate provenance.

For active content in development, the integration defaults Vite's native
`awaitWriteFinish` watcher setting to 100ms stability and 20ms polling. This
prevents save/format bursts inside the native 50ms change throttle from leaving
stale collection data. Explicit host settings, including `false` and
`watch: null`, remain authoritative. Source integrity validation stays fatal;
no replacement loader, private store mutation or request retry is introduced.

## Release intake and upgrade procedure

The maintainer approved the 2026-10-03 RC10 intake. It replaces the exact Core
pin only; Astro, Bootstrap, checker, TypeScript and optional MDX pins remain
unchanged. The verified registry
archive and 25 public export hashes are in `contracts/rc10-package.json`.
Registry metadata has no `gitHead`, so that field is null rather than inferred.
Historical RC9 records remain immutable in the source repository and prior
evidence. The active npm archive includes the RC10 record.

RC10 replaces the synchronous aggregate `Chart` export with
`await MooUI.loadChart()` or `await loadChart()`. The dedicated Core Chart
subpath remains available; repeat loads share its constructor. `initSheets()`
is explicit and returns a host-owned disposer. Bootstrap remains `5.3.8` and
the certified Astro host remains `7.3.3`. A version change alone does not
certify compatibility or authorize publication.

For later package, theme or plugin upgrades, the maintainer owns the intake:

1. Review official releases, migration notes and security advisories during
   active development and before an upgrade. Record review date, owner, target
   and the update/hold decision. Separate required security/compatibility work
   from optional feature adoption; do not activate features through a host bump.
2. Retain the previous dependency/doc snapshots, archive, lockfiles, authored
   fixtures and proof. Add a version-keyed official documentation snapshot and
   inspect the candidate's installed public APIs. A development checkout or
   unpinned latest documentation does not replace published provenance.
3. Propose exact host, Core, Bootstrap, tooling and optional integration pairs,
   with their peer closure. Obtain dependency approval, then update each tested
   package/consumer lockfile. Do not broaden peers or infer a missing registry
   commit. A new Core pin gets its own immutable release record.
4. Assess schemas, descriptor/API shape, queries/rendering, source IDs, term
   identity, hierarchy, references, slug normalization, canonical site locale,
   namespace/base/trailing slash and native route ownership. Record before/after
   URLs and explicit redirects if already published paths change. Also assess
   editable storage, field/section capabilities, parser/compiler behavior and
   stale/fatal validation; no automatic file or database migration is implied.
5. Run retained old content/configuration unchanged against the candidate,
   every advertised Astro/MDX pair and the declared Node floor plus current
   runtimes. Run the full ten offline consumers, independent parent checks and
   useful invalid-source/reference/graph/URL companions. Type-check real theme
   and external-plugin code, including exhaustive handling of public enums.
6. Inspect browser behavior and obtain acceptance for visible changes before
   adding positive regressions. Update the certified table and migration notes
   only for the exact final packed bytes. Retain archive hashes, runtime/image
   identities and command/browser records outside the archive in the handoff.
7. Themes, starters and plugins update their tested dependencies and committed
   locks independently, satisfy prerequisites, explicitly adopt new settings,
   then check/build/accept their own site before deployment. Releasing the
   foundation performs none of those application actions automatically.

## Layout and theme extension policy

Each proposed field/value must identify its published Moo, registered
Bootstrap or documented Astro counterpart and its behavior when omitted.
Record the supported package/host/Core versions, schema, public type,
five-layer resolver and rendering mapping changes, then classify compatibility.
An arbitrary CSS string, second controller or unrelated dependency is not a
configuration extension.

The initial unpublished `parts` contract adds shared normalized preferences
and changes outer content spacing from zero to Bootstrap `py-4`, applied once
by Layout. Arrays replace rather than append; `[]` clears configurable defaults.
Sidebar defaults to disabled; an omitted field inherits its existing default.
MD/MDX/JSON metadata renamed `layout` to `options` to avoid the official MDX
layout import. These are recorded unpublished changes, not compatibility claims
for an earlier released layout contract. Public Layout/schema/resolver names
remain unchanged; there is no extra frontmatter version flag.

Later extensions preserve the previous released fixtures and replay them
unchanged. Test the actual new option, omission/inheritance and old-package
unsupported-field/value diagnostics. Check real callers' exhaustive enum
handling and all advertised runtime/host combinations. Browser acceptance and
positive regression gates apply to changed presentation and interaction.

## Content and editor compatibility

Exact relative `.md`/`.mdx` source IDs, JSON IDs and term IDs are separate from
slugs, labels and display language. Route identity follows canonical source/
site-locale rules. A display-locale override only changes copy/date formatting.
Source kind/base, filename rules, graph membership and stable locale translation
keys are compatibility contracts, even when the generated page looks unchanged.

Root JSON arrays and flat JSON directories have explicit native loaders and
source declarations. A migration preflight compares all IDs, references,
parents and canonical URLs before changing the authority. An incompatible ID
blocks conversion; it is not silently rewritten. Editor capabilities are
equally explicit: ordered `{id,type,props}` section data has a finite host
schema/renderer, while pure editor metadata remains separate from Astro imports.

The current `content-editing` fixture is CMS-free storage and rendering evidence.
It certifies neither a selected CMS nor panel round trips. An editor adapter
must prove no-op preservation, stable file keys, section operations, revision
conflicts, invalid-content repair and partial-failure recovery through its real
public field extensions. Its first preview is a saved published revision from
a fresh successful Astro build. Draft/unsaved preview, media and an online admin
runtime require separate review. Removing the editor's config/dependencies must
leave the authored files, IDs, URLs and ordinary build unchanged. MDX/native
code is read-only to a content-only editor unless separately certified.

## Versioning and rollout

Compatible additive capabilities are feature changes; compatible corrections
are patches. Renamed/removed fields or values, changed defaults or meaning,
incompatible public types, schema rejection, storage identity or URL/output
changes require a breaking decision and migration. Before `1.0.0`, record exact
before/after versions and the breaking pre-1.0 release decision; an incompatible
change must never be presented as a patch.

The candidate remains `private: true`. Certification, visible acceptance,
scoped source/handoff commits and the publication decision are distinct gates.
This runbook publishes no package, rewrites no authored content and installs no
CMS. A later release records its final artifact and successful commands without
claiming the unfinished broader host/editor matrix.
