import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { initThemeToggles } from "../packages/astro/src/blocks/theme-toggle/theme-toggle.js";

const stateSource = await readFile(
  new URL(import.meta.resolve("@wpmoo/ui/state.js")),
  "utf8",
);

function fixture({
  theme = "light",
  embedded = false,
  key,
  denied = false,
} = {}) {
  const stored = new Map();
  const doc = {
    body: {},
    documentElement: { dir: "ltr", getAttribute: () => "ltr" },
    defaultView: {
      localStorage: {
        getItem: (name) => stored.get(name) ?? null,
        setItem(name, value) {
          if (denied) throw new Error("Storage denied");
          stored.set(name, value);
        },
      },
    },
  };
  const owner = {
    dataset: {
      bsTheme: theme,
      ...(embedded ? {} : { mooDocumentOwner: "true" }),
      ...(key ? { mooThemeKey: key } : {}),
    },
    ownerDocument: doc,
    parentElement: embedded ? {} : doc.body,
    matches: () => true,
    getAttribute: () => null,
    querySelectorAll: () => buttons,
  };
  doc.body.firstElementChild = owner;
  doc.currentScript = { parentElement: owner };
  const buttons = [
    ["Switch to light mode", "Switch to dark mode"],
    ["Hellen Modus aktivieren", "Dunklen Modus aktivieren"],
  ].map(([light, dark]) => {
    const button = new EventTarget();
    const attributes = new Map();
    button.dataset = {
      mooThemeLabelLight: light,
      mooThemeLabelDark: dark,
    };
    button.closest = () => owner;
    button.setAttribute = (name, value) => attributes.set(name, value);
    button.getAttribute = (name) => attributes.get(name) ?? null;
    button.querySelectorAll = () => [];
    return button;
  });
  const root = { querySelectorAll: () => buttons };
  return { owner, doc, root, buttons, stored };
}

test("a click changes the owner, synchronizes action labels and survives Core bootstrap", () => {
  const { owner, doc, root, buttons, stored } = fixture();
  initThemeToggles(root);
  assert.equal(buttons[0].getAttribute("aria-label"), "Switch to dark mode");
  buttons[0].dispatchEvent(new Event("click"));
  assert.equal(owner.dataset.bsTheme, "dark");
  assert.equal(stored.get("moo:theme"), "dark");
  assert.equal(buttons[0].getAttribute("aria-label"), "Switch to light mode");
  assert.equal(
    buttons[1].getAttribute("aria-label"),
    "Hellen Modus aktivieren",
  );

  owner.dataset.bsTheme = "light";
  vm.runInNewContext(stateSource, { document: doc });
  assert.equal(owner.dataset.bsTheme, "dark");
  buttons[1].dispatchEvent(new Event("click"));
  assert.equal(owner.dataset.bsTheme, "light");
  assert.equal(stored.get("moo:theme"), "light");
  assert.equal(doc.documentElement.dir, "ltr");
  assert.equal(doc.documentElement.dataset, undefined);
});

test("initializing twice binds one click handler", () => {
  const { owner, root, buttons } = fixture();
  initThemeToggles(root);
  initThemeToggles(root);
  buttons[0].dispatchEvent(new Event("click"));
  assert.equal(owner.dataset.bsTheme, "dark");
});

test("a retained control changes and persists its current owner after navigation", () => {
  const { owner, doc, root, buttons, stored } = fixture({ key: "old-theme" });
  const button = buttons[0];
  let currentOwner = owner;
  button.closest = () => currentOwner;
  initThemeToggles(root);

  const replacement = {
    ...owner,
    dataset: {
      bsTheme: "dark",
      mooDocumentOwner: "true",
      mooThemeKey: "new-theme",
    },
    querySelectorAll: () => [button],
  };
  owner.querySelectorAll = () => buttons.slice(1);
  doc.body.firstElementChild = replacement;
  currentOwner = replacement;
  initThemeToggles({ querySelectorAll: () => [button] });
  assert.equal(button.getAttribute("aria-label"), "Switch to light mode");
  button.dispatchEvent(new Event("click"));
  assert.equal(replacement.dataset.bsTheme, "light");
  assert.equal(owner.dataset.bsTheme, "light");
  assert.equal(button.getAttribute("aria-label"), "Switch to dark mode");
  assert.deepEqual([...stored], [["new-theme", "light"]]);

  currentOwner = null;
  button.dispatchEvent(new Event("click"));
  assert.equal(replacement.dataset.bsTheme, "light");
  assert.deepEqual([...stored], [["new-theme", "light"]]);
});

test("embedded owners persist only with their explicit preference key", () => {
  for (const [key, expected] of [
    [undefined, []],
    ["project-theme", [["project-theme", "dark"]]],
  ]) {
    const { owner, root, buttons, stored } = fixture({ embedded: true, key });
    initThemeToggles(root);
    buttons[0].dispatchEvent(new Event("click"));
    assert.equal(owner.dataset.bsTheme, "dark");
    assert.deepEqual([...stored], expected);
  }
});

test("denied storage still permits a local theme change", () => {
  const { owner, root, buttons, stored } = fixture({ denied: true });
  initThemeToggles(root);
  assert.doesNotThrow(() => buttons[0].dispatchEvent(new Event("click")));
  assert.equal(owner.dataset.bsTheme, "dark");
  assert.equal(buttons[0].getAttribute("aria-label"), "Switch to light mode");
  assert.equal(stored.size, 0);
});

test("clicking one owner leaves another owner's state and labels alone", () => {
  const first = fixture({ theme: "dark" });
  const second = fixture({ theme: "dark", embedded: true });
  initThemeToggles({
    querySelectorAll: () => [...first.buttons, ...second.buttons],
  });
  first.buttons[0].dispatchEvent(new Event("click"));
  assert.equal(first.owner.dataset.bsTheme, "light");
  assert.equal(second.owner.dataset.bsTheme, "dark");
  assert.equal(
    second.buttons[0].getAttribute("aria-label"),
    "Switch to light mode",
  );
  assert.equal(second.stored.size, 0);
});
