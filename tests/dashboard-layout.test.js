import test from "node:test";
import assert from "node:assert/strict";
import { moveTile, normalizeLayout } from "../src/widgets/dashboard-layout.js";

test("les dispositions anciennes et mal formées restent utilisables", () => {
  const layout = normalizeLayout({
    order: ["timer", "notes", "notes", null, "inconnu"],
    sizes: { notes: { width: 2, height: 0 }, timer: { width: "2", height: 2 }, inconnu: { width: 2 } },
  });
  assert.deepEqual(layout.order.slice(0, 2), ["timer", "notes"]);
  assert.equal(layout.order.length, 15);
  assert.equal(new Set(layout.order).size, 15);
  assert.deepEqual(layout.sizes, { notes: { width: 2, height: 1 }, timer: { width: 1, height: 2 } });
  assert.deepEqual(normalizeLayout(layout), layout);
});

test("le nouvel ordre ne déplace pas les tuiles masquées", () => {
  const layout = normalizeLayout({ order: ["statEmails", "notes", "timer", "clock"] });
  const visible = { statEmails: true, timer: true, clock: true };
  const moved = moveTile(layout, visible, "clock", 0);
  assert.deepEqual(moved.order.slice(0, 4), ["clock", "notes", "statEmails", "timer"]);
  assert.equal(moveTile(layout, visible, "notes", 0), layout);
  assert.equal(moveTile(layout, visible, "clock", 3), layout);
});
