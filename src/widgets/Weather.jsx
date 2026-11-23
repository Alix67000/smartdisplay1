import React, {useEffect, useState} from 'react';
import {ArrowUpRight, Cloud, CloudLightning, CloudRain, CloudSnow, CloudSun, MapPin, RefreshCw, Sun} from 'lucide-react';
import {cityLabel, getWeather, nextWeatherHours, temperature, weatherDescription} from './weather.js';
import CitySearch from './CitySearch.jsx';
import './weather-detail.css';

const icons = {sun: Sun, 'cloud-sun': CloudSun, cloud: Cloud, rain: CloudRain, snow: CloudSnow, storm: CloudLightning};
const weekday = new Intl.DateTimeFormat('fr-FR', {weekday: 'short', timeZone: 'UTC'});
const millimeters = new Intl.NumberFormat('fr-FR', {maximumFractionDigits: 1});

function DailyForecast({daily, offset, unit, compact}) {
 const days = (
  <div className="weather-days">
   {daily.time.slice(0, compact ? 3 : undefined).map((day, i) => {
    const [label, key] = weatherDescription(daily.weather_code?.[i]);
    const DayIcon = icons[key];
    // Open-Meteo uses its response offset to define the dates of aggregated daily data.
    const date = new Date((day + offset) * 1000);
    return (
     <div className="weather-day" key={day}>
      <span>{i === 0 ? 'Aujourd’hui' : weekday.format(date)}</span>
      <DayIcon size={17} aria-label={label} />
      <strong>{temperature(daily.temperature_2m_max?.[i], unit)} <small>/ {temperature(daily.temperature_2m_min?.[i], unit)}</small></strong>
     </div>
    );
   })}
  </div>
 );
 return compact ? days : (
  <section className="weather-forecast">
   <h3>Prévisions sur 7 jours</h3>
   {days}
  </section>
 );
}

function HourlyForecast({data, city, unit, clock}) {
 const hours = nextWeatherHours(data);
 const dateLabel = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short', day: 'numeric', month: 'short', timeZone: data.timezone,
 });
 return (
  <section className="weather-forecast">
   <h3>Prochaines 24 heures</h3>
   <p className="weather-hours-zone">Heure locale · {city.name}</p>
   {hours.length ? (
    <ul className="weather-hours" role="list" tabIndex={0} aria-label="Prévisions heure par heure">
     {hours.map(({time, code, temperature: degrees, precipitationProbability, rainAmount}) => {
      const date = new Date(time * 1000);
      const [description, key] = weatherDescription(code);
      const Icon = icons[key];
      return (
       <li className="weather-hour" key={time}>
        <time dateTime={date.toISOString()}>
         <small>{dateLabel.format(date)}</small> {clock.format(date)}
        </time>
        <Icon size={20} aria-hidden="true" />
        <strong>{temperature(degrees, unit)}{Number.isFinite(degrees) && (unit === 'fahrenheit' ? 'F' : 'C')}</strong>
        <span>{description}</span>
        <span className="weather-hour-rain">Pluie {rainAmount === null ? '—' : millimeters.format(rainAmount) + ' mm'}</span>
        <span>Précipitations {Number.isFinite(precipitationProbability) ? precipitationProbability + ' %' : '—'}</span>
       </li>
      );
     })}
    </ul>
   ) : <p className="weather-state">Prévisions horaires indisponibles.</p>}
  </section>
 );
}

export default function Weather({city, onCityChange, unit = 'celsius', refreshMinutes = 30, compact = false, onOpen}) {
 const [editing, setEditing] = useState(false);
 const [result, setResult] = useState(null);
 const [loading, setLoading] = useState(false);
 const [refresh, setRefresh] = useState(0);

 useEffect(() => {
  if (!city) return;
  const controller = new AbortController();
  let fetching = false;
  async function load() {
   if (fetching) return;
   fetching = true;
   setLoading(true);
   try {
    const data = await getWeather(city, controller.signal);
    if (!controller.signal.aborted) setResult({city, data});
   } catch {
    if (!controller.signal.aborted) {
     setResult(previous => ({
      city,
      data: previous?.city === city ? previous.data : null,
      error: true,
     }));
    }
   } finally {
    fetching = false;
    if (!controller.signal.aborted) setLoading(false);
   }
  }

  load();
  const timer = refreshMinutes > 0 ? setInterval(load, refreshMinutes * 60 * 1000) : null;
  return () => {
   controller.abort();
   if (timer) clearInterval(timer);
  };
 }, [city, refresh, refreshMinutes]);

 function choose(nextCity) {
  onCityChange(nextCity);
  setEditing(false);
 }

 const cityResult = result?.city === city ? result : null;
 const data = cityResult?.data;
 const failed = cityResult?.error;
 const [description, icon] = weatherDescription(data?.current.weather_code);
 const Icon = icons[icon];
 const clock = data && new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit', minute: '2-digit', timeZone: data.timezone,
 });
 const current = data?.current;
 const wind = Number.isFinite(current?.wind_speed_10m) ? Math.round(current.wind_speed_10m) + ' km/h' : '—';

 return (
  <section className={'card weather-card ' + (compact ? 'compact' : '')} aria-labelledby="weather-title">
   <div className="weather-head">
    <div>
     <div className="section-kicker">VOTRE QUOTIDIEN</div>
     <h2 id="weather-title">Météo</h2>
     <p>{city ? <><MapPin size={13} aria-hidden="true" /> {cityLabel(city)}</> : 'Choisissez une ville pour afficher la météo.'}</p>
    </div>
    <div className="weather-actions">
     {compact ? <ArrowUpRight size={16} aria-hidden="true" /> : city && (
      <>
       {onCityChange && <button type="button" className="text-link" onClick={() => setEditing(!editing)}>
        {editing ? 'Fermer' : 'Changer de ville'}
       </button>}
       <button
        type="button"
        className="secondary weather-refresh"
        onClick={() => setRefresh(n => n + 1)}
        aria-label={failed ? 'Réessayer la météo' : 'Actualiser la météo'}
        disabled={loading}
       >
        <RefreshCw size={16} aria-hidden="true" />
        {failed ? 'Réessayer' : 'Actualiser'}
       </button>
      </>
     )}
    </div>
   </div>

   {!compact && onCityChange && (!city || editing) && <CitySearch onChoose={choose} />}
   <div className="weather-content">
    {city && ((loading && !data) || failed) && (
     <div className="weather-feedback" role="status">
      {loading && !data ? (
       <p className="weather-state">Chargement de la météo…</p>
      ) : (
       <p className="weather-error">{data
        ? compact ? 'Prévisions non actualisées.' : 'Actualisation impossible. Les dernières prévisions restent affichées.'
        : compact ? 'Météo indisponible.' : 'Météo indisponible. Vérifiez votre connexion et réessayez.'}</p>
      )}
     </div>
    )}
    {data && (
     <>
      <div className="weather-now">
       <div className="weather-symbol"><Icon size={36} aria-hidden="true" /></div>
       <div className="weather-temp">{temperature(current.temperature_2m, unit)}<small>{unit === 'fahrenheit' ? 'F' : 'C'}</small></div>
       <div className="weather-description">
        <strong>{description}</strong>
        <span>Ressenti {temperature(current.apparent_temperature, unit)} · Vent {wind}</span>
        <small>Actualisé à {clock.format(current.time * 1000)} (heure locale)</small>
       </div>
      </div>
      {!compact && <HourlyForecast data={data} city={city} unit={unit} clock={clock} />}
      <DailyForecast daily={data.daily} offset={data.utc_offset_seconds} unit={unit} compact={compact} />
     </>
    )}
   </div>
   {compact ? (
    <button type="button" className="weather-open" data-widget-id="weather" data-widget-route="meteo" aria-label="Ouvrir la météo" onClick={onOpen} />
   ) : (
    <div className="weather-credit">Données météo : <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> · températures arrondies</div>
   )}
  </section>
 );
}
