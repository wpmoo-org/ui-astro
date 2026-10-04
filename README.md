# Moo UI Astro

The `@wpmoo/astro` SDK adapts published Moo UI contracts to Astro. This repository
also contains its development demo and independent archive consumers.

## Repository

| Path                   | Purpose                                                      |
| ---------------------- | ------------------------------------------------------------ |
| `packages/astro`       | SDK source, public exports and npm archive selection         |
| `packages/theme-pilot` | Private reference presentation theme                         |
| `apps/demo`            | Local development site and authored demo content             |
| `apps/consumer`        | Independent consumer template using a real `.tgz`            |
| `apps/theme-pilot`     | Independent multilingual theme site using versioned archives |
| `scripts` / `tests`    | Shared verification tools and test fixtures                  |
| `docs/guide.md`        | Detailed integration guide                                   |

## Develop

Use Node.js `>=22.12.0`. Install from the repository root:

```sh
npm ci
npm run dev
npm test
npm run check
npm run build
```

The demo opens on `http://localhost:4322`. Root commands forward additional
arguments to the demo. Shared EditorConfig and TypeScript settings live here.

## Package

```sh
npm run pack:astro
```

The SDK archive contains its explicit public source and required private files.
Apps and repository tooling are excluded. The root and demo are private npm
workspaces. `apps/consumer` is deliberately outside workspace membership: the
certification runner copies it into an isolated directory and installs the
archive with its own lock.

The [theme pilot](apps/theme-pilot/README.md) is also independent of workspaces.
Its sealed `npm run verify:theme-pilot` proof checks six locale/URL profiles
and rehearses a theme update and exact rollback. It requires an absolute primed
cache, an empty output outside the checkout and an existing immutable Node
image (`--cache`, `--output`, `--image`). Archives stay versioned under ignored
`artifacts/theme-pilot/`; authored site files remain unchanged during updates.

For package usage, see [the SDK README](packages/astro/README.md),
[compatibility](packages/astro/COMPATIBILITY.md) and
[the integration guide](docs/guide.md). Publication remains separately gated.
