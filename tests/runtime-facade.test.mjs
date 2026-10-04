import assert from "node:assert/strict";
import test from "node:test";
import * as published from "@wpmoo/ui/moo-ui.js";
import * as facade from "../packages/astro/src/runtime/moo-ui.js";

test("the facade forwards the published RC10 exports without a synchronous Chart", () => {
  const names = ["Combobox", "ContextMenu", "DataTable", "Datepicker", "MooCalendar", "MooDateRangePicker", "Sidebar", "Slider"];
  assert.deepEqual(Object.keys(facade).sort(), [...names, "initSheets", "loadChart", "default"].sort());
  assert.equal(facade.default, published.default);
  for (const name of names) {
    assert.equal(facade[name], published[name]);
    assert.equal(facade.default[name], published[name]);
    assert.equal(typeof facade[name].getOrCreateInstance, "function");
    assert.equal(facade[name].getInstance(null), null);
    assert.equal(typeof facade[name].prototype.dispose, "function");
  }
  assert.equal("Chart" in facade, false);
  assert.equal("Chart" in facade.default, false);
});

test("the lazy loader shares the direct Chart constructor and its lifecycle", async () => {
  assert.equal(typeof facade.loadChart, "function");
  assert.equal(facade.loadChart, published.loadChart);
  assert.equal(facade.default.loadChart, published.loadChart);
  const promise = facade.loadChart();
  assert.equal(typeof promise.then, "function");
  const [Chart, again, direct] = await Promise.all([
    promise, facade.default.loadChart(), import("@wpmoo/ui/chart.js"),
  ]);
  assert.equal(Chart, again);
  assert.equal(Chart, direct.default);
  assert.equal(typeof Chart.getOrCreateInstance, "function");
  assert.equal(Chart.getInstance(null), null);
  assert.equal(typeof Chart.prototype.dispose, "function");
});

test("the Sheet initializer forwards the published aggregate and its explicit lifecycle", () => {
  assert.equal(typeof facade.initSheets, "function");
  assert.equal(facade.initSheets, published.initSheets);
  assert.equal(facade.default.initSheets, published.initSheets);
  const root = {
    nodeType: 9,
    defaultView: { bootstrap: { Offcanvas: {} } },
    querySelectorAll: () => [],
  };
  const dispose = facade.initSheets(root);
  assert.equal(typeof dispose, "function");
  assert.equal(facade.default.initSheets(root), dispose);
  dispose();
  const next = facade.initSheets(root);
  assert.notEqual(next, dispose);
  next();
});
