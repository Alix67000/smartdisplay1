const assert = require('node:assert/strict');
const {test} = require('node:test');
const esbuild = require('esbuild');
const {JSDOM} = require('jsdom');

async function rendered(select, message) {
 for (let i = 0; i < 50; i++) {
  const found = select();
  if (found) return found;
  await new Promise(resolve => setTimeout(resolve, 20));
 }
 assert.fail(message);
}

test('la météo conserve la prévision du lieu courant et reprend après une panne', async () => {
 const bundle = await esbuild.build({
  stdin: {
   contents: [
    "import React, {useState} from 'react';",
    "import {createRoot} from 'react-dom/client';",
    "import Weather from './src/widgets/Weather.jsx';",
    "function App() { const [city, setCity] = useState(null); return <Weather city={city} onCityChange={setCity} refreshMinutes={0} />; }",
    "createRoot(document.getElementById('root')).render(<App />);",
   ].join('\n'),
   resolveDir: process.cwd(),
   loader: 'jsx',
  },
  bundle: true,
  write: false,
  loader: {'.css': 'empty'},
 });
 const {window} = new JSDOM('<div id="root"></div>', {
  url: 'https://example.test',
  runScripts: 'dangerously',
 });
 const firstHour = 1795424400;
 const city = {name: 'Lyon', latitude: 45.7, longitude: 4.8};
 const unknownCity = {name: 'Strasbourg', latitude: 48.58, longitude: 7.75};
 let searchFails = true;
 let forecastFails = false;
 window.fetch = async url => {
  if (new URL(url).hostname === 'geocoding-api.open-meteo.com') {
   if (searchFails) return {ok: false};
   return {ok: true, json: async () => ({results: [city, unknownCity]})};
  }
  if (forecastFails) return {ok: false};
  return {
   ok: true,
   json: async () => ({
    timezone: 'Europe/Paris',
    utc_offset_seconds: 3600,
    current: {time: firstHour, temperature_2m: 11, weather_code: 3},
    daily: {time: [firstHour]},
    hourly: {time: Array.from({length: 24}, (_, index) => firstHour + (index + 1) * 3600)},
   }),
  };
 };

 const document = window.document;
 const weather = selector => document.querySelector('.weather-card ' + selector);
 const refresh = () => weather('.weather-refresh');
 const clickReady = async (select, message) => (await rendered(() => {
  const element = select();
  return element && !element.disabled && element;
 }, message)).click();
 async function enterSearch(name) {
  const field = await rendered(() => weather('#weather-city'), 'Champ de recherche de ville');
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(field, name);
  field.dispatchEvent(new window.Event('input', {bubbles: true}));
  await clickReady(() => weather('.weather-search [type="submit"]'), 'Bouton de recherche');
 }

 try {
  window.eval(bundle.outputFiles[0].text);
  await enterSearch('Lyon');
  await rendered(() => weather('.weather-search [role="alert"]'), 'Échec du géocodage');
  searchFails = false;
  await clickReady(() => weather('.weather-search [type="submit"]'), 'Relancer le géocodage');
  (await rendered(() => weather('.weather-results button'), 'Proposition de Lyon')).click();
  await rendered(() => weather('.weather-hour:last-child'), 'Prévisions de Lyon');
  assert.equal(document.querySelectorAll('.weather-hour').length, 24);

  forecastFails = true;
  await clickReady(refresh, 'Actualiser Lyon');
  await rendered(() => refresh()?.textContent.trim() === 'Réessayer', 'Panne après une prévision');
  assert.equal(document.querySelectorAll('.weather-hour').length, 24);
  assert.match(weather('.weather-feedback').textContent, /dernières prévisions/);

  forecastFails = false;
  await clickReady(refresh, 'Réessayer la prévision de Lyon');
  await rendered(() => refresh()?.textContent.trim() === 'Actualiser' && !refresh().disabled, 'Reprise');
  assert.equal(weather('.weather-feedback'), null);
  assert.equal(document.querySelectorAll('.weather-hour').length, 24);

  forecastFails = true;
  weather('.weather-actions .text-link').click();
  await enterSearch('Strasbourg');
  (await rendered(() => weather('.weather-results button:nth-child(2)'), 'Proposition de Strasbourg')).click();
  await rendered(() => weather('.weather-feedback')?.textContent.includes('Météo indisponible'), 'Premier chargement en échec');
  assert.match(weather('.weather-head p').textContent, /Strasbourg/);
  assert.equal(document.querySelectorAll('.weather-hour').length, 0);
 } finally {
  window.close();
 }
});
