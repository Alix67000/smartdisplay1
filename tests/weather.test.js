import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cityIsValid,cityLabel,weatherDescription,findCities,getWeather,nextWeatherHours} from '../src/widgets/weather.js';
const city={id:1,name:'Ville fictive',admin1:'Région',country:'France',latitude:48.1,longitude:7.1};
test('ville, libellé et codes météo',()=>{assert.ok(cityIsValid(city));assert.equal(cityIsValid({...city,latitude:91}),false);assert.equal(cityIsValid({}),false);assert.equal(cityLabel(city),'Ville fictive, Région, France');assert.equal(weatherDescription(0)[0],'Ciel dégagé');assert.equal(weatherDescription(95)[0],'Orage');assert.equal(weatherDescription(999)[0],'Conditions indisponibles')});
test('recherche et prévisions sans clé, réponses contrôlées', async () => {
 const original = globalThis.fetch;
 const requests = [];
 try {
  globalThis.fetch = async url => {
   requests.push(new URL(url));
   return {
    ok: true,
    json: async () => requests.length === 1 ? {results: [city, {name: 'Invalide'}]} : {
     current: {temperature_2m: 17, weather_code: 0, time: 1794034800},
     daily: {time: [1794006000]},
     timezone: 'Europe/Paris',
     utc_offset_seconds: 3600,
    },
   };
  };
  const results = await findCities(' Ville fictive ');
  assert.equal(results.length, 1);
  assert.equal(results[0].name, city.name);
  const data = await getWeather(results[0]);
  assert.equal(data.current.temperature_2m, 17);
  assert.equal(requests[0].hostname, 'geocoding-api.open-meteo.com');
  const forecastQuery = requests[1].searchParams;
  assert.equal(forecastQuery.get('timezone'), 'auto');
  assert.equal(forecastQuery.get('timeformat'), 'unixtime');
  assert.equal(forecastQuery.get('forecast_days'), '7');
  assert.equal(forecastQuery.get('hourly'), 'temperature_2m,precipitation_probability,weather_code,rain,showers');
  await assert.rejects(() => getWeather({latitude: 500}));
  globalThis.fetch = async () => ({ok: false});
  await assert.rejects(() => findCities('Ville'));
  await assert.rejects(() => getWeather(city));
 } finally {
  globalThis.fetch = original;
 }
});

test('les 24 heures à venir traversent minuit et gardent les mesures alignées', () => {
 const first = Date.parse('2026-11-07T22:00:00Z') / 1000;
 const time = Array.from({length: 28}, (_, i) => first + i * 3600);
 const forecast = {
  current: {time: first + 1800},
  hourly: {
   time,
   weather_code: [0, 61, 3],
   temperature_2m: [8, 7, 6],
   precipitation_probability: [0, 60, null],
   rain: [0, 0.4, null],
   showers: [0, 0.1, null],
  },
 };
 const hours = nextWeatherHours(forecast);
 assert.equal(hours.length, 24);
 assert.deepEqual(hours[0], {time: time[1], code: 61, temperature: 7, precipitationProbability: 60, rainAmount: 0.5});
 assert.equal(hours[1].precipitationProbability, null);
 assert.equal(hours[1].rainAmount, null);
 assert.equal(hours.at(-1).time, time[24]);
 assert.equal(nextWeatherHours({...forecast, hourly: undefined}).length, 0);
});

test('les deux requêtes expirent et une annulation volontaire reste distincte', async t => {
 t.mock.timers.enable({apis: ['setTimeout']});
 t.mock.method(globalThis, 'fetch', (_, {signal}) => new Promise((_resolve, reject) => {
  if (signal.aborted) reject(signal.reason);
  else signal.addEventListener('abort', () => reject(signal.reason), {once: true});
 }));

 for (const request of [() => findCities('Strasbourg'), () => getWeather(city)]) {
  const failure = assert.rejects(request(), /weather_timeout/);
  t.mock.timers.tick(12000);
  await failure;
 }

 const controller = new AbortController();
 const pending = findCities('Strasbourg', controller.signal);
 controller.abort();
 await assert.rejects(pending, {name: 'AbortError'});
});
