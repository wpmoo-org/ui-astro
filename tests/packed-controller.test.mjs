import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import * as controller from "../scripts/verify_packed_consumer.mjs";

const command = new URL(
  "../scripts/verify_packed_consumer.mjs",
  import.meta.url,
);
const required = [
  "--cache",
  "/tmp/primed-cache",
  "--output",
  "/tmp/empty-proof",
  "--image",
  "local-node-image",
];

test("the finite certification matrix includes default and host native errors", () => {
  assert.equal(Object.keys(controller.PACKED_PROFILES).length, 12);
  for (const name of ["not-found", "not-found-host"])
    assert.equal(
      controller.parsePackedArguments(["--fixture", name, ...required]).fixture,
      name,
    );
});

test("the controller rechecks immutable retained archives after execution", async () => {
  assert.equal(typeof controller.assertRetainedArtifacts, "function");
  const root = await mkdtemp(join(tmpdir(), "astro-retained-archive-"));
  const original = Buffer.from("Packed immutable bytes");
  const artifacts = {
    "@wpmoo/astro": {
      filename: "wpmoo-astro-0.1.0.tgz",
      sha256: createHash("sha256").update(original).digest("hex"),
    },
  };
  try {
    const path = join(root, artifacts["@wpmoo/astro"].filename);
    await writeFile(path, original);
    await controller.assertRetainedArtifacts(root, artifacts);
    await writeFile(path, Buffer.concat([original, Buffer.from("changed")]));
    await assert.rejects(
      controller.assertRetainedArtifacts(root, artifacts),
      /retained archive changed.*@wpmoo\/astro/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prepared mounts reject source symlinks before container creation", async () => {
  assert.equal(
    typeof controller.assertPlainInputTree,
    "function",
    "Mounted inputs need a real filesystem symlink check",
  );
  const root = await mkdtemp(join(tmpdir(), "astro-mount-input-"));
  try {
    await mkdir(join(root, "cache"));
    await writeFile(join(root, "cache", "content"), "Primed cache bytes");
    await controller.assertPlainInputTree(join(root, "cache"));
    await symlink(
      join(root, "outside-source"),
      join(root, "cache", "linked-source"),
    );
    await assert.rejects(
      controller.assertPlainInputTree(join(root, "cache")),
      /input symlink.*linked-source/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prepared consumers allow only the retained tarballs and their exact peer closure", async () => {
  assert.equal(
    typeof controller.validateProfileLock,
    "function",
    "The matrix needs a per-profile dependency boundary",
  );
  const read = async (path) =>
    JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
  const packageManifest = await read("../packages/astro/package.json");
  const manifest = await read("../apps/consumer/package.json");
  const lock = await read("../apps/consumer/package-lock.json");
  const core = await read("../packages/astro/contracts/ui-1.0.0-package.json");
  const artifacts = {
    "@wpmoo/astro": {
      filename: "wpmoo-astro-0.1.0.tgz",
      manifest: packageManifest,
      integrity: lock.packages["node_modules/@wpmoo/astro"].integrity,
    },
  };
  const args = { manifest, lock, artifacts, core, profile: "default" };
  assert.doesNotThrow(() => controller.validateProfileLock(args));
  for (const [mutate, diagnostic] of [
    [
      (value) => {
        value.manifest.dependencies["@wpmoo/astro"] =
          "file:/workspace/projects/ui/astro";
      },
      /retained tarball/,
    ],
    [
      (value) => {
        value.lock.packages["node_modules/@wpmoo/astro"].integrity =
          "sha512-wrong";
      },
      /archive integrity/,
    ],
    [
      (value) => {
        value.lock.packages["node_modules/extra"] = {
          version: "1.0.0",
          resolved: "file:/workspace/source",
        };
      },
      /source.*dependency/,
    ],
    [
      (value) => {
        value.lock.packages["node_modules/extra"] = {
          link: true,
          resolved: "../extra",
        };
      },
      /source.*dependency/,
    ],
    [
      (value) => {
        value.lock.packages["node_modules/@wpmoo/ui"].resolved =
          "file:../dev-ui.tgz";
      },
      /published Core release/,
    ],
    [
      (value) => {
        value.lock.packages["node_modules/astro"].version = "7.3.4";
      },
      /certified Astro/,
    ],
    [
      (value) => {
        value.lock.packages["node_modules/@astrojs/mdx"] = { version: "8.0.2" };
      },
      /MD-only/,
    ],
    [
      (value) => {
        value.lock.packages["node_modules/react"] = { version: "19.0.0" };
      },
      /CMS\/React-free/,
    ],
  ]) {
    const changed = structuredClone(args);
    mutate(changed);
    assert.throws(() => controller.validateProfileLock(changed), diagnostic);
  }
  const mdxManifest = await read("./fixtures/mdx/package.json");
  const mdxLock = await read("./fixtures/mdx/package-lock.json");
  artifacts["@wpmoo/astro"].integrity =
    mdxLock.packages["node_modules/@wpmoo/astro"].integrity;
  assert.doesNotThrow(() =>
    controller.validateProfileLock({
      ...args,
      artifacts,
      manifest: mdxManifest,
      lock: mdxLock,
      profile: "mdx",
    }),
  );
  mdxLock.packages["node_modules/@astrojs/mdx"].version = "8.0.1";
  assert.throws(
    () =>
      controller.validateProfileLock({
        ...args,
        artifacts,
        manifest: mdxManifest,
        lock: mdxLock,
        profile: "mdx",
      }),
    /certified MDX/,
  );
});

test("a packed runner accepts only its inspected network-none artifact and cache mounts", () => {
  assert.equal(
    typeof controller.assertPackedContainer,
    "function",
    "The controller needs an actual Docker inspect gate",
  );
  const expected = {
    image: `sha256:${"1".repeat(64)}`,
    output: "/tmp/proof",
    cache: "/tmp/cache",
    workspace: "/workspace",
  };
  const actual = {
    Image: expected.image,
    Config: {
      Entrypoint: ["node"],
      Cmd: ["/proof/run_packed_consumer.mjs", "/proof/request.json"],
    },
    HostConfig: {
      NetworkMode: "none",
      ReadonlyRootfs: true,
      Privileged: false,
      PortBindings: {},
      PublishAllPorts: false,
      CapAdd: [],
      Devices: [],
      DeviceRequests: [],
      VolumesFrom: [],
    },
    Mounts: [
      { Type: "bind", Source: "/tmp/proof", Destination: "/proof", RW: true },
      { Type: "bind", Source: "/tmp/cache", Destination: "/cache", RW: false },
    ],
  };
  assert.doesNotThrow(() => controller.assertPackedContainer(actual, expected));
  const mutations = [
    [
      (value) => {
        value.HostConfig.NetworkMode = "bridge";
      },
      /network must be none/,
    ],
    [
      (value) => {
        value.HostConfig.Privileged = true;
      },
      /privileged/,
    ],
    [
      (value) => {
        value.HostConfig.ReadonlyRootfs = false;
      },
      /read-only/,
    ],
    [
      (value) => {
        value.Image = `sha256:${"2".repeat(64)}`;
      },
      /image identity/,
    ],
    [
      (value) => {
        value.HostConfig.PortBindings = { "4322/tcp": [{ HostPort: "4322" }] };
      },
      /port/,
    ],
    [
      (value) => {
        value.Mounts[1].RW = true;
      },
      /cache.*read-only/,
    ],
    [
      (value) => {
        value.Mounts.push({
          Type: "bind",
          Source: "/var/run/docker.sock",
          Destination: "/var/run/docker.sock",
          RW: true,
        });
      },
      /two.*mounts/,
    ],
    [
      (value) => {
        value.Mounts[0].Source = "/workspace/projects/ui/astro";
      },
      /proof.*mount/,
    ],
    [
      (value) => {
        value.Config.Cmd = ["/workspace/scripts/run.mjs"];
      },
      /runner command/,
    ],
  ];
  for (const [mutate, diagnostic] of mutations) {
    const changed = structuredClone(actual);
    mutate(changed);
    assert.throws(
      () => controller.assertPackedContainer(changed, expected),
      diagnostic,
    );
  }
  assert.throws(
    () =>
      controller.assertPackedContainer(actual, {
        ...expected,
        workspace: "/tmp",
      }),
    /workspace/,
  );
});

test("packed CLI parses the complete profile selection before doing work", () => {
  assert.equal(
    typeof controller.parsePackedArguments,
    "function",
    "The controller needs a strict argument parser",
  );
  assert.deepEqual(controller.parsePackedArguments(required), {
    fixture: "all",
    cache: "/tmp/primed-cache",
    output: "/tmp/empty-proof",
    image: "local-node-image",
  });
  for (const fixture of [
    "default",
    "theme",
    "ui-only",
    "page-only",
    "post-only",
    "mdx",
    "external-plugin",
    "taxonomy",
    "external-taxonomy",
    "content-editing",
  ]) {
    assert.equal(
      controller.parsePackedArguments([...required, "--fixture", fixture])
        .fixture,
      fixture,
    );
  }
});

test("packed_cli_rejects_unknown_or_duplicate_flags without creating artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "astro-cli-input-"));
  try {
    const valid = [
      "--cache",
      join(root, "cache"),
      "--output",
      join(root, "proof"),
      "--image",
      "not-installed",
    ];
    for (const args of [
      [...valid, "--unknown", "value"],
      [...valid, "--fixture", "all", "--fixture", "theme"],
      [...valid, "--output", join(root, "other")],
      [...valid, "--fixture", "typo"],
      [...valid, "--fixture"],
      [...valid, "--fixture", "--image"],
      valid.slice(0, -2),
      [...valid, "positional"],
      ["--cache", "relative", ...valid.slice(2)],
    ]) {
      const result = spawnSync(process.execPath, [command.pathname, ...args], {
        encoding: "utf8",
      });
      assert.equal(result.status, 2, result.stderr);
      assert.match(result.stderr, /Usage:.*--fixture.*--image/s);
      assert.deepEqual(
        await readdir(root),
        [],
        "Invalid CLI input must fail before packing, cache writes or container creation",
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
