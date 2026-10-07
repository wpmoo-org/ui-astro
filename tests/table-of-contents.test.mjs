import assert from "node:assert/strict";
import test from "node:test";
import {
  tocItems,
  fragmentHref,
} from "../packages/astro/src/components/table-of-contents.js";
import { selectAsidePlacements } from "../packages/astro/src/placements/aside.js";

test("TOC keeps native targets and plain labels, rejecting ambiguous identity", () => {
  const items = [{ targetId: "über/uns", label: "<Deutsch>" }];
  assert.deepEqual(tocItems(items), items);
  assert.equal(fragmentHref(items[0].targetId), "#%C3%BCber%2Funs");
  for (const invalid of [
    null,
    new Array(1),
    [{ targetId: "a b", label: "A" }],
    [{ targetId: "", label: "A" }],
    [{ targetId: "a", label: 4 }],
    [
      { targetId: "a", label: "A" },
      { targetId: "a", label: "B" },
    ],
  ])
    assert.throws(() => tocItems(invalid), /TOC/);
  assert.deepEqual(tocItems([]), []);
});

const toc = { kind: "toc", tocItems: [{ targetId: "intro", label: "Intro" }] };
const note = { kind: "content", id: "note" };
const empty = { kind: "toc", tocItems: [] };
const plan = { groups: { "aside.content": [toc, note, empty] } };
const aside = { breakpoint: "xl", mobile: "stack-after" };

test("default aside projects prepared TOCs and retains other bodies in order", () => {
  const selected = selectAsidePlacements(plan, aside);
  assert.deepEqual(selected.compact, [toc]);
  assert.deepEqual(selected.placements, [toc, note]);
  assert.equal(selected.hasMobileBody, true);
  assert.equal(selected.compactClass, "d-xl-none");
  assert.equal(selected.listClass, "d-none d-xl-block");
  assert.deepEqual(selectAsidePlacements(plan, {}), selected);
  assert.equal(
    selectAsidePlacements({ groups: { "aside.content": [toc] } }, aside)
      .hasMobileBody,
    false,
  );
});

test("disabled, empty and explicit custom aside ownership produce no default TOC", () => {
  for (const [value, custom] of [
    [null, false],
    [aside, true],
  ]) {
    const selected = selectAsidePlacements(plan, value, custom);
    assert.deepEqual(selected.compact, []);
    assert.deepEqual(selected.placements, []);
  }
  assert.deepEqual(selectAsidePlacements({ groups: {} }, aside).compact, []);
  const customHost = selectAsidePlacements(plan, aside, false, false);
  assert.deepEqual(customHost.compact, []);
  assert.equal(customHost.listClass, "");
});

test("explicit whole-aside policies preserve list ownership and no compact projection", () => {
  for (const mobile of ["hidden", "collapse-before"]) {
    const selected = selectAsidePlacements(plan, { ...aside, mobile });
    assert.deepEqual(selected.compact, []);
    assert.deepEqual(selected.placements, [toc, note]);
    assert.equal(selected.listClass, "");
  }
  for (const breakpoint of ["lg", "xl", "xxl"])
    assert.equal(
      selectAsidePlacements(plan, { ...aside, breakpoint }).compactClass,
      `d-${breakpoint}-none`,
    );
});
