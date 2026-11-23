import React, { Fragment, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Pencil, RotateCcw, Settings, Sparkles } from "lucide-react";
import { widgetDefinitions } from "./settings.js";
import { localDay } from "./calendar.js";
import {
  DASHBOARD_LAYOUT_KEY,
  moveTile,
  normalizeLayout,
  readDashboardLayout,
  saveDashboardLayout,
} from "./dashboard-layout.js";

const labels = Object.fromEntries(widgetDefinitions);
const defaultSize = { width: 1, height: 1 };
const clockFormat = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const dateFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "long", month: "long", day: "numeric" });
const shortDateFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "short", month: "short", day: "numeric" });
const monthFormat = new Intl.DateTimeFormat("fr-FR", { month: "long" });
const overview = normalizeLayout();

export function useDashboardMinute(active) {
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60000));
  useEffect(() => {
    if (!active) return;
    const update = () => setMinute(Math.floor(Date.now() / 60000));
    update();
    const interval = setInterval(update, 1000);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", update);
    };
  }, [active]);
  return new Date(minute * 60000);
}

function DashboardTime({ date }) {
  return (
    <>
      <h1 id="dashboard-title" className="sr-only">Smart Display</h1>
      <time className="dashboard-time" dateTime={date.toISOString()}>{clockFormat.format(date)}</time>
      <time className="dashboard-date" dateTime={localDay(date)}>
        <span>{dateFormat.format(date)}</span>
        <span>{shortDateFormat.format(date)}</span>
      </time>
    </>
  );
}

export function DashboardBriefing({ onOpen, received, processed, completed, open }) {
  return (
    <button type="button" className="card dashboard-overview dashboard-briefing"
      data-widget-id="briefing" data-widget-route="briefing" onClick={onOpen}>
      <span className="dashboard-briefing-symbol"><Sparkles size={23} aria-hidden="true" /></span>
      <span className="dashboard-overview-title">Briefing intelligent</span>
      <span className="dashboard-metrics">
        <span className="dashboard-metric">
          <span>E-mails analysés</span>
          <strong>{received === null ? "—" : `${processed}/${received}`}</strong>
          <span className="dashboard-meter" aria-hidden="true">
            <i style={{ width: `${received ? processed / received * 100 : 0}%` }} />
          </span>
        </span>
        <span className="dashboard-metric">
          <span>Tâches terminées</span>
          <strong>{completed}/{completed + open}</strong>
          <span className="dashboard-meter" aria-hidden="true">
            <i style={{ width: `${completed + open ? completed / (completed + open) * 100 : 0}%` }} />
          </span>
        </span>
      </span>
    </button>
  );
}

export function DashboardAgenda({ item, onOpen }) {
  return (
    <button type="button" className="card dashboard-overview dashboard-agenda"
      data-widget-id="agenda" data-widget-route="agenda" onClick={onOpen}>
      <span className="dashboard-overview-title">Mon agenda</span>
      <span className="dashboard-agenda-next">
        <strong>{item?.title || "Aucun événement à venir"}</strong>
        <small>{item ? item.when : "Voir les rendez-vous et les échéances"}</small>
      </span>
    </button>
  );
}

export function DashboardCalendar({ items, now, onOpen }) {
  const today = localDay(now);
  const daysUntilSunday = (7 - now.getDay()) % 7;
  const days = Array.from({ length: 49 * 7 }, (_, index) => localDay(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilSunday - (49 * 7 - 1 - index)),
  ));
  const counts = new Map();
  for (const item of items) {
    counts.set(item.day, (counts.get(item.day) || 0) + 1);
  }
  const plannedDays = [...counts.keys()].filter((day) => day.startsWith(today.slice(0, 7))).length;
  return (
    <button type="button" className="card dashboard-overview dashboard-calendar"
      data-widget-id="monthlyCalendar" data-widget-route="calendrier" onClick={onOpen}>
      <span className="dashboard-month-map" aria-hidden="true">
        {days.map((day) => (
          <i key={day} data-level={Math.min(counts.get(day) || 0, 3)}
            data-today={day === today || undefined} />
        ))}
      </span>
      <span className="dashboard-month-copy">
        <span className="dashboard-overview-title">{monthFormat.format(now)}</span>
        <strong>Calendrier mensuel</strong>
        <small>{plannedDays ? `${plannedDays} ${plannedDays === 1 ? "jour planifié" : "jours planifiés"}` : "Aucun jour planifié"}</small>
      </span>
    </button>
  );
}

export function DashboardTile({ id, route, icon: Icon, label, value, tone, onOpen }) {
  return (
    <button type="button" className={`card detail-tile ${tone || ""}`}
      data-widget-id={id} data-widget-route={route} onClick={onOpen}>
      <span className="detail-tile-icon"><Icon size={19} aria-hidden="true" /></span>
      <span className="dashboard-tile-copy">
        {value && <strong className="dashboard-tile-value">{value}</strong>}
        <span>{label}</span>
      </span>
      <ArrowUpRight className="dashboard-tile-arrow" size={15} aria-hidden="true" />
    </button>
  );
}

export default function DashboardGrid({
  date, visible, widgets, editing, onEditingChange, onOpenSettings,
}) {
  const [layout, setLayout] = useState(readDashboardLayout);
  const [selected, setSelected] = useState(null);
  const [saveError, setSaveError] = useState(false);
  const editButton = useRef(null);
  const widgetPicker = useRef(null);
  const positionPicker = useRef(null);
  const displayed = layout.order.filter((id) => visible[id]);
  const hasOverview = !editing && displayed.length > 5 && overview.order.slice(0, 5).every(
    (id, index) => displayed[index] === id && layout.sizes[id]?.width === overview.sizes[id].width
      && layout.sizes[id]?.height === 1,
  );
  const active = displayed.includes(selected) ? selected : displayed[0];
  const size = layout.sizes[active] || defaultSize;

  useEffect(() => {
    function refresh(event) {
      if (event.key === DASHBOARD_LAYOUT_KEY || event.key === null) {
        setLayout(readDashboardLayout());
        setSaveError(false);
      }
    }
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);

  useEffect(() => {
    if (editing) widgetPicker.current?.focus();
  }, [editing]);

  function save(getLayout) {
    const latest = saveError ? layout : readDashboardLayout();
    const next = getLayout(latest);
    setSaveError(!saveDashboardLayout(next));
    setLayout(next);
  }

  function resize(dimension, span) {
    save((current) => normalizeLayout({
      ...current,
      sizes: { ...current.sizes, [active]: { ...current.sizes[active], [dimension]: span } },
    }));
  }

  function finishEditing() {
    onEditingChange(false);
    editButton.current?.focus();
  }

  function selectTile(id) {
    setSelected(id);
    positionPicker.current?.focus();
  }

  return (
    <section className="dashboard-board" aria-labelledby="dashboard-title"
      onKeyDown={(event) => {
        if (editing && event.key === "Escape") {
          event.preventDefault();
          finishEditing();
        }
      }}>
      <header className="dashboard-toolbar">
        <DashboardTime date={date} />
        <div className="dashboard-actions">
          {(displayed.length > 0 || editing) && (
            <button ref={editButton} type="button" className="dashboard-action dashboard-edit"
              aria-expanded={editing} aria-controls="dashboard-editor" aria-label={editing ? "Terminer" : "Modifier la grille"}
              onClick={editing ? finishEditing : () => onEditingChange(true)}>
              {editing ? <Check size={16} aria-hidden="true" /> : <Pencil size={15} aria-hidden="true" />}
              <span>{editing ? "Terminer" : "Modifier"}</span>
            </button>
          )}
        </div>
      </header>
      <div id="dashboard-editor" className="dashboard-editor" hidden={!editing}>
        {editing && (
          <>
            {active && (
              <>
                <label>Tuile
                  <select ref={widgetPicker} value={active} onChange={(event) => setSelected(event.target.value)}>
                    {displayed.map((id) => <option key={id} value={id}>{labels[id]}</option>)}
                  </select>
                </label>
                <label>Position
                  <select ref={positionPicker} value={displayed.indexOf(active)}
                    onChange={(event) => {
                      const position = Number(event.target.value);
                      save((current) => moveTile(current, visible, active, position));
                    }}>
                    {displayed.map((id, index) => <option key={id} value={index}>{index + 1} sur {displayed.length}</option>)}
                  </select>
                </label>
                <label>Largeur
                  <select value={size.width} onChange={(event) => resize("width", Number(event.target.value))}>
                    <option value={1}>1 colonne</option>
                    <option value={2}>2 colonnes</option>
                    <option value={3}>3 colonnes</option>
                    <option value={4}>4 colonnes</option>
                    <option value={5}>5 colonnes</option>
                  </select>
                </label>
                <label>Hauteur
                  <select value={size.height} onChange={(event) => resize("height", Number(event.target.value))}>
                    <option value={1}>1 ligne</option>
                    <option value={2}>2 lignes</option>
                  </select>
                </label>
              </>
            )}
            <button type="button" className="dashboard-action dashboard-reset"
              onClick={() => save(() => normalizeLayout())}>
              <RotateCcw size={16} aria-hidden="true" /> Rétablir la grille
            </button>
          </>
        )}
      </div>
      {saveError && <p className="dashboard-save-error" role="status">Disposition non enregistrée sur cet appareil.</p>}
      {displayed.length ? (
        <div className="dashboard-grid">
          {displayed.map((id, index) => {
            const { width, height } = layout.sizes[id] || defaultSize;
            const { icon: Icon, preview } = widgets[id];
            return (
              <Fragment key={id}>
                <div className="dashboard-tile" data-card={id} data-wide={width > 1 || undefined}
                  style={{ "--tile-span": width }}
                  data-tall={height === 2 || undefined}>
                  {editing ? (
                    <button type="button" className="dashboard-picker" aria-pressed={id === active}
                      onClick={() => selectTile(id)}>
                      <Icon size={19} aria-hidden="true" />
                      <span>{labels[id]}</span>
                      <small>{index + 1} · {width} × {height}</small>
                      {id === active && <Check className="dashboard-picker-check" size={16} aria-hidden="true" />}
                    </button>
                  ) : (
                    <>
                      {id === "weather" && <Icon className="dashboard-weather-placeholder" aria-hidden="true" />}
                      {preview}
                    </>
                  )}
                </div>
                {hasOverview && index === 4 && <span className="dashboard-fold" aria-hidden="true" />}
              </Fragment>
            );
          })}
        </div>
      ) : (
        <div className="home-empty">
          <p>Aucun widget affiché.</p>
          <button type="button" className="dashboard-action" data-widget-id="homeSettings"
            data-widget-route="parametres" onClick={() => onOpenSettings("homeSettings")}>
            <Settings size={17} aria-hidden="true" /> Afficher des widgets
          </button>
        </div>
      )}
    </section>
  );
}
