#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  assertPackedContainer,
  assertPlainInputTree,
} from "./packed_consumer_contracts.mjs";
import { prepareAstroStarter } from "./prepare_astro_starter.mjs";
import {
  digest,
  fileHashes,
  readJson,
  treeFiles,
  validateStarterLock,
} from "./astro_starter_contracts.mjs";
import { configureStarterProfile } from "../tests/fixtures/astro-starter/profiles.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inside = (parent, child) => {
  const p = relative(parent, child);
  return p === "" || (p !== ".." && !p.startsWith("../") && !isAbsolute(p));
};
function run(command, args, options = {}) {
  const r = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (r.error || r.status !== 0)
    throw new Error(
      `${command} failed: ${r.error?.message ?? r.stderr ?? r.stdout}`,
    );
  return r.stdout;
}
async function canonical(path, mustExist) {
  assert.ok(isAbsolute(path), "absolute proof paths required");
  let current = resolve(path);
  const missing = [];
  for (;;) {
    try {
      const found = await realpath(current);
      assert.equal(found, current, "symlinked proof/cache ancestor forbidden");
      assert.ok(!mustExist || missing.length === 0, "existing input required");
      return join(found, ...missing.reverse());
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      missing.push(basename(current));
      current = dirname(current);
    }
  }
}
export async function assertStarterLocations({ starterPath, cache, output }) {
  starterPath = await canonical(starterPath, true);
  const cachePath = await canonical(cache, true);
  const outputPath = await canonical(output, false);
  for (const owner of [REPO, starterPath])
    for (const path of [cachePath, outputPath])
      assert.ok(
        !inside(owner, path) && !inside(path, owner),
        "proof/cache must be outside checkout",
      );
  assert.ok(
    !inside(cachePath, outputPath) && !inside(outputPath, cachePath),
    "proof/cache must be disjoint",
  );
  assert.ok(
    (await lstat(cachePath)).isDirectory(),
    "primed cache directory required",
  );
  await assertPlainInputTree(cachePath);
  try {
    assert.equal((await readdir(outputPath)).length, 0, "output must be empty");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return { starterPath, cachePath, outputPath };
}
export async function verifyAstroStarter(options) {
  const { starterPath, cachePath, outputPath } =
    await assertStarterLocations(options);
  assert.match(
    options.image,
    /^sha256:[a-f0-9]{64}$/u,
    "existing immutable image ID required",
  );
  const image = JSON.parse(
    run("docker", ["image", "inspect", options.image]),
  )[0];
  assert.equal(image.Id, options.image);
  const prepared = await prepareAstroStarter({
    starterPath,
    sdkArchive: options.sdkArchive,
    outputPath,
    lockPath: join(REPO, "tests/fixtures/astro-starter/package-lock.json"),
  });
  const artifacts = { "@wpmoo/astro": prepared.sdk };
  const profiles = [];
  for (const categoryProfile of ["category", "short", "root"])
    for (const mainLanguage of ["en", "de"]) {
      const name = `${mainLanguage}-${categoryProfile}`;
      const directory = join(outputPath, name);
      await cp(prepared.sitePath, directory, { recursive: true });
      await configureStarterProfile(directory, {
        mainLanguage,
        categoryProfile,
      });
      const names = await treeFiles(directory);
      const authoredFiles = names.filter(
        (name) => !["package.json", "package-lock.json"].includes(name),
      );
      validateStarterLock(
        await readJson(join(directory, "package.json")),
        await readJson(join(directory, "package-lock.json")),
        artifacts,
      );
      profiles.push({
        name,
        directory: name,
        mainLanguage,
        categoryProfile,
        authored_files: authoredFiles,
        authored_sha256: await fileHashes(directory, authoredFiles),
      });
    }
  const scripts = [
    "run_packed_consumer.mjs",
    "astro_starter_contracts.mjs",
    "mdx-development-graph.mjs",
  ];
  for (const script of scripts)
    await writeFile(
      join(outputPath, script),
      await readFile(
        join(
          REPO,
          script === "mdx-development-graph.mjs" ? "tests" : "scripts",
          script === "run_packed_consumer.mjs"
            ? "run_astro_starter.mjs"
            : script,
        ),
      ),
    );
  const request = {
    schema_version: 2,
    kind: "astro-moo-starter",
    artifacts,
    profiles,
    source_commit: run("git", ["rev-parse", "HEAD"], { cwd: REPO }).trim(),
    starter_commit: run("git", ["rev-parse", "HEAD"], {
      cwd: starterPath,
    }).trim(),
    source_sha256: prepared.sourceHashes,
    core: await readJson(
      join(REPO, "packages/astro/contracts/ui-1.1.0-package.json"),
    ),
    scripts_sha256: await fileHashes(outputPath, scripts),
  };
  await writeFile(
    join(outputPath, "request.json"),
    `${JSON.stringify(request, null, 2)}\n`,
  );
  await writeFile(
    join(outputPath, "image.json"),
    `${JSON.stringify(image, null, 2)}\n`,
  );
  await assertPlainInputTree(outputPath);
  const id = run("docker", [
    "create",
    "--name",
    `astro-moo-starter-${digest(outputPath).slice(0, 12)}`,
    "--label",
    "org.wpmoo.proof=astro-moo-starter",
    "--network",
    "none",
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt",
    "no-new-privileges",
    "--tmpfs",
    "/tmp:rw,exec,nosuid,size=2g",
    "--mount",
    `type=bind,src=${outputPath},dst=/proof`,
    "--mount",
    `type=bind,src=${cachePath},dst=/cache,readonly`,
    "--workdir",
    "/proof",
    "--entrypoint",
    "node",
    image.Id,
    "/proof/run_packed_consumer.mjs",
    "/proof/request.json",
  ]).trim();
  async function inspect(phase) {
    const records = JSON.parse(run("docker", ["inspect", id]));
    await writeFile(
      join(outputPath, `container-${phase}.json`),
      `${JSON.stringify(records, null, 2)}\n`,
    );
    assertPackedContainer(records[0], {
      image: image.Id,
      output: outputPath,
      cache: cachePath,
      workspace: REPO,
    });
    return records[0];
  }
  try {
    await inspect("before");
    const result = spawnSync("docker", ["start", "--attach", id], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    await writeFile(
      join(outputPath, "container-execution.log"),
      `${result.stdout ?? ""}${result.stderr ?? ""}${result.error?.message ?? ""}`,
    );
    const after = await inspect("after");
    assert.equal(
      result.status,
      0,
      `isolated execution failed; inspect ${outputPath}/container-execution.log`,
    );
    assert.equal(after.State.ExitCode, 0);
    const proof = await readJson(join(outputPath, "proof.json"));
    proof.container = { id, image: image.Id };
    await writeFile(
      join(outputPath, "proof.json"),
      `${JSON.stringify(proof, null, 2)}\n`,
    );
    process.stdout.write(`${outputPath}: six direct-SDK profiles verified\n`);
  } finally {
    const state = JSON.parse(run("docker", ["inspect", id]))[0].State;
    if (!state.Running) {
      run("docker", ["rm", id]);
      await writeFile(
        join(outputPath, "container-cleanup.json"),
        `${JSON.stringify({ id, removed: true }, null, 2)}\n`,
      );
    }
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const names = {
    "--starter": "starterPath",
    "--sdk": "sdkArchive",
    "--cache": "cache",
    "--output": "output",
    "--image": "image",
  };
  const options = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    assert.ok(
      names[process.argv[i]] && process.argv[i + 1],
      "required options: --starter --sdk --cache --output --image",
    );
    assert.ok(
      !Object.hasOwn(options, names[process.argv[i]]),
      "duplicate option",
    );
    options[names[process.argv[i]]] = process.argv[i + 1];
  }
  assert.equal(Object.keys(options).length, 5, "all five options required");
  await verifyAstroStarter(options);
}
