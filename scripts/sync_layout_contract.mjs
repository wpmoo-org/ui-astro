import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative } from "node:path";

const SCRIPT_ROOT = dirname(fileURLToPath(import.meta.url));
const ASTRO_ROOT = resolve(SCRIPT_ROOT, "..");
const SNAPSHOT_PATH = join(ASTRO_ROOT, "contracts", "layout-surface.snapshot.json");
const SOURCE_FILES = [
  "src/registry/layouts.json",
  "src/layouts/app.html.jinja",
  "src/layouts/page.html.jinja",
];

const REQUIRED_REGISTRY_FIELDS = [
  "slug",
  "label",
  "status",
  "description",
  "source",
  "parts",
  "layoutParts",
];

function argumentValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
}

function extractArray(source, name) {
  const match = source.match(
    new RegExp(`\\{% set ${name} = \\[([^]*?)\\] \\%\\}`),
  );
  if (!match) {
    throw new Error(`Missing ${name} registry in HTML layout source`);
  }
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

function extractObject(source, name) {
  const match = source.match(
    new RegExp(`\\{% set ${name} = \\{([^]*?)\\} \\%\\}`),
  );
  if (!match) {
    throw new Error(`Missing ${name} registry in HTML layout source`);
  }
  return Object.fromEntries(
    [...match[1].matchAll(/"([^"]+)"\s*:\s*"([^"]+)"/g)].map((entry) => [
      entry[1],
      entry[2],
    ]),
  );
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readSourceFile(htmlRoot, relativePath) {
  const path = join(htmlRoot, relativePath);
  return {
    path,
    bytes: await readFile(path),
    source: await readFile(path, "utf8"),
  };
}

function currentCommit(htmlRoot) {
  try {
    return execFileSync("git", ["-C", htmlRoot, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    throw new Error(
      `Cannot resolve the HTML source commit at ${htmlRoot}: ${error.message}`,
    );
  }
}

function validateRegistry(registry) {
  if (!Array.isArray(registry) || registry.length !== 2) {
    throw new Error("HTML layout registry must contain exactly app and page");
  }
  const slugs = registry.map((entry) => entry.slug);
  if (JSON.stringify(slugs) !== JSON.stringify(["app", "page"])) {
    throw new Error(`Unexpected HTML layout registry order: ${slugs.join(", ")}`);
  }
  for (const entry of registry) {
    const fields = Object.keys(entry).sort();
    const expected = [...REQUIRED_REGISTRY_FIELDS].sort();
    if (JSON.stringify(fields) !== JSON.stringify(expected)) {
      throw new Error(`Unexpected fields for HTML layout ${entry.slug}`);
    }
  }
}

export async function buildSnapshot(htmlRoot) {
  const root = resolve(htmlRoot);
  const files = await Promise.all(
    SOURCE_FILES.map((relativePath) => readSourceFile(root, relativePath)),
  );
  const registryFile = files[0];
  const appFile = files[1];
  const pageFile = files[2];
  const registry = JSON.parse(registryFile.source);
  validateRegistry(registry);

  const packageMetadata = JSON.parse(
    await readFile(join(root, "package.json"), "utf8"),
  );
  const appSource = appFile.source;
  const pageSource = pageFile.source;
  if (!/<main\b[^>]*>\s*<div\b[^>]*data-page-container/.test(pageSource)) {
    throw new Error("HTML Page main rail must expose data-page-container");
  }

  return {
    schema_version: 1,
    upstream: {
      package: "@wpmoo/ui",
      version: packageMetadata.version,
    },
    source: {
      repository: "projects/ui/html",
      commit: currentCommit(root),
      files: Object.fromEntries(
        files.map((file, index) => [SOURCE_FILES[index], sha256(file.bytes)]),
      ),
    },
    registry,
    layout_surface: {
      app: {
        navigation: extractArray(appSource, "app_navigation_values"),
        shell_mode: extractArray(appSource, "app_shell_modes"),
        side: extractArray(appSource, "app_sidebar_sides"),
        variant: extractArray(appSource, "app_sidebar_variants"),
        collapsible: extractArray(appSource, "app_sidebar_collapsible"),
        root: {
          class: "wrapper",
          data_layout: "app",
          data_shell_mode: "viewport|contained",
        },
        direct_children: ["sidebar", "page"],
        named_slots: ["sidebar", "page"],
      },
      page: {
        width: extractObject(pageSource, "page_container_classes"),
        regions: ["header", "main", "footer"],
        root: { data_slot: "page" },
        main: {
          id: "main-content",
          tabindex: "-1",
          class: ["scroll-fade-y", "no-scrollbar"],
          rail_attribute: "data-page-container",
        },
      },
    },
  };
}

export function serializeSnapshot(snapshot) {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args.includes("--write") ? "write" : args.includes("--check") ? "check" : "";
  if (!mode) {
    throw new Error("Usage: node scripts/sync_layout_contract.mjs --check|--write [--html-root PATH]");
  }
  const htmlRoot = argumentValue(args, "--html-root", join(ASTRO_ROOT, "../html"));
  const expected = serializeSnapshot(await buildSnapshot(htmlRoot));

  if (mode === "write") {
    await mkdir(dirname(SNAPSHOT_PATH), { recursive: true });
    await writeFile(SNAPSHOT_PATH, expected, "utf8");
    console.log(`Wrote ${relative(ASTRO_ROOT, SNAPSHOT_PATH)}`);
    return;
  }

  const actual = await readFile(SNAPSHOT_PATH, "utf8").catch(() => "");
  if (actual !== expected) {
    throw new Error(
      "Layout contract snapshot is stale. Run sync_layout_contract.mjs --write after reviewing the HTML layout change.",
    );
  }
  console.log("Moo UI Astro layout contract: OK");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`Layout contract: ${error.message}`);
    process.exitCode = 1;
  });
}
