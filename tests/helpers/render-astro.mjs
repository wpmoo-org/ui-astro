// Renders Astro components inside a development Vite runner, the same way
// tests/mdx-development-graph.mjs loads the development graph. Needs the
// guest's native bindings (Vite 8 / rolldown); it cannot start on the host.
import { mkdtemp, rm, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repository = fileURLToPath(new URL("../../", import.meta.url));

// root is the SDK tree to render (the repository by default). The Vite root
// must contain packages/astro, or Astro cannot resolve the hoisted script
// modules of Layout; the temporary directory only holds the Vite cache.
export async function createRenderer(root = repository, { stubIntegration = false } = {}) {
  const fixture = await realpath(await mkdtemp(join(tmpdir(), "astro-render-")));
  let server;
  try {
    return await start(root, fixture, stubIntegration, (created) => { server = created; });
  } catch (error) {
    await server?.close();
    await rm(fixture, { recursive: true, force: true });
    throw error;
  }
}

// Stands in for the integration's placements module so SiteLayout can load
// without a configured site; only code before the layout's own guards runs.
const placementsStub = {
  name: "render-astro-placements-stub",
  resolveId: (id) => (id === "virtual:wpmoo-astro/placements" ? "\0placements-stub" : null),
  load: (id) => id === "\0placements-stub"
    ? "export default {}; export const factories = {}, collections = {}; export const getAssignedTerms = () => [], getKnownTerms = () => [], getChrome = () => ({});"
    : null,
};

async function start(root, fixture, stubIntegration, remember) {
  const require = createRequire(join(repository, "package.json"));
  const astroRoot = dirname(require.resolve("astro/package.json"));
  const load = (path) => import(pathToFileURL(join(astroRoot, "dist", path)));
  const { resolveConfig } = await load("core/config/config.js");
  const { createSettings } = await load("core/config/settings.js");
  const { AstroLogger } = await load("core/logger/core.js");
  const { runHookConfigSetup, runHookConfigDone } = await load("integrations/hooks.js");
  const { createRoutesList } = await load("core/routing/create-manifest.js");
  const { createVite } = await load("core/create-vite.js");
  const { devServerAppReadySymbol } = await load("core/constants.js");
  const { createServer } = await import(
    pathToFileURL(createRequire(join(astroRoot, "package.json")).resolve("vite"))
  );
  const { experimental_AstroContainer: AstroContainer } = await import(
    pathToFileURL(join(astroRoot, "dist", "container", "index.js"))
  );
  const logger = new AstroLogger({ level: "error", destination: { write() {} } });
  const transport = { middlewareMode: true, hmr: false, watch: null, ws: false };
  const { astroConfig } = await resolveConfig(
    { root, vite: { cacheDir: join(fixture, ".vite"), server: transport, optimizeDeps: { noDiscovery: true } } },
    "dev",
  );
  let settings = await createSettings(astroConfig, "error", root);
  settings = await runHookConfigSetup({ settings, command: "dev", logger });
  await runHookConfigDone({ settings, command: "dev", logger });
  const routesList = await createRoutesList({ settings }, logger, { dev: true });
  const config = await createVite(
    { server: transport, plugins: stubIntegration ? [placementsStub] : [] },
    { settings, logger, mode: "development", command: "dev", sync: false, routesList },
  );
  const server = await createServer(config);
  remember(server);
  await server[devServerAppReadySymbol];
  const runner = server.environments.ssr.runner;
  const container = await AstroContainer.create();
  return {
    // path is relative to packages/astro/src
    async render(path, options = {}) {
      const module = await runner.import(join(root, "packages/astro/src", path));
      return container.renderToString(module.default, options);
    },
    async close() {
      await server.close();
      await rm(fixture, { recursive: true, force: true });
    },
  };
}
