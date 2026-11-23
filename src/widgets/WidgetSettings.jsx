import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Mail, MapPin } from 'lucide-react';
import Loading from './Loading.jsx';
import CitySearch from './CitySearch.jsx';
import { widgetDefinitions } from './settings.js';
import { cityLabel } from './weather.js';
import './settings-page.css';

const widgetGroups = [
  ['Indicateurs', widgetDefinitions.filter(([key]) => key.startsWith('stat'))],
  ['Widgets et blocs', widgetDefinitions.filter(([key]) => !key.startsWith('stat') && key !== 'weather')],
];

export default function WidgetSettings({ settings, city, onSave, shown, saveError, actionsTarget, weatherOnly = false }) {
  const [draft, setDraft] = useState(settings);
  const [draftCity, setDraftCity] = useState(city);
  const [baseline, setBaseline] = useState({ settings, city });
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const cancelRef = useRef(null);
  const dialogRef = useRef(null);
  const noticeRef = useRef(null);
  const savingRef = useRef(false);
  const mounted = useRef(true);
  const changedElsewhere = JSON.stringify({ settings, city }) !== JSON.stringify(baseline);
  const saved = notice.startsWith('Enregistrement effectué');

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!dirty) {
      setDraft(settings);
      setDraftCity(city);
      setBaseline({ settings, city });
    }
  }, [settings, city, dirty]);

  useEffect(() => {
    if (!dirty) return;
    const warn = event => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    if (!confirming) return;
    const prior = document.activeElement;
    cancelRef.current?.focus();

    function handleKey(event) {
      if (event.key === 'Escape' && !savingRef.current) {
        event.preventDefault();
        setConfirming(false);
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const controls = [...dialogRef.current.querySelectorAll('button:not(:disabled)')];
      if (!controls.length) {
        event.preventDefault();
      } else if (event.shiftKey && document.activeElement === controls[0]) {
        event.preventDefault();
        controls.at(-1).focus();
      } else if (!event.shiftKey && document.activeElement === controls.at(-1)) {
        event.preventDefault();
        controls[0].focus();
      }
    }

    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      if (prior?.isConnected && !prior.disabled) prior.focus();
      else noticeRef.current?.focus();
    };
  }, [confirming]);

  useEffect(() => {
    if (!shown && !saving) setConfirming(false);
  }, [shown, saving]);

  function editSettings(next) {
    setDraft(next);
    setDirty(true);
    setNotice('');
  }

  function editCity(next) {
    setDraftCity(next);
    setDirty(true);
    setNotice('');
  }

  function resetDraft() {
    setDraft(settings);
    setDraftCity(city);
    setBaseline({ settings, city });
    setDirty(false);
    setNotice('');
  }

  const changes = [];
  if (draft.emailHours !== baseline.settings.emailHours) changes.push(`Période des e-mails : ${draft.emailHours} h`);
  if (draft.weatherUnit !== baseline.settings.weatherUnit) changes.push(`Température : ${draft.weatherUnit === 'celsius' ? '°C' : '°F'}`);
  if (draft.weatherRefresh !== baseline.settings.weatherRefresh) changes.push(`Météo : ${draft.weatherRefresh ? `actualisation toutes les ${draft.weatherRefresh} min` : 'actualisation manuelle'}`);
  if (JSON.stringify(draftCity) !== JSON.stringify(baseline.city)) changes.push(`Ville : ${draftCity ? cityLabel(draftCity) : 'aucune'}`);
  for (const [key, label] of widgetDefinitions) {
    if (draft.visible[key] !== baseline.settings.visible[key]) {
      changes.push(`${label} : ${draft.visible[key] ? 'affiché' : 'masqué'}`);
    }
  }

  async function save() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    // Display the progress state before accessing storage.
    await new Promise(resolve => {
      const timer = setTimeout(resolve, 200);
      requestAnimationFrame(() => { clearTimeout(timer); resolve(); });
    });
    if (!mounted.current) return;

    try {
      const result = onSave(draft, draftCity, baseline);
      if (result.ok) {
        setBaseline({ settings: draft, city: draftCity });
        setDirty(false);
        setNotice('Enregistrement effectué sur cet appareil.');
      } else {
        setNotice(result.message);
      }
    } catch {
      setNotice('Enregistrement impossible. Réessaie.');
    } finally {
      setConfirming(false);
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <section hidden={!shown} className="settings-panel widget-settings" aria-labelledby={weatherOnly ? "weather-settings-title" : "widgets-settings-title"}>
      <h2 id={weatherOnly ? "weather-settings-title" : "widgets-settings-title"}>{weatherOnly ? "Réglages météo" : "Widgets"}</h2>
      {saveError && !notice && (
        <p className="settings-alert" role="alert">Le dernier enregistrement a échoué. Vérifie le stockage de cet appareil.</p>
      )}
      {!weatherOnly && <details className="settings-disclosure" data-no-swipe>
        <summary>Visibilité sur le tableau de bord</summary>
        <div className="settings-disclosure-body settings-widget-groups">
          {widgetGroups.map(([group, definitions]) => (
            <fieldset key={group}>
              <legend>{group}</legend>
              {definitions.map(([key, label]) => (
                <label className="widget-toggle" key={key}>
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={draft.visible[key]}
                    onChange={event => editSettings({ ...draft, visible: { ...draft.visible, [key]: event.target.checked } })}
                  />
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      </details>}
      <div className={weatherOnly ? "settings-widget-option" : "settings-widget-options"}>
        {!weatherOnly && <div className="settings-widget-option">
          <h3 className="settings-option-heading">
            <span className="settings-service-icon" aria-hidden="true"><Mail size={19} /></span>
            E-mails
          </h3>
          <label className="settings-field">
            Période à récupérer
            <select aria-label="Période à récupérer" value={draft.emailHours} onChange={event => editSettings({ ...draft, emailHours: Number(event.target.value) })}>
              <option value={2}>2 dernières heures</option>
              <option value={24}>24 dernières heures</option>
              <option value={48}>48 dernières heures</option>
              <option value={72}>72 dernières heures</option>
            </select>
          </label>
          <p className="settings-hint">À la prochaine actualisation, les messages récupérés sont transmis à Gemini pour l’analyse.</p>
        </div>}
        {weatherOnly && <div className="settings-widget-option">
          <label className="widget-toggle">
            <span>Afficher la météo sur le tableau de bord</span>
            <input
              type="checkbox"
              role="switch"
              checked={draft.visible.weather}
              onChange={event => editSettings({ ...draft, visible: { ...draft.visible, weather: event.target.checked } })}
            />
          </label>
          <p className="settings-current-city">
            <MapPin size={16} aria-hidden="true" />
            {draftCity ? cityLabel(draftCity) : 'Aucune ville sélectionnée'}
          </p>
          <CitySearch id="settings-weather-city" onChoose={editCity} />
          <div className="settings-weather-fields">
            <label className="settings-field">
              Unité de température
              <select value={draft.weatherUnit} onChange={event => editSettings({ ...draft, weatherUnit: event.target.value })}>
                <option value="celsius">Celsius (°C)</option>
                <option value="fahrenheit">Fahrenheit (°F)</option>
              </select>
            </label>
            <label className="settings-field">
              Actualisation automatique
              <select value={draft.weatherRefresh} onChange={event => editSettings({ ...draft, weatherRefresh: Number(event.target.value) })}>
                <option value={15}>Toutes les 15 min</option>
                <option value={30}>Toutes les 30 min</option>
                <option value={60}>Toutes les heures</option>
                <option value={0}>Manuelle</option>
              </select>
            </label>
          </div>
        </div>}
      </div>
      {dirty && changedElsewhere && (
        <div className="settings-alert settings-draft-conflict" role="alert">
          <p>Les réglages ont changé ailleurs. Recharge les réglages actuels pour éviter d’écraser une autre version.</p>
          <button type="button" className="secondary" onClick={resetDraft}>Abandonner mes modifications et recharger</button>
        </div>
      )}
      {shown && (
        <div className="settings-widget-footer">
          <div className="settings-save-panel">
            <p className="settings-hint" role="status">{dirty ? 'Modifications non enregistrées' : 'Réglages à jour sur cet appareil'}</p>
            <button type="button" className="primary settings-save-button" disabled={!dirty || changedElsewhere || saving} onClick={() => setConfirming(true)}>
              Enregistrer les modifications
            </button>
          </div>
          {notice && (
            <div
              ref={noticeRef}
              role="status"
              tabIndex={-1}
              className={saved ? 'settings-success' : 'settings-save-failure'}
            >
              {saved && <CheckCircle2 size={18} aria-hidden="true" />}
              <span>{notice}</span>
            </div>
          )}
        </div>
      )}
      {shown && actionsTarget && confirming && createPortal(
        <div className="settings-dialog-overlay" data-no-swipe>
          <div className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-dialog-title" aria-describedby="settings-dialog-description" ref={dialogRef}>
            <h2 id="settings-dialog-title">Confirmer les modifications ?</h2>
            <p id="settings-dialog-description">Les réglages seront enregistrés sur cet appareil.</p>
            {changes.length > 0 && (
              <ul className="settings-change-list">
                {changes.map(item => <li key={item}>{item}</li>)}
              </ul>
            )}
            {changedElsewhere && <p role="alert" className="settings-alert">Les réglages ont changé ailleurs. Annule et recharge les réglages avant de réessayer.</p>}
            {saving && <Loading label="Enregistrement en cours…" />}
            <div className="settings-dialog-actions">
              <button ref={cancelRef} type="button" className="secondary" disabled={saving} onClick={() => setConfirming(false)}>Annuler</button>
              <button type="button" className="primary" disabled={saving || changedElsewhere} onClick={save}>{saving ? 'Enregistrement…' : 'Oui, enregistrer'}</button>
            </div>
          </div>
        </div>,
        actionsTarget,
      )}
    </section>
  );
}
