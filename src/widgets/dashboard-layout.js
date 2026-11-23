import { widgetDefinitions } from "./settings.js";

export const DASHBOARD_LAYOUT_KEY = "pilotage.dashboard.layout.v1";
const widgetIds = widgetDefinitions.map(([id]) => id);
const overview = ["briefing", "weather", "agenda", "timer", "monthlyCalendar"];
const defaultOrder = [...overview, ...widgetIds.filter((id) => !overview.includes(id))];
const defaultSizes = {
  briefing: { width: 3, height: 1 },
  weather: { width: 2, height: 1 },
  agenda: { width: 3, height: 1 },
  timer: { width: 2, height: 1 },
  monthlyCalendar: { width: 5, height: 1 },
};

export function normalizeLayout(value) {
  if (!Array.isArray(value?.order)) return { order: [...defaultOrder], sizes: { ...defaultSizes } };
  const savedOrder = new Set(value.order);
  const order = [...savedOrder].filter((id) => widgetIds.includes(id));
  const sizes = {};
  for (const id of widgetIds) {
    if (!savedOrder.has(id)) order.push(id);
    const requestedWidth = value.sizes?.[id]?.width;
    const width = [2, 3, 4, 5].includes(requestedWidth) ? requestedWidth : 1;
    const height = value?.sizes?.[id]?.height === 2 ? 2 : 1;
    if (width > 1 || height === 2) sizes[id] = { width, height };
  }
  return { order, sizes };
}

export function moveTile(layout, visible, id, position) {
  const displayed = layout.order.filter((key) => visible[key]);
  const current = displayed.indexOf(id);
  if (current < 0 || !Number.isInteger(position) || position < 0 || position >= displayed.length) {
    return layout;
  }
  displayed.splice(current, 1);
  displayed.splice(position, 0, id);
  let index = 0;
  return {
    ...layout,
    order: layout.order.map((key) => visible[key] ? displayed[index++] : key),
  };
}

export function readDashboardLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(DASHBOARD_LAYOUT_KEY));
    if (saved?.version !== 2 && saved?.order?.length === widgetIds.length
      && widgetIds.every((id, index) => saved.order[index] === id)
      && !Object.keys(saved.sizes || {}).length) return normalizeLayout();
    return normalizeLayout(saved);
  } catch {
    return normalizeLayout();
  }
}

export function saveDashboardLayout(layout) {
  try {
    localStorage.setItem(DASHBOARD_LAYOUT_KEY, JSON.stringify({ version: 2, ...layout }));
    return true;
  } catch {
    return false;
  }
}
