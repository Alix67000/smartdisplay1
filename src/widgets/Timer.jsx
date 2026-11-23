import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { BellRing, Pause, Play, RotateCcw, Timer as TimerIcon } from "lucide-react";
import { formatTimer, readTimer, remainingTime, TIMER_KEY, TIMER_PRESETS, updateTimer } from "./timer.js";
import { DashboardTile } from "./DashboardGrid.jsx";

export function useTimer() {
  const [timer, setTimer] = useState(readTimer);
  const [saveError, setSaveError] = useState(false);
  const volatileTimer = useRef(null);

  const dispatch = useCallback((action) => {
    const current = volatileTimer.current || readTimer();
    const next = updateTimer(current, action);
    if (next !== current) {
      try {
        localStorage.setItem(TIMER_KEY, JSON.stringify(next));
        volatileTimer.current = null;
        setSaveError(false);
      } catch {
        volatileTimer.current = next;
        setSaveError(true);
      }
    }
    setTimer(next);
  }, []);

  useEffect(() => {
    function sync(event) {
      if (event.key === TIMER_KEY || event.key === null) {
        volatileTimer.current = null;
        setSaveError(false);
        setTimer(readTimer());
      }
    }
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const deadline = timer.endsAt;
  useEffect(() => {
    if (!deadline) return;
    let timeout;
    function checkExpiry() {
      clearTimeout(timeout);
      const delay = deadline - Date.now();
      if (delay <= 0) dispatch({ type: "expire" });
      else timeout = setTimeout(checkExpiry, Math.min(delay, 2_147_483_647));
    }
    checkExpiry();
    window.addEventListener("pageshow", checkExpiry);
    document.addEventListener("visibilitychange", checkExpiry);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("pageshow", checkExpiry);
      document.removeEventListener("visibilitychange", checkExpiry);
    };
  }, [deadline, dispatch]);

  return { timer, dispatch, saveError };
}

function TimerValue({ timer }) {
  const [, refresh] = useState(0);
  const deadline = timer.endsAt;
  useEffect(() => {
    if (!deadline) return;
    let timeout;
    function tick() {
      clearTimeout(timeout);
      refresh((count) => count + 1);
      const remaining = deadline - Date.now();
      if (remaining > 0) timeout = setTimeout(tick, remaining % 1000 || 1000);
    }
    tick();
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [deadline]);
  return <span>{formatTimer(remainingTime(timer))}</span>;
}

export function TimerTile({ timer, onOpen }) {
  return (
    <DashboardTile id="timer" route="minuteur" icon={TimerIcon} tone="tone-timer"
      label={timer.status === "paused" ? "Minuteur · en pause" : "Minuteur"}
      value={<TimerValue timer={timer} />} onOpen={onOpen} />
  );
}

const statusLabel = {
  idle: "Prêt à démarrer",
  running: "En cours",
  paused: "En pause",
  finished: "Terminé",
};

export default function TimerPage({ timer, dispatch, saveError }) {
  const running = timer.status === "running";
  const idle = timer.status === "idle";
  const finished = timer.status === "finished";
  const ActionIcon = running ? Pause : Play;
  return (
    <section className="card timer-page" aria-label="Compte à rebours">
      <div className="timer-readout">
        <span className="timer-symbol"><TimerIcon size={25} aria-hidden="true" /></span>
        <div className="timer-digits" role="timer"><TimerValue timer={timer} /></div>
        <p className="timer-status" role="status">{statusLabel[timer.status]}</p>
      </div>
      <fieldset className="timer-presets" disabled={!idle}>
        <legend>Durée</legend>
        <div>
          {TIMER_PRESETS.map((minutes) => (
            <button key={minutes} type="button" aria-pressed={timer.minutes === minutes}
              onClick={() => dispatch({ type: "preset", minutes })}>
              {minutes} min
            </button>
          ))}
        </div>
      </fieldset>
      <div className="timer-controls">
        <button type="button" className="timer-primary" disabled={finished}
          onClick={() => dispatch({ type: "toggle" })}>
          <ActionIcon size={18} aria-hidden="true" />
          {running ? "Mettre en pause" : timer.status === "paused" ? "Reprendre" : "Démarrer"}
        </button>
        <button type="button" className="secondary" disabled={idle}
          onClick={() => dispatch({ type: "reset" })}>
          <RotateCcw size={17} aria-hidden="true" /> Remettre à zéro
        </button>
      </div>
      {saveError && <p className="timer-save-error" role="status">Le minuteur ne pourra pas reprendre après un rechargement.</p>}
    </section>
  );
}

export function TimerAlert({ onDismiss }) {
  const dialogRef = useRef(null);
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);
  function dismiss() {
    dialogRef.current.close();
    onDismiss();
  }
  return (
    <dialog ref={dialogRef} className="timer-alert" role="alertdialog" aria-modal="true"
      aria-labelledby="timer-alert-title" onCancel={(event) => { event.preventDefault(); dismiss(); }}>
      <div>
        <span className="timer-symbol"><BellRing size={34} aria-hidden="true" /></span>
        <h2 id="timer-alert-title">Minuteur terminé</h2>
        <button type="button" className="timer-primary" onClick={dismiss}>Fermer l’alerte</button>
      </div>
    </dialog>
  );
}
