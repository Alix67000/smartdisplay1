export const WEATHER_CITY_KEY='pilotage.weather.city.v1';
export function cityIsValid(city){return !!city&&typeof city.name==='string'&&city.name.length>0&&city.name.length<=150&&Number.isFinite(city.latitude)&&city.latitude>=-90&&city.latitude<=90&&Number.isFinite(city.longitude)&&city.longitude>=-180&&city.longitude<=180}
export function cityLabel(c){return [c.name,c.admin1,c.country].filter(Boolean).join(', ')}
export function weatherDescription(code){if(code===0)return ['Ciel dégagé','sun'];if([1,2].includes(code))return ['Éclaircies','cloud-sun'];if(code===3)return ['Couvert','cloud'];if([45,48].includes(code))return ['Brouillard','cloud'];if([51,53,55,56,57].includes(code))return ['Bruine','rain'];if([61,63,65,66,67,80,81,82].includes(code))return ['Pluie','rain'];if([71,73,75,77,85,86].includes(code))return ['Neige','snow'];if([95,96,99].includes(code))return ['Orage','storm'];return ['Conditions indisponibles','cloud']}

async function requestWeatherJson(url, signal) {
 const controller = new AbortController();
 const abort = () => controller.abort();
 if (signal?.aborted) abort();
 else signal?.addEventListener('abort', abort, {once: true});

 let timedOut = false;
 const timeout = setTimeout(() => {
  timedOut = true;
  abort();
 }, 12000);

 try {
  const response = await fetch(url, {signal: controller.signal});
  if (!response.ok) throw Error('weather_request_failed');
  return await response.json();
 } catch (error) {
  if (timedOut) throw Error('weather_timeout');
  throw error;
 } finally {
  clearTimeout(timeout);
  signal?.removeEventListener('abort', abort);
 }
}

export async function findCities(name, signal) {
 const query = new URLSearchParams({name: name.trim(), count: '10', language: 'fr', format: 'json'});
 const data = await requestWeatherJson('https://geocoding-api.open-meteo.com/v1/search?' + query, signal);
 return (Array.isArray(data.results) ? data.results : []).filter(cityIsValid)
  .map(({id, name, admin1, country, latitude, longitude}) => ({
   id, name, admin1: admin1 || '', country: country || '', latitude, longitude,
  }));
}

export async function getWeather(city, signal) {
 if (!cityIsValid(city)) throw Error('invalid_city');
 const query = new URLSearchParams({
  latitude: String(city.latitude),
  longitude: String(city.longitude),
  current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day',
  daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
  hourly: 'temperature_2m,precipitation_probability,weather_code,rain,showers',
  forecast_days: '7',
  timezone: 'auto',
  timeformat: 'unixtime',
 });
 const data = await requestWeatherJson('https://api.open-meteo.com/v1/forecast?' + query, signal);
 if (!Number.isFinite(data.current?.temperature_2m) || !Number.isFinite(data.current.time) ||
     !Array.isArray(data.daily?.time) || !Number.isFinite(data.utc_offset_seconds) || !data.timezone) {
  throw Error('weather_invalid');
 }
 // Reject an invalid time zone before rendering with Intl.
 new Intl.DateTimeFormat('fr-FR', {timeZone: data.timezone});
 return data;
}

export function nextWeatherHours({current, hourly}) {
 const lastHour = current.time + 24 * 60 * 60;
 if (!Array.isArray(hourly?.time)) return [];
 return hourly.time.flatMap((time, index) => {
  if (!Number.isFinite(time) || time <= current.time || time > lastHour) return [];
  const rain = hourly.rain?.[index];
  const showers = hourly.showers?.[index];
  return [{
   time,
   code: hourly.weather_code?.[index],
   temperature: hourly.temperature_2m?.[index],
   precipitationProbability: hourly.precipitation_probability?.[index],
   rainAmount: Number.isFinite(rain) && Number.isFinite(showers) ? rain + showers : null,
  }];
 });
}

export function temperature(n,unit){return Number.isFinite(n)?Math.round(unit==='fahrenheit'?n*9/5+32:n)+'°':'—'}
