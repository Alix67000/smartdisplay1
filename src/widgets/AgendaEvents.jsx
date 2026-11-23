import React, {useId} from 'react';
import {CalendarDays, MapPin, RefreshCw, X} from 'lucide-react';
import {agendaDays, localDay} from './calendar.js';
import Loading from './Loading.jsx';
import './agenda-events.css';

const providers = {google: 'Google Agenda', microsoft: 'Outlook'};
const fullDate = new Intl.DateTimeFormat('fr-FR', {
 weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
});
const clock = new Intl.DateTimeFormat('fr-FR', {hour: '2-digit', minute: '2-digit'});
const shortDateAndTime = new Intl.DateTimeFormat('fr-FR', {
 day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});

function EventTime({entry}) {
 const {deadline, start, end, day} = entry;
 if (deadline?.time) return <time dateTime={deadline.time}>{deadline.time}</time>;
 if (!start) return 'Toute la journée';

 const beganEarlier = localDay(start) !== day;
 const startLabel = beganEarlier ? 'En cours' : (
  <time dateTime={start.toISOString()}>{clock.format(start)}</time>
 );
 return (
  <>
   {startLabel}
   {end && (
    <>
     {beganEarlier ? ' · jusqu’à ' : ' – '}
     <time dateTime={end.toISOString()}>
      {localDay(end) === day ? clock.format(end) : shortDateAndTime.format(end)}
     </time>
    </>
   )}
  </>
 );
}

function AgendaDay({group, today, onRemoveDeadline}) {
 const {day, entries} = group;
 return (
  <div className="agenda-day">
   <h3>
    {day === today && 'Aujourd’hui · '}
    <time dateTime={day}>{fullDate.format(new Date(day + 'T12:00:00Z'))}</time>
   </h3>
   <ul className="agenda-entries" role="list">
    {entries.map(entry => (
     <li className="agenda-entry" key={entry.key}>
      <div className="agenda-entry-time"><EventTime entry={entry} /></div>
      <div className="agenda-entry-detail">
       <strong>{entry.title}</strong>
       {entry.location && <span><MapPin size={14} aria-hidden="true" /> {entry.location}</span>}
       {entry.deadline && (
        <span>Échéance interne{entry.deadline.origin && ' · ' + entry.deadline.origin}</span>
       )}
      </div>
      {entry.deadline && onRemoveDeadline && (
       <button type="button" className="remove" onClick={() => onRemoveDeadline(entry.deadline.id)} aria-label={'Supprimer l’échéance « ' + entry.title + ' »'}>
        <X size={16} aria-hidden="true" />
       </button>
      )}
     </li>
    ))}
   </ul>
  </div>
 );
}

export default function AgendaEvents({
 events = [], deadlines = [], provider, loading = false, error = false, onRefresh, onRemoveDeadline,
}) {
 const titleId = useId();
 const now = new Date();
 const today = localDay(now);
 const groups = agendaDays(events, deadlines, now);
 const upcoming = groups.filter(group => group.day >= today);
 const overdue = groups.filter(group => group.day < today).reverse();
 const hasUpcomingEvents = upcoming.some(group => group.entries.some(entry => !entry.deadline));
 const source = providers[provider];

 return (
  <section className="card agenda-events" aria-labelledby={titleId}>
   <div className="card-head">
    <div>
     <h2 id={titleId}>Mon agenda</h2>
     <p>{source ? source + ' et échéances internes' : 'Échéances internes'}</p>
    </div>
    {onRefresh && (
     <button type="button" className="secondary agenda-refresh" onClick={onRefresh} disabled={loading}>
      <RefreshCw size={15} aria-hidden="true" /> Actualiser
     </button>
    )}
   </div>
   <div className="event-list agenda-feed">
    {loading ? <Loading label="Chargement de l’agenda…" /> : (
     <div role="status">
      {error ? (
       <p className="agenda-status agenda-status-error">
        Impossible d’actualiser les rendez-vous.
        {hasUpcomingEvents && ' Les derniers rendez-vous chargés restent affichés.'}
       </p>
      ) : !source ? (
       <p className="agenda-status">
        Connectez Google Agenda ou Outlook dans Paramètres pour afficher vos rendez-vous.
       </p>
      ) : !hasUpcomingEvents && (
       <p className="agenda-status">Aucun rendez-vous à venir dans les données chargées.</p>
      )}
     </div>
    )}
    {upcoming.map(group => (
     <AgendaDay key={group.day} group={group} today={today} onRemoveDeadline={onRemoveDeadline} />
    ))}
    {overdue.length > 0 && (
     <details className="agenda-overdue">
      <summary>Échéances dépassées</summary>
      {overdue.map(group => (
       <AgendaDay key={group.day} group={group} today={today} onRemoveDeadline={onRemoveDeadline} />
      ))}
     </details>
    )}
   </div>
   <div className="calendar-note">
    <CalendarDays size={16} aria-hidden="true" /> Échéances internes · synchronisation selon les paramètres
   </div>
  </section>
 );
}
