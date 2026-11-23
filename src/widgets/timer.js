export const TIMER_KEY = "pilotage.timer.v1";
export const TIMER_PRESETS = [1, 3, 5, 10, 15, 25, 45, 60];

export function normalizeTimer(value) {
  const minutes = TIMER_PRESETS.includes(value?.minutes) ? value.minutes : 5;
  if (value?.status === "running" && Number.isSafeInteger(value.endsAt) && value.endsAt > 0) {
    return { minutes, status: "running", endsAt: value.endsAt };
  }
  if (value?.status === "paused" && Number.isSafeInteger(value.remaining)
    && value.remaining > 0 && value.remaining <= minutes * 60_000) {
    return { minutes, status: "paused", remaining: value.remaining };
  }
  if (value?.status === "finished") return { minutes, status: "finished" };
  return { minutes, status: "idle" };
}

export function remainingTime(timer, now = Date.now()) {
  if (timer.status === "running") return Math.max(0, Math.min(timer.endsAt - now, timer.minutes * 60_000));
  if (timer.status === "paused") return timer.remaining;
  if (timer.status === "finished") return 0;
  return timer.minutes * 60_000;
}

export function updateTimer(timer, action, now = Date.now()) {
  const { minutes, status } = timer;
  if (status === "running" && timer.endsAt <= now) return { minutes, status: "finished" };
  switch (action.type) {
    case "preset":
      return status === "idle" && TIMER_PRESETS.includes(action.minutes)
        ? { minutes: action.minutes, status } : timer;
    case "toggle":
      if (status === "running") return { minutes, status: "paused", remaining: remainingTime(timer, now) };
      if (status !== "finished") return { minutes, status: "running", endsAt: now + remainingTime(timer, now) };
      return timer;
    case "reset":
      return status === "idle" ? timer : { minutes, status: "idle" };
    default:
      return timer;
  }
}

export function formatTimer(milliseconds) {
  const seconds = Math.ceil(milliseconds / 1000);
  return [Math.floor(seconds / 60), seconds % 60]
    .map((unit) => String(unit).padStart(2, "0")).join(":");
}

export function readTimer() {
  try {
    return normalizeTimer(JSON.parse(localStorage.getItem(TIMER_KEY)));
  } catch {
    return normalizeTimer();
  }
}
