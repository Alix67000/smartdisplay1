import test from "node:test";
import assert from "node:assert/strict";
import { formatTimer, normalizeTimer, remainingTime, updateTimer } from "../src/widgets/timer.js";

test("la pause conserve le temps restant et la reprise recalcule l’échéance", () => {
  const start = 100_000;
  let timer = updateTimer(normalizeTimer(), { type: "preset", minutes: 3 }, start);
  timer = updateTimer(timer, { type: "toggle" }, start);
  assert.equal(timer.endsAt, 280_000);
  timer = updateTimer(timer, { type: "toggle" }, 142_500);
  assert.equal(remainingTime(timer, 300_000), 137_500);
  assert.equal(formatTimer(timer.remaining), "02:18");
  timer = updateTimer(timer, { type: "toggle" }, 300_000);
  assert.equal(timer.endsAt, 437_500);
  assert.equal(updateTimer(timer, { type: "expire" }, 437_499), timer);
  const finished = updateTimer(normalizeTimer(timer), { type: "expire" }, 550_000);
  assert.equal(finished.status, "finished");
  assert.equal(formatTimer(remainingTime(finished)), "00:00");
  assert.deepEqual(updateTimer(finished, { type: "reset" }), { minutes: 3, status: "idle" });
});

test("les valeurs illisibles reviennent au préréglage, sans déclencher d’alerte", () => {
  assert.deepEqual(normalizeTimer({ minutes: 7, status: "running", endsAt: "123" }), { minutes: 5, status: "idle" });
  assert.deepEqual(normalizeTimer({ minutes: 1, status: "paused", remaining: 100_000 }), { minutes: 1, status: "idle" });
});
