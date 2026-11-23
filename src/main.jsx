import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { PublicClientApplication } from "@azure/msal-browser";
import {
  House,
  Pencil,
  Mail,
  CalendarDays,
  CheckSquare,
  Clock3,
  Settings,
  Search,
  Plus,
  ArrowUpRight,
  ArrowLeft,
  Sparkles,
  X,
  Check,
  RefreshCw,
  AlertCircle,
  LogOut,
  Inbox,
  Link2,
  StickyNote,
  CloudSun,
  ArrowDownUp,
  Timer as TimerIcon,
} from "lucide-react";
import "./style.css";
import { importedItems, mergeById } from "./lib/automation.js";
import Weather from "./widgets/Weather.jsx";
import AgendaEvents from "./widgets/AgendaEvents.jsx";
import MonthlyCalendar from "./widgets/MonthlyCalendar.jsx";
import ExchangeRates from "./widgets/ExchangeRates.jsx";
import Clock from "./widgets/Clock.jsx";
import QuickNotes from "./widgets/QuickNotes.jsx";
import UsefulLinks from "./widgets/UsefulLinks.jsx";
import WidgetSettings from "./widgets/WidgetSettings.jsx";
import Loading from "./widgets/Loading.jsx";
import DashboardGrid, {
  DashboardAgenda,
  DashboardBriefing,
  DashboardCalendar,
  DashboardTile,
  useDashboardMinute,
} from "./widgets/DashboardGrid.jsx";
import { agendaDays, calendarItems } from "./widgets/calendar.js";
import TimerPage, { TimerAlert, TimerTile, useTimer } from "./widgets/Timer.jsx";
import { connectFirebase, firebaseAuth, prepareGooglePopup } from "./lib/firebase-client.js";
const SyncAccount = React.lazy(() => import("./widgets/SyncAccount.jsx"));
import {
  readWidgetSettings,
  normalizeSettings,
  SETTINGS_KEY,
} from "./widgets/settings.js";
import { WEATHER_CITY_KEY, cityIsValid } from "./widgets/weather.js";
const localChanged = () =>
  window.dispatchEvent(new Event("pilotage-local-change"));

const clientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID;
const tenant = import.meta.env.VITE_MICROSOFT_TENANT_ID || "organizations";
const scopes = ["User.Read", "Mail.Read", "Calendars.Read"];
const allowedDomain = "emmaus-scherwiller.fr";
const analysisSessionKey = "pilotage.google.analyses.v2";
function savedAnalyses() {
  try {
    return JSON.parse(sessionStorage.getItem(analysisSessionKey) || "{}");
  } catch {
    return {};
  }
}
function allowedSender(value) {
  const v = (value || "").trim();
  const match =
    v.match(/<\s*([^<>\s]+@[^<>\s]+)\s*>/) || v.match(/^([^<>\s]+@[^<>\s]+)$/);
  if (!match) return false;
  const address = match[1].toLowerCase();
  return address.slice(address.lastIndexOf("@") + 1) === allowedDomain;
}
const msal = clientId
  ? new PublicClientApplication({
      auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${encodeURIComponent(tenant)}`,
        redirectUri: window.location.origin,
      },
      cache: { cacheLocation: "sessionStorage" },
    })
  : null;
const dashboard = "Vue d’ensemble";
const routes = {
  [dashboard]: "",
  "E-mails": "emails",
  Agenda: "agenda",
  Tâches: "taches",
  Échéances: "echeances",
  Paramètres: "parametres",
  Météo: "meteo",
  Devises: "devises",
  Horloge: "horloge",
  "Calendrier mensuel": "calendrier",
  "Notes rapides": "notes",
  "Liens utiles": "liens",
  "Briefing intelligent": "briefing",
  Minuteur: "minuteur",
};
const routeNames = new Map(Object.entries(routes).map(([name, route]) => [route, name]));
const googleReturnKey = "pilotage.google.return.v1";
const googleReturnRoutes = ["emails", "agenda", "briefing", "parametres"];
const extraWidgets = [
  ["notes", "Notes rapides", StickyNote],
  ["usefulLinks", "Liens utiles", Link2],
  ["emails", "E-mails", Mail, "E-mails récents"],
  ["tasks", "Tâches", CheckSquare, "Mes tâches"],
];
const dockItems = [
  [dashboard, House],
  ["E-mails", Mail],
  ["Briefing intelligent", Sparkles, true],
  ["Agenda", CalendarDays],
  ["Météo", CloudSun],
  ["Tâches", CheckSquare, true],
  ["Liens utiles", Link2, true],
  ["Minuteur", TimerIcon],
  ["Paramètres", Settings],
];
function readNavigation() {
  const { hash, search } = window.location;
  if (new URLSearchParams(search).get("google")) {
    let route;
    try {
      route = sessionStorage.getItem(googleReturnKey);
    } catch {}
    const destination = googleReturnRoutes.includes(route) ? route : "emails";
    return { name: routeNames.get(destination) };
  }
  return {
    name: routeNames.get(hash.replace(/^#\/?/, "")) || dashboard,
    entry: window.history.state?.dashboardEntry,
  };
}
const dateISO = (d) => {
  const copy = new Date(d);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
};
const addDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return dateISO(d);
};
const fmt = (v, opt) => {
  try {
    return new Intl.DateTimeFormat("fr-FR", opt).format(new Date(v));
  } catch {
    return "Date inconnue";
  }
};
const prettyDue = (value) => {
  if (!value) return "Sans échéance";
  const now = dateISO(new Date());
  if (value === now) return "Aujourd’hui";
  if (value === addDays(1)) return "Demain";
  return fmt(value + "T12:00:00", { day: "numeric", month: "short" });
};
const displaySender = (v) =>
  (v || "Expéditeur inconnu")
    .replace(/\s*<[^>]+>\s*$/, "")
    .replace(/^"|"$/g, "")
    .trim() ||
  v ||
  "Expéditeur inconnu";
function loadLocal(key) {
  try {
    const x = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(x) ? x : [];
  } catch {
    return [];
  }
}
function loadTasks() {
  try {
    const x = localStorage.getItem("pilotage.tasks.v1");
    return x ? JSON.parse(x) : [];
  } catch {
    return [];
  }
}
async function requestWithTimeout(url, options = {}, timeout = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
async function graph(token, path) {
  const r = await requestWithTimeout(
    "https://graph.microsoft.com/v1.0" + path,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Prefer:
          'outlook.timezone="' +
          Intl.DateTimeFormat().resolvedOptions().timeZone +
          '"',
      },
    },
  );
  if (!r.ok)
    throw new Error(
      `Microsoft Graph : erreur ${r.status}. Vérifie les autorisations de ton organisation.`,
    );
  return r.json();
}
function App() {
  const [widgetSettings, setWidgetSettings] = useState(readWidgetSettings),
    [widgetSaveError, setWidgetSaveError] = useState(false),
    [syncStatus, setSyncStatus] = useState("idle");
  const [settingsActionsTarget, setSettingsActionsTarget] = useState(null);
  const [editingDashboard, setEditingDashboard] = useState(false);
  const timerControls = useTimer();
  const pageHeading = useRef(null);
  const settingsShortcut = useRef(null);
  const swipePanel = useRef(null);
  const swipeArrival = useRef(0);
  const settingsRef = useRef(widgetSettings);
  settingsRef.current = widgetSettings;
  const [weatherCity, setWeatherCity] = useState(() => {
    try {
      const city = JSON.parse(localStorage.getItem(WEATHER_CITY_KEY));
      return cityIsValid(city) ? city : null;
    } catch {
      return null;
    }
  });
  function saveSettings(next, city, baseline) {
    // Refuse a stale save even if a storage event has not yet been processed.
    let oldSettings, oldCity;
    try {
      oldSettings = localStorage.getItem(SETTINGS_KEY);
      oldCity = localStorage.getItem(WEATHER_CITY_KEY);
      if (oldSettings !== null) {
        const raw = JSON.parse(oldSettings);
        if (!raw || typeof raw !== "object" || Array.isArray(raw))
          throw Error("invalid-saved-settings");
      }
      const currentSettings = readWidgetSettings();
      let currentCity = null;
      if (oldCity !== null) {
        const v = JSON.parse(oldCity);
        if (v !== null && !cityIsValid(v)) throw Error("invalid-saved-city");
        currentCity = v;
      }
      if (
        JSON.stringify({ settings: currentSettings, city: currentCity }) !==
        JSON.stringify(baseline)
      ) {
        refreshLocal();
        return {
          ok: false,
          message:
            "Les réglages ont changé ailleurs. Recharge-les avant de les modifier à nouveau.",
        };
      }
      const normalized = normalizeSettings(next);
      const updateSettings =
          JSON.stringify(normalized) !== JSON.stringify(currentSettings),
        updateCity = JSON.stringify(city) !== JSON.stringify(currentCity);
      if (updateSettings)
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
      try {
        if (updateCity) {
          if (city)
            localStorage.setItem(WEATHER_CITY_KEY, JSON.stringify(city));
          else localStorage.removeItem(WEATHER_CITY_KEY);
        }
      } catch (e) {
        if (updateSettings) {
          try {
            if (oldSettings === null) localStorage.removeItem(SETTINGS_KEY);
            else localStorage.setItem(SETTINGS_KEY, oldSettings);
          } catch {
            localChanged();
            return {
              ok: false,
              message:
                "Enregistrement partiel : certains réglages ont peut-être été modifiés. Vérifie les valeurs enregistrées avant de réessayer.",
            };
          }
        }
        throw e;
      }
      setWidgetSettings(normalized);
      setWeatherCity(city);
      setWidgetSaveError(false);
      localChanged();
      return { ok: true };
    } catch {
      setWidgetSaveError(true);
      return {
        ok: false,
        message:
          "Enregistrement impossible. Les modifications restent à l’écran : vérifie le stockage et réessaie.",
      };
    }
  }
  const visible = widgetSettings.visible;
  const [googleToken, setGoogleToken] = useState(null);
  const [localDeadlines, setLocalDeadlines] = useState(() =>
    loadLocal("pilotage.deadlines.v1"),
  );
  const imports = useRef(new Set(loadLocal("pilotage.imported.v1")));
  const [analyses, setAnalyses] = useState(savedAnalyses);
  const analysesRef = useRef(analyses),
    analysisRunning = useRef(false),
    mailRunning = useRef(false),
    sessionGeneration = useRef(0),
    swipeStart = useRef(null);
  const [loadedHours, setLoadedHours] = useState(widgetSettings.emailHours);
  useEffect(
    () => () => {
      sessionGeneration.current++;
    },
    [],
  );
  const [weekRunning, setWeekRunning] = useState(false),
    [progress, setProgress] = useState(null),
    [moreMessages, setMoreMessages] = useState(false);
  const [navigation, setNavigation] = useState(readNavigation),
    [tasks, setTasks] = useState(loadTasks),
    [showForm, setShowForm] = useState(false),
    [title, setTitle] = useState(""),
    [due, setDue] = useState(""),
    [category, setCategory] = useState("Support"),
    [account, setAccount] = useState(null),
    [messages, setMessages] = useState([]),
    [events, setEvents] = useState([]),
    [loading, setLoading] = useState(false),
    [checkingSession, setCheckingSession] = useState(true),
    [googleAuthReady, setGoogleAuthReady] = useState(false),
    [sessionUnavailable, setSessionUnavailable] = useState(false),
    [mailError, setMailError] = useState(false),
    [agendaError, setAgendaError] = useState(false),
    [error, setError] = useState(""),
    [search, setSearch] = useState("");
  const { name: nav, entry } = navigation;
  const offersGoogleConnection = googleReturnRoutes.includes(routes[nav]) && !account;
  const googleConnectLabel = googleAuthReady ? "Connecter Google" : "Préparation de Google…";
  useEffect(() => {
    if (!offersGoogleConnection || googleAuthReady) return;
    let active = true;
    const enableConnection = () => { if (active) setGoogleAuthReady(true); };
    // After a preparation error, let Firebase retry on an explicit click.
    prepareGooglePopup().then(enableConnection, enableConnection);
    return () => { active = false; };
  }, [offersGoogleConnection, googleAuthReady]);
  const homeNow = useDashboardMinute(nav === dashboard);
  const previousNavigation = useRef(navigation);
  useEffect(() => {
    const previous = previousNavigation.current;
    if (nav !== dashboard) {
      setEditingDashboard(false);
      if (swipePanel.current) swipePanel.current.scrollTop = 0;
      if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
      pageHeading.current?.focus({ preventScroll: true });
    } else if (previous.name !== dashboard && !editingDashboard) {
      const widgets = [...(swipePanel.current?.querySelectorAll("[data-widget-route]") || [])];
      const shortcut = previous.entry?.widget === "settingsShortcut" ? settingsShortcut.current : null;
      const target = (shortcut?.getClientRects().length && shortcut)
        || widgets.find((widget) => widget.dataset.widgetId === previous.entry?.widget)
        || widgets.find((widget) => widget.dataset.widgetRoute === routes[previous.name])
        || widgets[0];
      target?.focus();
    }
    if (swipeArrival.current) {
      swipePanel.current?.animate?.(
        [{ transform: `translateX(${swipeArrival.current}px)` }, { transform: "translateX(0)" }],
        { duration: 240, easing: "cubic-bezier(.2,.75,.25,1)" },
      );
      swipeArrival.current = 0;
    }
    previousNavigation.current = { name: nav, entry };
  }, [nav, entry]);
  useEffect(() => {
    function changed() {
      const next = readNavigation();
      setNavigation((current) => current.name === next.name
        && current.entry?.steps === next.entry?.steps
        && current.entry?.widget === next.entry?.widget ? current : next);
    }
    window.addEventListener("popstate", changed);
    window.addEventListener("hashchange", changed);
    return () => {
      window.removeEventListener("popstate", changed);
      window.removeEventListener("hashchange", changed);
    };
  }, []);
  function navigate(name, widget) {
    if (name === nav) return;
    if (name === dashboard && entry) {
      window.history.go(-entry.steps);
      return;
    }
    const dashboardEntry = name === dashboard ? undefined
      : nav === dashboard ? { steps: 1, widget }
        : entry && { ...entry, steps: entry.steps + 1 };
    window.history.pushState({ dashboardEntry }, "", `#/${routes[name]}`);
    setNavigation({ name, entry: dashboardEntry });
  }
  function refreshLocal() {
    setTasks(loadTasks());
    setLocalDeadlines(loadLocal("pilotage.deadlines.v1"));
    imports.current = new Set(loadLocal("pilotage.imported.v1"));
    setWidgetSettings(readWidgetSettings());
    try {
      const c = JSON.parse(localStorage.getItem(WEATHER_CITY_KEY));
      setWeatherCity(cityIsValid(c) ? c : null);
    } catch {
      setWeatherCity(null);
    }
    window.dispatchEvent(new Event("pilotage-sync-applied"));
  }
  useEffect(() => {
    function otherTab(e) {
      if (
        [
          "pilotage.tasks.v1",
          "pilotage.deadlines.v1",
          "pilotage.imported.v1",
          "pilotage.widgets.v1",
          WEATHER_CITY_KEY,
        ].includes(e.key)
      )
        refreshLocal();
    }
    window.addEventListener("storage", otherTab);
    return () => window.removeEventListener("storage", otherTab);
  }, []);
  useEffect(() => {
    localStorage.setItem("pilotage.tasks.v1", JSON.stringify(tasks));
    localChanged();
  }, [tasks]);
  useEffect(() => {
    localStorage.setItem(
      "pilotage.deadlines.v1",
      JSON.stringify(localDeadlines),
    );
    localChanged();
  }, [localDeadlines]);
  useEffect(() => {
    try {
      if (googleToken)
        sessionStorage.setItem(analysisSessionKey, JSON.stringify(analyses));
    } catch {}
  }, [analyses, googleToken]);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        sessionStorage.removeItem("pilotage.google.session.v1");
      } catch {}
      const url = new URL(window.location.href);
      const result = url.searchParams.get("google");
      if (result) {
        url.searchParams.delete("google");
        url.hash = `#/${routes[nav]}`;
        try {
          sessionStorage.removeItem(googleReturnKey);
        } catch {}
        window.history.replaceState(
          {},
          "",
          url.pathname + url.search + url.hash,
        );
      }
      try {
        let sessionFailed = false;
        try {
          const r = await requestWithTimeout("/api/google?action=session");
          if (r.ok) {
            if (r.headers?.get("content-type")?.includes("text/html")) {
              throw Error("session-api-missing");
            }
            setGoogleToken("google");
            await googleSync(false);
            return;
          }
          if (r.status !== 401) throw Error("session-unavailable");
        } catch (error) {
          sessionFailed = true;
          if (active) {
            setSessionUnavailable(true);
            setError(
              error?.message === "session-api-missing"
                ? "Le service de connexion Google n’est pas disponible sur cette adresse."
                : "Impossible de vérifier la connexion Gmail. Vérifie ta connexion Internet puis actualise la page.",
            );
          }
        }
        if (!sessionFailed && result === "permissions")
          setError(
            "La connexion n’a pas été activée : le compte ou les autorisations Google ne correspondent pas aux accès en lecture seule.",
          );
        else if (!sessionFailed && result && result !== "ok") {
          const details = {
            session:
              "Session de connexion perdue ou expirée (code SESSION). Relance la connexion dans le même navigateur.",
            refus: "Autorisation refusée ou annulée (code REFUS).",
            fournisseur:
              "Le fournisseur a signalé une erreur (code FOURNISSEUR).",
            code: "Code d’autorisation manquant ou invalide (code AUTORISATION).",
            configuration: "Le service Google a refusé la configuration de connexion de Smart Display (code CONFIGURATION).",
            autorisation_expiree: "Google a refusé le code d’autorisation (code AUTORISATION EXPIRÉE). Relance la connexion depuis Smart Display.",
            identite: "Google n’a pas confirmé le compte attendu (code IDENTITÉ). Choisis le même compte Google à chaque étape.",
            verification: "Smart Display n’a pas pu vérifier la réponse de Google ou enregistrer la connexion (code VÉRIFICATION).",
            echange: "Google n’a pas pu terminer la connexion sécurisée (code ECHANGE).",
            refresh: "Google n’a pas fourni l’autorisation durable nécessaire (code REFRESH).",
          };
          setError(details[result] || "La connexion Google n’a pas abouti.");
        }
        if (msal) {
          try {
            await msal.initialize();
            const a = msal.getAllAccounts()[0];
            if (a) setAccount({ ...a, provider: "microsoft" });
          } catch {
            setError("Impossible de se connecter à Outlook.");
          }
        }
      } finally {
        if (active) setCheckingSession(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  const sync = useCallback(async (a) => {
    if (!msal || !a) return;
    setLoading(true);
    setError("");
    setMailError(false);
    try {
      let token;
      try {
        token = (await msal.acquireTokenSilent({ account: a, scopes }))
          .accessToken;
      } catch {
        token = (await msal.acquireTokenPopup({ account: a, scopes }))
          .accessToken;
      }
      const start = new Date();
      start.setDate(start.getDate() - 1);
      const end = new Date();
      end.setDate(end.getDate() + 14);
      const [m, e] = await Promise.all([
        graph(
          token,
          "/me/messages?$select=id,subject,from,receivedDateTime,bodyPreview,isRead&$orderby=receivedDateTime%20desc&$top=15",
        ),
        graph(
          token,
          `/me/calendarView?startDateTime=${encodeURIComponent(start.toISOString())}&endDateTime=${encodeURIComponent(end.toISOString())}&$select=id,subject,start,end,location,isAllDay&$orderby=start/dateTime&$top=30`,
        ),
      ]);
      setMessages(
        (m.value || []).filter((message) =>
          allowedSender(message.from?.emailAddress?.address),
        ),
      );
      setEvents(e.value || []);
    } catch (e) {
      setMailError(true);
      setError(e.message || "La connexion a échoué.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (account?.provider === "microsoft") sync(account);
  }, [account, sync]);
  async function connect() {
    if (account?.provider === "google") {
      setError("Déconnectez d’abord Gmail pour utiliser Outlook.");
      return;
    }
    if (!msal) {
      setError(
        "Configure VITE_MICROSOFT_CLIENT_ID dans Vercel ou dans le fichier .env.local avant de te connecter.",
      );
      return;
    }
    setLoading(true);
    setError("");
    try {
      await msal.initialize();
      let result = await msal.loginPopup({ scopes });
      setAccount({ ...result.account, provider: "microsoft" });
    } catch (e) {
      setError(
        "Connexion impossible : " +
          (e.message || "vérifie la configuration Microsoft."),
      );
    } finally {
      setLoading(false);
    }
  }
  async function googleSync(autoAnalyze = false) {
    if (mailRunning.current || analysisRunning.current) return;
    mailRunning.current = true;
    setLoading(true);
    setError("");
    setMailError(false);
    let expired = false;
    setAgendaError(false);
    const hours = settingsRef.current.emailHours,
      generation = sessionGeneration.current;
    try {
      const [session, mail, agenda] = await Promise.allSettled([
        requestWithTimeout("/api/google?action=session"),
        requestWithTimeout("/api/google?action=messages&hours=" + hours),
        requestWithTimeout("/api/google?action=events"),
      ]);
      if (generation !== sessionGeneration.current) return;
      const response = (result) => result.status === "fulfilled" ? result.value : null;
      const sr = response(session), mr = response(mail), er = response(agenda);
      if ([sr, mr, er].some(result => result?.status === 401)) {
        expired = true;
        setGoogleToken(null);
        setAccount(null);
        setMessages([]);
        setEvents([]);
        setMoreMessages(false);
        throw new Error("La connexion Google a expiré. Reconnecte ton compte.");
      }
      if (!sr?.ok) throw new Error("Impossible de vérifier la connexion Google. Réessaie.");
      const read = (result) => result?.ok ? result.json().catch(() => null) : null;
      const [profile, data, calendar] = await Promise.all([read(sr), read(mr), read(er)]);
      if (generation !== sessionGeneration.current) return;
      if (typeof profile?.email !== "string") {
        throw new Error("La réponse du service de connexion Google est illisible. Réessaie.");
      }
      const fetched = Array.isArray(data?.messages) ? data.messages : null;
      setMailError(!fetched);
      setAgendaError(!Array.isArray(calendar?.events));
      if (fetched) {
        setMessages(fetched);
        setLoadedHours(hours);
        setMoreMessages(!!data.more);
      }
      if (Array.isArray(calendar?.events)) setEvents(calendar.events);
      setAccount({
        provider: "google",
        via: "google",
        name: profile.email.split("@")[0],
        username: profile.email,
      });
      setSessionUnavailable(false);
      setLoading(false);
      if (autoAnalyze && fetched) await analyzeWeek(fetched, hours, generation);
    } catch (e) {
      if (generation === sessionGeneration.current) {
        setMailError(true);
        setSessionUnavailable(!expired);
        setError(e.message || "Impossible de charger Gmail ou Google Agenda.");
      }
    } finally {
      mailRunning.current = false;
      setLoading(false);
    }
  }
  async function connectGoogle() {
    if (!googleAuthReady) return;
    setError("");
    if (account?.provider === "microsoft") {
      setError("Déconnecte d’abord Outlook.");
      return;
    }
    setLoading(true);
    try {
      let user = firebaseAuth.currentUser;
      if (!user) {
        const result = await connectFirebase();
        user = result.user;
      }
      const token = await user.getIdToken();
      const session = await requestWithTimeout("/api/app-session?action=login", {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
      });
      if (!session.ok) throw new Error(session.status === 401 ? "Ce compte Google n’est pas autorisé." : "Impossible de préparer la connexion Google.");
      const start = await requestWithTimeout("/api/google?action=start", { method: "POST" });
      const data = await start.json().catch(() => ({}));
      if (!start.ok || typeof data.url !== "string") throw new Error(data.error || "Impossible de démarrer la connexion Google.");
      try {
        sessionStorage.setItem(googleReturnKey, routes[nav]);
      } catch {}
      window.location.assign(data.url);
    } catch (e) {
      setLoading(false);
      const messages = {
        "auth/popup-closed-by-user": "Connexion Google annulée.",
        "auth/popup-blocked": "La fenêtre de connexion Google n’a pas pu s’ouvrir. Réessaie depuis un onglet du navigateur.",
        "auth/web-storage-unsupported": "Le navigateur ne permet pas à Firebase d’accéder au stockage nécessaire à la connexion Google.",
        "auth/unauthorized-domain": "Ce domaine doit être autorisé dans la configuration de connexion Google de Smart Display.",
      };
      setError(messages[e?.code] || e.message || "Connexion Google impossible.");
    }
  }

  function onTouchStart(event) {
    resetSwipe();
    if (editingDashboard || showForm || event.currentTarget.querySelector('[aria-modal="true"]')) return;
    if (nav !== dashboard && nav !== "Paramètres") return;
    if (event.touches.length !== 1) return;
    const control = event.target.closest?.("button,a,input,select,textarea,label,[role=button],[role=link],[contenteditable],[data-no-swipe]");
    if (control && !(nav === dashboard && control.hasAttribute("data-widget-route"))) return;
    const { identifier, clientX, clientY } = event.touches[0];
    if (clientX < 24 || clientX > window.innerWidth - 24) return;
    swipeStart.current = { identifier, x: clientX, y: clientY };
  }
  function onTouchMove(event) {
    const start = swipeStart.current, touch = event.touches[0];
    if (!start || event.touches.length !== 1 || touch.identifier !== start.identifier) return;
    const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
    if (!start.dragging && Math.abs(dy) >= 12 && Math.abs(dy) >= Math.abs(dx)) {
      resetSwipe();
      return;
    }
    if (!start.dragging && (Math.abs(dx) < 10 || Math.abs(dx) < 1.5 * Math.abs(dy))) return;
    const direction = nav === dashboard ? -1 : 1;
    if (!start.dragging && dx * direction <= 0) return;
    start.dragging = true;
    if (!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      const offset = direction * Math.min(Math.max(0, dx * direction), window.innerWidth * 0.55);
      swipePanel.current?.style.setProperty("--swipe-offset", `${offset}px`);
    }
  }
  function resetSwipe(animate = false) {
    swipeStart.current = null;
    const panel = swipePanel.current;
    const offset = panel?.style.getPropertyValue("--swipe-offset");
    panel?.style.removeProperty("--swipe-offset");
    if (animate && offset) {
      panel.animate?.(
        [{ transform: `translateX(${offset})` }, { transform: "translateX(0)" }],
        { duration: 190, easing: "ease-out" },
      );
    }
  }
  function onTouchEnd(event) {
    const start = swipeStart.current;
    const touch = Array.from(event.changedTouches).find(item => item.identifier === start?.identifier);
    if (!touch || event.touches.length || editingDashboard || showForm || event.currentTarget.querySelector('[aria-modal="true"]')) {
      resetSwipe(true);
      return;
    }
    const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
    const horizontalSwipe = Math.abs(dx) >= 64 && Math.abs(dx) >= 1.5 * Math.abs(dy);
    const destination = nav === dashboard && dx < 0 ? "Paramètres"
      : nav === "Paramètres" && dx > 0 ? dashboard : null;
    resetSwipe(!destination || !horizontalSwipe);
    if (!destination || !horizontalSwipe) return;
    if (event.cancelable) event.preventDefault();
    if (!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      swipeArrival.current = -Math.sign(dx) * Math.min(window.innerWidth * 0.3, 240);
    }
    navigate(destination);
  }

  async function disconnect() {
    sessionGeneration.current++;
    try {
      if (account?.via === "google") {
        const r = await fetch("/api/google?action=logout", { method: "POST" });
        if (!r.ok)
          throw new Error("Impossible de déconnecter cet appareil. Réessaie.");
      }
      if (msal && account?.provider === "microsoft")
        await msal.logoutPopup({
          account,
          mainWindowRedirectUri: window.location.origin,
        });
      sessionStorage.removeItem("pilotage.google.session.v1");
      sessionStorage.removeItem(analysisSessionKey);
      setAccount(null);
      setGoogleToken(null);
      analysesRef.current = {};
      setAnalyses({});
      setProgress(null);
      setMoreMessages(false);
      setMessages([]);
      setEvents([]);
      setMailError(false);
      setSessionUnavailable(false);
    } catch (e) {
      setError(e.message || "Impossible de déconnecter le compte.");
    }
  }
  async function getAnalysis(message, hours) {
    const response = await requestWithTimeout(
      "/api/analyze",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: message.id, hours }),
      },
      90000,
    );
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("Réponse du serveur invalide.");
    }
    if (!response.ok) {
      const e = new Error(data.error || "Analyse impossible.");
      e.code = data.code;
      e.status = response.status;
      throw e;
    }
    return data;
  }
  function importAnalysis(message, data) {
    if (imports.current.has(message.id)) return;
    const items = importedItems(message, data);
    setTasks((t) => mergeById(t, items.tasks));
    setLocalDeadlines((d) => mergeById(d, items.deadlines));
    imports.current.add(message.id);
    try {
      localStorage.setItem(
        "pilotage.imported.v1",
        JSON.stringify([...imports.current]),
      );
      localChanged();
    } catch {}
  }
  async function analyzeWeek(
    list = messages,
    hours = loadedHours,
    generation = sessionGeneration.current,
  ) {
    if (analysisRunning.current) return;
    const pending = list.filter((m) => !analysesRef.current[m.id]);
    if (!pending.length) {
      setProgress(null);
      return;
    }
    analysisRunning.current = true;
    setWeekRunning(true);
    setError("");
    setProgress({ done: 0, total: pending.length });
    let done = 0;
    const skipped = [];
    try {
      for (const message of pending) {
        if (generation !== sessionGeneration.current) break;
        try {
          const data = await getAnalysis(message, hours);
          if (generation !== sessionGeneration.current) break;
          importAnalysis(message, data);
          analysesRef.current = { ...analysesRef.current, [message.id]: data };
          setAnalyses(analysesRef.current);
          done++;
          setProgress({ done, total: pending.length });
        } catch (e) {
          if (generation !== sessionGeneration.current) break;
          if (
            [
              "EMAIL_EMPTY",
              "AI_OUTPUT_LIMIT",
              "AI_BLOCKED",
              "AI_INVALID",
            ].includes(e.code)
          ) {
            skipped.push(e.message);
            continue;
          }
          throw e;
        }
      }
      if (generation === sessionGeneration.current && skipped.length)
        setError(
          `${done} message(s) analysé(s), ${skipped.length} non analysé(s) : ${skipped[0]} Vérifiez-les manuellement ou relancez « Analyser les restants ».`,
        );
    } catch (e) {
      if (generation === sessionGeneration.current)
        setError(
          "Analyse interrompue après " +
            done +
            " message(s)" +
            (skipped.length ? " ; " + skipped.length + " non analysé(s)" : "") +
            " : " +
            (e.message || "délai dépassé.") +
            " Les résultats obtenus restent affichés.",
        );
    } finally {
      analysisRunning.current = false;
      setWeekRunning(false);
    }
  }
  function addTask(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setTasks((t) => [
      {
        id: crypto.randomUUID(),
        title: title.trim(),
        category,
        due,
        done: false,
      },
      ...t,
    ]);
    setTitle("");
    setDue("");
    setShowForm(false);
  }
  function toggle(id) {
    setTasks((t) => t.map((x) => (x.id === id ? { ...x, done: !x.done } : x)));
  }
  function remove(id) {
    setTasks((t) => t.filter((x) => x.id !== id));
  }
  const busyMail = checkingSession || loading;
  const displayMessages = messages;
  const internalEvents = localDeadlines.map((d) => ({
    id: d.id,
    subject: d.title,
    start: { dateTime: d.date + "T12:00:00" },
    end: { dateTime: d.date + "T23:59:59" },
    isLocal: true,
    time: d.time,
    location: { displayName: d.origin + " · générée par IA" },
  }));
  const displayEvents = [...events, ...internalEvents].sort(
    (a, b) => new Date(a.start?.dateTime) - new Date(b.start?.dateTime),
  );
  const visibleEvents = displayEvents.filter(
    (e) =>
      e.isLocal ||
      new Date(e.end?.dateTime || e.start?.dateTime).getTime() >= Date.now(),
  );
  const openTasks = tasks.filter((t) => !t.done),
    shownTasks =
      nav === "Échéances"
        ? tasks
            .filter((t) => t.due && !t.done)
            .sort((a, b) => a.due.localeCompare(b.due))
        : tasks;
  const late = openTasks.filter(
    (t) => t.due && t.due < dateISO(new Date()),
  ).length;
  const filteredMessages = displayMessages.filter((m) =>
    `${m.subject || ""} ${m.from?.emailAddress?.name || ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const nextAgenda = nav === dashboard
    ? agendaDays(events, localDeadlines, homeNow).find(({ day }) => day >= dateISO(homeNow))?.entries[0]
    : null;
  const homeWidgets = nav === dashboard ? {
    briefing: {
      icon: Sparkles,
      preview: <DashboardBriefing onOpen={() => navigate("Briefing intelligent", "briefing")}
        received={account?.provider === "google" && !mailError && !busyMail ? messages.length : null}
        processed={messages.filter((message) => analyses[message.id]).length}
        completed={tasks.length - openTasks.length} open={openTasks.length} />,
    },
    agenda: {
      icon: CalendarDays,
      preview: <DashboardAgenda onOpen={() => navigate("Agenda", "agenda")}
        item={nextAgenda && {
          title: nextAgenda.title,
          when: [prettyDue(nextAgenda.day), nextAgenda.start
            ? time(nextAgenda.start) : nextAgenda.deadline?.time].filter(Boolean).join(" · "),
        }} />,
    },
    monthlyCalendar: {
      icon: CalendarDays,
      preview: <DashboardCalendar now={homeNow} items={calendarItems(localDeadlines, tasks, events)}
        onOpen={() => navigate("Calendrier mensuel", "monthlyCalendar")} />,
    },
    statEmails: {
      icon: Mail,
      preview: <Stat icon={Mail} label="E-mails récents" tone="purple"
        value={busyMail || !account || mailError ? "—" : displayMessages.length}
        sub={account?.provider === "google"
          ? `${loadedHours} dernières heures · Emmaüs` : "Expéditeurs @emmaus-scherwiller.fr"}
        route={routes["E-mails"]} widget="statEmails" onOpen={() => navigate("E-mails", "statEmails")} />,
    },
    statAgenda: {
      icon: CalendarDays,
      preview: <Stat icon={CalendarDays} label="Rendez-vous à venir" tone="blue"
        value={busyMail || (mailError && account?.provider === "microsoft") ? "—" : visibleEvents.length}
        sub="Agenda de l’application"
        route={routes.Agenda} widget="statAgenda" onOpen={() => navigate("Agenda", "statAgenda")} />,
    },
    statTasks: {
      icon: CheckSquare,
      preview: <Stat icon={CheckSquare} label="Tâches en cours" tone="orange" value={openTasks.length}
        sub="À garder à l’œil" route={routes.Tâches} widget="statTasks"
        onOpen={() => navigate("Tâches", "statTasks")} />,
    },
    statLate: {
      icon: Clock3,
      preview: <Stat icon={Clock3} label="Échéances dépassées" tone="green" value={late}
        sub={late ? "À traiter en priorité" : "Tout est à jour"} route={routes.Échéances} widget="statLate"
        onOpen={() => navigate("Échéances", "statLate")} />,
    },
    weather: {
      icon: CloudSun,
      preview: <Weather city={weatherCity} unit={widgetSettings.weatherUnit}
        refreshMinutes={widgetSettings.weatherRefresh} compact onOpen={() => navigate("Météo", "weather")} />,
    },
    exchangeRates: {
      icon: ArrowDownUp,
      preview: <ExchangeRates compact onOpen={() => navigate("Devises", "exchangeRates")} />,
    },
    clock: {
      icon: Clock3,
      preview: <Clock compact onOpen={() => navigate("Horloge", "clock")} />,
    },
    ...Object.fromEntries(extraWidgets.map(([id, destination, icon, label = destination]) => [id, {
      icon,
      preview: <DashboardTile id={id} route={routes[destination]} icon={icon} label={label}
        onOpen={() => navigate(destination, id)} />,
    }])),
    timer: {
      icon: TimerIcon,
      preview: <TimerTile timer={timerControls.timer} onOpen={() => navigate("Minuteur", "timer")} />,
    },
  } : null;
  const sectionTitle = {
    "E-mails": "Mes e-mails",
    Agenda: "Mon agenda",
    Tâches: "Mes tâches",
    Échéances: "Mes échéances",
  }[nav] || nav;
  const showMailError = error && googleReturnRoutes.includes(routes[nav]);
  return (
    <div
      className={
        "app display-shell " +
        (nav === dashboard ? "dashboard-home" : "dashboard-section")
      }
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={() => resetSwipe(true)}
    >
      <main
        ref={swipePanel}
        className={nav === dashboard || nav === "Paramètres" ? "main swipe-panel" : "main"}
      >
        <div className={nav === "Paramètres" ? "content settings-page" : "content"}>
          {nav !== dashboard && (
            <header className={nav === "Paramètres" ? "display-page-heading settings-page-heading" : "display-page-heading"}>
              <button type="button" className={nav === "Paramètres" ? "settings-back" : "detail-back"}
                onClick={() => navigate(dashboard)} aria-label="Tableau de bord">
                <ArrowLeft size={22} aria-hidden="true" /><span className="sr-only">Tableau de bord</span>
              </button>
              <h1 ref={pageHeading} tabIndex={-1}>{sectionTitle}</h1>
              {(nav === "Tâches" || nav === "Échéances") && (
                <button className="primary" type="button" onClick={() => setShowForm(true)}>
                  <Plus size={17} aria-hidden="true" /> Nouvelle tâche
                </button>
              )}
            </header>
          )}
          {nav !== "Paramètres" && ["connecting", "working", "waiting"].includes(syncStatus) && (
            <Loading
              label={
                syncStatus === "waiting"
                  ? "Synchronisation en attente de connexion…"
                  : "Synchronisation de tes données…"
              }
              className="sync-loading-banner"
            />
          )}
          {showMailError && (
            <div className="error" role="alert">
              <AlertCircle size={17} />
              <span>{error}</span>
              <button onClick={() => setError("")} aria-label="Fermer">
                <X size={16} />
              </button>
            </div>
          )}
          {!busyMail &&
            !account &&
            !sessionUnavailable &&
            (nav === "E-mails" || nav === "Agenda") && (
              <div className="demo-banner">
                <span>
                  Ta messagerie n’est pas connectée. Tes notes et tes tâches
                  restent accessibles.
                </span>
                <button type="button" onClick={connectGoogle} disabled={!googleAuthReady}>
                  {googleConnectLabel} <ArrowUpRight size={15} />
                </button>
              </div>
            )}
          {nav === "Paramètres" && (
            <section className="settings-panel settings-card" aria-labelledby="settings-accounts-title">
              <h2 id="settings-accounts-title">Comptes</h2>
              <div className="settings-service-list">
                <div className="settings-service">
                  <div className="settings-service-icon" aria-hidden="true">
                    <Mail size={19} />
                  </div>
                  <div className="settings-service-copy">
                    <h3>Google</h3>
                    <p>
                      {account?.provider === "google" ? account.username
                        : checkingSession ? "Vérification…"
                        : sessionUnavailable ? "Vérification indisponible"
                        : "Gmail et Google Agenda"}
                    </p>
                  </div>
                  {account?.provider === "google" ? (
                    <button className="secondary" type="button" onClick={disconnect} aria-label="Déconnecter Google">
                      <LogOut size={15} aria-hidden="true" /> Déconnecter
                    </button>
                  ) : (
                    <button className="primary" type="button" onClick={connectGoogle} disabled={busyMail || !googleAuthReady || !!account}>
                      {googleConnectLabel}
                    </button>
                  )}
                </div>
                <div className="settings-service">
                  <div className="settings-service-icon" aria-hidden="true">
                    <CalendarDays size={19} />
                  </div>
                  <div className="settings-service-copy">
                    <h3>Outlook professionnel</h3>
                    <p>
                      {account?.provider === "microsoft" ? account.username
                        : msal ? "Messagerie et calendrier"
                        : "Configuration Microsoft requise"}
                    </p>
                  </div>
                  {account?.provider === "microsoft" ? (
                    <button className="secondary" type="button" onClick={disconnect} aria-label="Déconnecter Outlook">
                      <LogOut size={15} aria-hidden="true" /> Déconnecter
                    </button>
                  ) : msal && (
                    <button className="secondary" type="button" onClick={connect} disabled={busyMail || !!account}>
                      Connecter Outlook
                    </button>
                  )}
                </div>
              </div>
              {account && <p className="settings-hint">Déconnecte le compte actuel pour changer de messagerie.</p>}
              <details className="settings-disclosure" data-no-swipe>
                <summary>Autorisations de messagerie</summary>
                <div className="settings-disclosure-body">
                  <p>Google autorise la lecture de Gmail et du calendrier principal. La session dure jusqu’à 30 jours. La déconnexion ferme la session sur cet appareil.</p>
                  {!msal && <p>Un administrateur doit configurer Outlook dans Microsoft Entra ID et autoriser la lecture des e-mails et du calendrier.</p>}
                </div>
              </details>
            </section>
          )}
          {nav === "Paramètres" && (
            <section className="settings-panel settings-display-card" aria-labelledby="settings-display-title">
              <h2 id="settings-display-title">Affichage</h2>
              <div className="settings-service">
                <div className="settings-service-icon"><Pencil size={19} aria-hidden="true" /></div>
                <div className="settings-service-copy">
                  <h3>Disposition de l’accueil</h3>
                  <p>Déplacer et redimensionner les tuiles.</p>
                </div>
                <button className="secondary" type="button" onClick={() => {
                  navigate(dashboard);
                  setEditingDashboard(true);
                }}>Modifier la grille</button>
              </div>
            </section>
          )}
          <WidgetSettings
            shown={nav === "Paramètres"}
            settings={widgetSettings}
            city={weatherCity}
            onSave={saveSettings}
            saveError={widgetSaveError}
            actionsTarget={settingsActionsTarget}
          />
          {nav === "Paramètres" && (
            <div ref={setSettingsActionsTarget} className="settings-page-actions" />
          )}
          <React.Suspense fallback={nav === "Paramètres" ? <Loading label="Chargement de la synchronisation…" /> : null}>
            <SyncAccount
              visible={nav === "Paramètres"}
              onApplied={refreshLocal}
              onStatusChange={setSyncStatus}
            />
          </React.Suspense>
          {nav !== "Paramètres" && (
            <>
              {homeWidgets && (
                <DashboardGrid date={homeNow} visible={visible} widgets={homeWidgets}
                  editing={editingDashboard} onEditingChange={setEditingDashboard}
                  onOpenSettings={(id) => navigate("Paramètres", id)} />
              )}
              {nav === "Minuteur" && <TimerPage {...timerControls} />}
              {nav === "Calendrier mensuel" && (
                <MonthlyCalendar
                  deadlines={localDeadlines}
                  tasks={tasks}
                  events={events}
                  provider={account?.provider}
                  loading={busyMail}
                  syncStatus={syncStatus}
                  onOpenAgenda={() => navigate("Agenda")}
                  onOpenTasks={() => navigate("Tâches")}
                />
              )}
              {nav === "Notes rapides" && <QuickNotes />}
              {nav === "Liens utiles" && <UsefulLinks />}
              {nav === "Briefing intelligent" && (
                <section className="card weekly-card">
                  <div className="card-head">
                    <div>
                      <div className="section-kicker">
                        BRIEFING INTELLIGENT
                      </div>
                      <h2>
                        Résumé des {loadedHours} dernières heures{" "}
                        <span className="count">
                          {busyMail || !account || mailError
                            ? "—"
                            : account.provider === "google"
                              ? messages.length
                              : 0}
                        </span>
                      </h2>
                      <p>
                        Messages reçus sur les {loadedHours} dernières
                        heures depuis @emmaus-scherwiller.fr
                      </p>
                    </div>
                    {account?.provider === "google" && (
                      <button
                        className="primary"
                        onClick={() => analyzeWeek()}
                        disabled={
                          loading ||
                          weekRunning ||
                          !messages.some((m) => !analyses[m.id])
                        }
                      >
                        <Sparkles size={15} />
                        {weekRunning
                          ? "Analyse en cours…"
                          : Object.keys(analyses).length
                            ? "Analyser les restants"
                            : `Analyser les ${loadedHours} heures`}
                      </button>
                    )}
                  </div>
                  <div className="weekly-body">
                    <div className="privacy-note">
                      Après « Actualiser » ou en lançant l’analyse, le
                      contenu des messages est envoyé à Google Gemini.
                      Vérifiez que votre organisation l’autorise. Les
                      actions et dates reconnues sont ajoutées localement
                      aux tâches et à l’agenda. Résultats IA à vérifier.
                    </div>
                    {busyMail ? (
                      <Loading
                        label="Chargement des messages…"
                        className="weekly-empty"
                      />
                    ) : sessionUnavailable ? (
                      <div className="weekly-empty">
                        Impossible de vérifier la connexion à la messagerie.
                      </div>
                    ) : !account ? (
                      <div className="weekly-empty">
                        Connectez Gmail pour afficher les messages.{" "}
                        <button
                          className="text-link"
                          onClick={connectGoogle}
                          disabled={!googleAuthReady}
                        >
                          {googleConnectLabel}{" "}
                          <ArrowUpRight size={14} />
                        </button>
                      </div>
                    ) : account?.provider !== "google" ? (
                      <div className="weekly-empty">
                        La synthèse IA est disponible avec Gmail.
                      </div>
                    ) : mailError ? (
                      <div className="weekly-empty">
                        Chargement des messages impossible. Consulte le
                        message d’erreur ci-dessus.
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="weekly-empty">
                        Aucun e-mail Emmaüs trouvé sur la période récupérée.
                      </div>
                    ) : (
                      <>
                        <div className="weekly-status">
                          {progress && weekRunning
                            ? `${progress.done} / ${progress.total} analyses effectuées`
                            : `${messages.length} e-mail${messages.length > 1 ? "s" : ""} reçu${messages.length > 1 ? "s" : ""} sur les ${loadedHours} dernières heures · ${messages.filter((m) => analyses[m.id]).length} résumé${messages.filter((m) => analyses[m.id]).length > 1 ? "s" : ""} disponible${messages.filter((m) => analyses[m.id]).length > 1 ? "s" : ""}`}{" "}
                          {moreMessages && (
                            <strong>
                              · Limite de 50 messages atteinte : tous les
                              messages ne sont pas inclus.
                            </strong>
                          )}
                        </div>
                        {messages.some((m) => analyses[m.id]) && (
                          <div className="weekly-digest">
                            <h3>En résumé</h3>
                            <ol>
                              {messages
                                .filter((m) => analyses[m.id])
                                .map((m) => (
                                  <li key={m.id}>
                                    <strong>
                                      {displaySender(
                                        m.from?.emailAddress?.name,
                                      )}
                                    </strong>{" "}
                                    — {analyses[m.id].resume}
                                    {analyses[m.id].truncated && (
                                      <small> · message tronqué</small>
                                    )}
                                  </li>
                                ))}
                            </ol>
                            {messages.some(
                              (m) => analyses[m.id]?.actions?.length > 0,
                            ) && (
                              <>
                                <h3>Actions à faire</h3>
                                <ul>
                                  {messages
                                    .filter((m) => analyses[m.id])
                                    .flatMap((m) =>
                                      analyses[m.id].actions.map((x, i) => (
                                        <li key={m.id + "a" + i}>
                                          {x}{" "}
                                          <span>
                                            —{" "}
                                            {displaySender(
                                              m.from?.emailAddress?.name,
                                            )}
                                          </span>
                                        </li>
                                      )),
                                    )}
                                </ul>
                              </>
                            )}
                            {messages.some(
                              (m) => analyses[m.id]?.echeances?.length > 0,
                            ) && (
                              <>
                                <h3>Échéances à retenir</h3>
                                <ul>
                                  {messages
                                    .filter((m) => analyses[m.id])
                                    .flatMap((m) =>
                                      analyses[m.id].echeances.map(
                                        (x, i) => (
                                          <li key={m.id + "d" + i}>
                                            {typeof x === "string"
                                              ? x
                                              : x.description}{" "}
                                            <span>
                                              —{" "}
                                              {displaySender(
                                                m.from?.emailAddress?.name,
                                              )}
                                              {typeof x === "object" &&
                                              !x.date
                                                ? " · date à vérifier"
                                                : typeof x === "object"
                                                  ? " · date reconnue"
                                                  : ""}
                                            </span>
                                          </li>
                                        ),
                                      ),
                                    )}
                                </ul>
                              </>
                            )}
                            <small>
                              Résumés générés par IA : vérifiez les
                              informations importantes dans les e-mails
                              d’origine.
                            </small>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </section>
              )}
              {nav === "Météo" && (
                <>
                  <Weather
                    city={weatherCity}
                    unit={widgetSettings.weatherUnit}
                    refreshMinutes={widgetSettings.weatherRefresh}
                  />
                  <div className="settings-page weather-settings">
                    <WidgetSettings
                      shown
                      weatherOnly
                      settings={widgetSettings}
                      city={weatherCity}
                      onSave={saveSettings}
                      saveError={widgetSaveError}
                      actionsTarget={settingsActionsTarget}
                    />
                    <div ref={setSettingsActionsTarget} className="settings-page-actions" />
                  </div>
                </>
              )}
              {nav === "Devises" && <ExchangeRates />}
              {nav === "Horloge" && <Clock />}
              {(nav === "E-mails" || nav === "Agenda") && (
                <div className="columns single">
                  {nav === "E-mails" && (
                    <section className="card">
                      <div className="card-head">
                        <div>
                          <div className="section-kicker">
                            VOTRE BOÎTE DE RÉCEPTION
                          </div>
                          <h2>E-mails récents</h2>
                          <p>
                            Expéditeurs @emmaus-scherwiller.fr{" "}
                            {account?.provider === "google"
                              ? `· ${loadedHours} dernières heures`
                              : ""}
                          </p>
                        </div>
                        {account && (
                          <button
                            className="secondary"
                            onClick={() =>
                              account.provider === "google"
                                ? googleSync(true)
                                : sync(account)
                            }
                            disabled={loading || weekRunning}
                          >
                            <RefreshCw size={15} /> Actualiser
                          </button>
                        )}
                      </div>
                      <div className="search">
                        <Search size={17} />
                        <input
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Rechercher dans les messages chargés"
                        />
                      </div>
                      <div className="list">
                        {busyMail && (
                          <Loading
                            label="Chargement des e-mails…"
                            className="empty"
                          />
                        )}
                        {!busyMail &&
                          filteredMessages
                            .slice(0, 50)
                            .map((m) => (
                              <div className="mail-row" key={m.id}>
                                <div
                                  className={
                                    "mail-avatar " + (!m.isRead ? "unread" : "")
                                  }
                                >
                                  {(m.from?.emailAddress?.name || "?")
                                    .charAt(0)
                                    .toUpperCase()}
                                </div>
                                <div className="mail-body">
                                  <div className="row-top">
                                    <strong>
                                      {m.from?.emailAddress?.name ||
                                        "Expéditeur inconnu"}
                                    </strong>
                                    <time>
                                      {fmt(m.receivedDateTime, {
                                        day: "numeric",
                                        month: "short",
                                      })}
                                    </time>
                                  </div>
                                  <div className="mail-subject">
                                    {m.subject || "(Sans objet)"}
                                  </div>
                                  <p>
                                    {m.bodyPreview ||
                                      "Aucun aperçu disponible."}
                                  </p>
                                </div>
                                {!m.isRead && <span className="unread-dot" />}
                              </div>
                            ))}
                        {!busyMail && !filteredMessages.length && (
                          <Empty
                            text={
                              sessionUnavailable
                                ? "Impossible de vérifier la connexion à la messagerie."
                                : !account
                                  ? "Connecte ta messagerie pour voir tes e-mails."
                                  : mailError
                                    ? "Impossible de charger les e-mails."
                                    : "Aucun e-mail à afficher."
                            }
                          />
                        )}
                      </div>
                    </section>
                  )}
                  {nav === "Agenda" && (
                    <AgendaEvents
                      events={events}
                      deadlines={localDeadlines}
                      provider={account?.provider}
                      loading={busyMail}
                      error={(account?.provider === "microsoft" ? mailError : agendaError) || sessionUnavailable}
                      onRefresh={account && !weekRunning
                        ? () => account.provider === "google" ? googleSync(false) : sync(account)
                        : undefined}
                      onRemoveDeadline={(id) =>
                        setLocalDeadlines((items) => items.filter((item) => item.id !== id))
                      }
                    />
                  )}
                </div>
              )}
              {(nav === "Tâches" || nav === "Échéances") && (
                <section className="card task-card">
                  <div className="card-head">
                    <div>
                      <div className="section-kicker">RESTEZ ORGANISÉ</div>
                      <h2>
                        {nav === "Échéances"
                          ? "Échéances à suivre"
                          : "Mes tâches"}{" "}
                        <span className="count">{openTasks.length}</span>
                      </h2>
                      <p>
                        {nav === "Échéances"
                          ? "Vos tâches avec une date limite."
                          : "Vos priorités, au même endroit."}
                      </p>
                    </div>
                    <button
                      className="text-link"
                      onClick={() => setShowForm(true)}
                    >
                      Ajouter une tâche{" "}
                      <ArrowUpRight size={15} />
                    </button>
                  </div>
                  <div className="task-list">
                    {shownTasks
                      .slice(0, 100)
                      .map((t) => (
                        <div
                          className={"task-row " + (t.done ? "done" : "")}
                          key={t.id}
                        >
                          <button
                            className={"checkbox " + (t.done ? "checked" : "")}
                            onClick={() => toggle(t.id)}
                            aria-label={
                              t.done
                                ? "Marquer comme à faire"
                                : "Marquer comme terminée"
                            }
                          >
                            {t.done && <Check size={13} />}
                          </button>
                          <span className="task-title">
                            {t.title}
                            {t.origin && (
                              <small className="task-origin">
                                {t.origin} · générée par IA
                              </small>
                            )}
                          </span>
                          <span className="category">{t.category}</span>
                          <span
                            className={
                              "due " +
                              (t.due && t.due < dateISO(new Date()) && !t.done
                                ? "overdue"
                                : "")
                            }
                          >
                            <Clock3 size={14} /> {prettyDue(t.due)}
                          </span>
                          <button
                            className="remove"
                            onClick={() => remove(t.id)}
                            aria-label="Supprimer la tâche"
                          >
                            <X size={15} />
                          </button>
                        </div>
                      ))}
                    {shownTasks.length === 0 && (
                      <div className="empty-task">
                        <CheckSquare size={21} />
                        <div>
                          <strong>Tout est clair pour le moment</strong>
                          <p>
                            Ajoutez votre première tâche pour commencer à vous
                            organiser.
                          </p>
                        </div>
                        <button
                          className="secondary"
                          onClick={() => setShowForm(true)}
                        >
                          <Plus size={15} /> Ajouter
                        </button>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </main>
      {!showForm && !editingDashboard && (
        <nav className="display-dock" aria-label="Navigation principale">
          {dockItems.map(([destination, Icon, secondary]) => {
            const isSettings = destination === "Paramètres";
            const label = destination === dashboard ? "Accueil" : destination;
            return (
              <button key={destination} type="button" data-secondary={secondary || undefined}
                className={isSettings ? "display-tab desktop-settings-shortcut" : "display-tab"}
                ref={isSettings ? settingsShortcut : undefined}
                aria-label={isSettings && nav === dashboard ? "Ouvrir les paramètres" : label}
                aria-current={nav === destination ? "page" : undefined} title={label}
                onClick={() => navigate(destination, isSettings ? "settingsShortcut" : undefined)}>
                <Icon size={26} aria-hidden="true" />
                <span className="sr-only">{label}</span>
              </button>
            );
          })}
        </nav>
      )}
      {timerControls.timer.status === "finished" && (
        <TimerAlert onDismiss={() => timerControls.dispatch({ type: "reset" })} />
      )}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <form
            className="modal"
            onSubmit={addTask}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <div className="section-kicker">ORGANISATION</div>
                <h2>Nouvelle tâche</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowForm(false)}
                aria-label="Fermer"
              >
                <X size={19} />
              </button>
            </div>
            <label>
              Intitulé
              <input
                autoFocus
                required
                maxLength={150}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex. Vérifier les sauvegardes"
              />
            </label>
            <label>
              Catégorie
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option>Support</option>
                <option>Infrastructure</option>
                <option>Administration</option>
                <option>Projet</option>
                <option>Autre</option>
              </select>
            </label>
            <label>
              Échéance <span>(facultatif)</span>
              <input
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setShowForm(false)}
              >
                Annuler
              </button>
              <button className="primary" type="submit">
                Créer la tâche
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
function Stat({ route, widget, icon: Icon, label, value, sub, tone, onOpen }) {
  return (
    <button type="button" className="stat" data-widget-route={route} data-widget-id={widget} onClick={onOpen}
      aria-label={`Ouvrir ${label}, ${value === "—" ? "compteur indisponible" : value}`}>
      <div className="stat-top">
        <span className={"stat-icon " + tone}>
          <Icon size={19} />
        </span>
        <ArrowUpRight size={15} className="stat-arrow" />
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-sub">{sub}</div>
    </button>
  );
}
function Empty({ text }) {
  return (
    <div className="empty">
      <Inbox size={23} />
      {text}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
  });
}
