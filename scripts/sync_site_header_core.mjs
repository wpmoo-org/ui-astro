// Regenerates tests/fixtures/site-header-core from Core.
// Usage: node scripts/sync_site_header_core.mjs <core-html-dir> <core-commit>
// The catalog examples come from Core's built previews (site-dist), and are
// checked against a fresh render of the same example macros, so a stale
// site-dist fails. The brand cases are rendered from Core's site_header macro
// with Core's own Jinja environment (<core>/.venv/bin/python). Core must be
// checked out at <core-commit> with a clean tree; nothing is written to Core.
// Fixtures are Core's normalized output with trailing whitespace stripped per
// line (stripLineEnds), so they are not byte-identical to it.
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { brandCases, examples } from "../tests/helpers/site-header-cases.mjs";
import { extractNav, normalizeHtml, stripLineEnds } from "../tests/helpers/site-header-normalize.mjs";

const [core, commit] = process.argv.slice(2);
if (!core || !commit) throw new Error("usage: sync_site_header_core.mjs <core-html-dir> <core-commit>");
const git = (...args) => execFileSync("git", ["-C", core, ...args], { encoding: "utf8" }).trim();
const head = git("rev-parse", "HEAD");
const wanted = git("rev-parse", `${commit}^{commit}`);
if (head !== wanted) throw new Error(`Core HEAD is ${head.slice(0, 7)}, not ${commit}`);
if (git("status", "--porcelain")) throw new Error("Core working tree is not clean");

const snake = (key) => key.replace(/[A-Z]/gu, (c) => `_${c.toLowerCase()}`);
function toCore(value) {
  if (Array.isArray(value)) return value.map(toCore);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k === "class" ? "extra_class" : snake(k), toCore(v)]));
  }
  return value;
}

const python = String.raw`
import json, sys
sys.path.insert(0, ".")
from build import create_environment
env = create_environment()
data = json.load(sys.stdin)
out = {}
page = env.from_string('{% from "blocks/site_header_example.html.jinja" import render_site_header_page %}{{ render_site_header_page(kind, root_path, id) }}')
for name, case in data["examples"].items():
    out[name] = page.render(kind=case["kind"], root_path="../../../", id=case["id"])
macro = env.from_string('{% from "blocks/site_header.html.jinja" import site_header %}{{ site_header(**args) }}')
for name, args in data["cases"].items():
    out[name] = macro.render(args=args)
json.dump(out, sys.stdout)
`;
const input = {
  examples: Object.fromEntries(Object.entries(examples).map(([name, e]) => [name, { kind: e.kind, id: e.props.id }])),
  cases: Object.fromEntries(Object.entries(brandCases).map(([name, props]) => [name, toCore(props)])),
};
const rendered = JSON.parse(execFileSync(join(core, ".venv/bin/python"), ["-c", python], {
  cwd: core, env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" }, input: JSON.stringify(input), encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
}));

const out = fileURLToPath(new URL("../tests/fixtures/site-header-core/", import.meta.url));
await mkdir(out, { recursive: true });
for (const name of Object.keys(examples)) {
  const built = normalizeHtml(extractNav(await readFile(join(core, "site-dist/blocks/previews", name, "index.html"), "utf8")));
  const fresh = normalizeHtml(extractNav(rendered[name]));
  if (built !== fresh) throw new Error(`Core site-dist preview ${name} is stale; rebuild Core at ${commit}`);
  await writeFile(join(out, `${name}.html`), stripLineEnds(built));
}
for (const name of Object.keys(brandCases)) {
  await writeFile(join(out, `${name}.html`), stripLineEnds(normalizeHtml(extractNav(rendered[name]))));
}
const short = head.slice(0, 7);
await writeFile(join(out, "source.json"), `${JSON.stringify({
  core: "projects/ui/html", commit: short, previews: Object.keys(examples), cases: Object.keys(brandCases),
}, null, 2)}\n`);
console.log(`wrote ${Object.keys(examples).length} previews and ${Object.keys(brandCases).length} cases for Core ${short}`);
