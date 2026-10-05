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

## License

[MIT](LICENSE). Dependencies retain their own licenses:
[Moo UI Astro](https://github.com/wpmoo-org/ui-astro/blob/main/packages/astro/LICENSE)
and [Astro 7.3.3](https://github.com/withastro/astro/blob/astro%407.3.3/LICENSE).
The aggregate third-party notice file stays outside npm.
