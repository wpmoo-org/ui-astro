# Independent theme pilot

This private site owns English/German content, navigation, term data and URL
choices. It is excluded from root workspaces and installs versioned SDK/theme
archives under `../../artifacts/theme-starter/`, with its own strict config/lock.

After preparing those archives, run `npm ci --offline --strict-peer-deps`,
`npm run check` and `npm run build` from this directory. `PILOT_MAIN_LANGUAGE`
selects `en` or `de`; `PILOT_CATEGORY_PROFILE` selects `category`, `short` or
`root`. The main language has no URL prefix. The native route tree follows
that setting; shared source stays under `src/`.

The Page adapter prepares locale-aware links on the server and passes them to
MDX as `props.links`. MDX sections receive ready-to-render data; they do not
import server query facades into Astro's propagated asset graph.

Taxonomy fixtures intentionally have different memberships in both languages:

| Content          | Category     | Tag            | Sector                  |
| ---------------- | ------------ | -------------- | ----------------------- |
| Welcome, Contact | —            | —              | —                       |
| About us         | Company      | —              | Foundation              |
| Services         | Company      | Astro          | Development             |
| Enhanced page    | Guides       | Astro, MDX     | Development             |
| Announcement     | News         | Release        | Foundation              |
| Project update   | Guides, News | Astro, Release | Foundation, Development |

The German terms use localized names/slugs with the same stable IDs. Each
archive has a different subset within its taxonomy; content can overlap and
its canonical URL stays independent of those assignments.

The sidebar gives each active taxonomy its own submenu. Page/Post adapters
prepare localized term links from public taxonomy paths, reuse those groups
for navigation, and show the entry's assigned terms within its content slot.
The term metadata is semantic content; no new SDK/theme API or CSS is added.

Site preferences replace the theme's inset via `projectDefaults`. Update a
versioned archive dependency and its lock to replace theme presentation;
content and route files stay in this project. No live deployment, CMS or
commercial updater is included. Sealed evidence and runtime/visual gates
are recorded separately in the dated pilot certification.
