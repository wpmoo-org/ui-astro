import assert from "node:assert/strict";
import test from "node:test";
import * as published from "@wpmoo/ui/moo-ui.js";
import * as facade from "../src/runtime/moo-ui.js";

test("the facade forwards all nine published RC9 constructors and their initialization lifecycle", () => {
  const names = ["Chart", "Combobox", "ContextMenu", "DataTable", "Datepicker", "MooCalendar", "MooDateRangePicker", "Sidebar", "Slider"];
  assert.deepEqual(Object.keys(facade).sort(), [...names, "default"].sort());
  assert.equal(facade.default, published.default);
  for (const name of names) {
    assert.equal(facade[name], published[name]);
    assert.equal(facade.default[name], published[name]);
    assert.equal(typeof facade[name].getOrCreateInstance, "function");
    assert.equal(facade[name].getInstance(null), null);
    assert.equal(typeof facade[name].prototype.dispose, "function");
  }
});
