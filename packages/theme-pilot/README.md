# Reference theme

Private MIT presentation package for `@wpmoo/astro@0.1.0` and Astro `7.3.3`.
The independent [pilot site](../../apps/theme-pilot/README.md) owns content,
routes and locale settings. Resolve `defaultPreferences` through the SDK's
`defineSite` and `resolvePageOptions`, then pass prepared data into `Layout`
and the Page, Post, Archive or NotFound views.

`sections/Action.astro` accepts `label`, `href` and public Button choices as
data, including from MDX. The package owns no collections, routes or runtime.

See the [accepted design](../../../docs/architectures/2026-10-04-astro-theme-consumer-pilot-design.md)
for ownership and update/rollback evidence requirements. No publication is implied.
