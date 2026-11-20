const assert = require('node:assert/strict');
const path = require('node:path');
const { webcrypto } = require('node:crypto');
const esbuild = require('esbuild');
const { JSDOM } = require('jsdom');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function until(check, message) {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (check()) return;
    await wait(20);
  }
  assert.fail(message);
}

async function run() {
  const bundle = await esbuild.build({
    entryPoints: ['src/main.jsx'],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    write: false,
    loader: { '.css': 'empty' },
    define: {
      'import.meta.env.VITE_MICROSOFT_CLIENT_ID': 'undefined',
      'import.meta.env.VITE_MICROSOFT_TENANT_ID': 'undefined',
    },
    plugins: [{
      name: 'firebase-fixtures',
      setup(build) {
        build.onResolve({ filter: /firebase-client\.js$/ }, () => ({
          path: path.resolve('tests/fixtures/firebase-auth.js'),
        }));
        build.onResolve({ filter: /firebase-db\.js$/ }, () => ({
          path: path.resolve('tests/fixtures/firebase-db.js'),
        }));
        build.onResolve({ filter: /^firebase\/firestore$/ }, () => ({
          path: path.resolve('tests/fixtures/firebase-firestore.js'),
        }));
      },
    }],
  });

  function openPage(url, setup = () => {}) {
    const dom = new JSDOM('<div id="root"></div>', {
      url: 'https://example.test/' + url,
      runScripts: 'dangerously',
      pretendToBeVisual: true,
    });
    const { window } = dom;
    window.fakeCloud = { data: new Map(), watchers: [] };
    window.structuredClone = structuredClone;
    window.TextEncoder = TextEncoder;
    Object.defineProperty(window, 'crypto', { value: webcrypto });
    Object.defineProperty(window.navigator, 'locks', { value: { request: async (name, options, callback) => callback() } });
    window.fetch = async url => ({
      ok: false,
      status: url === '/api/google?action=session' ? 401 : 503,
      json: async () => ({ error: 'Service indisponible' }),
    });
    setup(window);
    window.eval(bundle.outputFiles[0].text);
    return dom;
  }

  const destinations = [
    ['statEmails', 'emails', 'Mes e-mails', '.list'],
    ['statAgenda', 'agenda', 'Mon agenda', '.event-list'],
    ['statTasks', 'taches', 'Mes tâches', '.task-list'],
    ['statLate', 'echeances', 'Mes échéances', '.task-list'],
    ['weather', 'meteo', 'Météo', '.weather-card .weather-search'],
    ['exchangeRates', 'devises', 'Devises', '.exchange-card'],
    ['clock', 'horloge', 'Horloge', '.clock-page'],
    ['monthlyCalendar', 'calendrier', 'Calendrier mensuel', '.month-calendar'],
    ['notes', 'notes', 'Notes rapides', '.note-compose'],
    ['usefulLinks', 'liens', 'Liens utiles', '.links-form'],
    ['briefing', 'briefing', 'Briefing intelligent', '.weekly-card'],
    ['emails', 'emails', 'Mes e-mails', '.list'],
    ['agenda', 'agenda', 'Mon agenda', '.event-list'],
    ['tasks', 'taches', 'Mes tâches', '.task-list'],
  ];
  const dom = openPage('#/');
  const { window } = dom;
  const { document, history } = window;
  const tile = id => document.querySelector(`button[data-widget-id="${id}"]`);
  const at = (route, selector) => until(
    () => window.location.hash === '#/' + route && document.querySelector(selector),
    'Page attendue : ' + route,
  );
  try {
    await at('', '.home-extra-widgets');
    const inDashboard = () => document.querySelector('main');
    assert.equal(inDashboard().querySelectorAll('[data-widget-id]').length, 14);
    for (const [, , , selector] of destinations) assert(!inDashboard().querySelector(selector), selector);
    for (const [id, route, title, selector] of destinations) {
      assert(tile(id), 'Tuile manquante : ' + id);
      tile(id).click();
      await at(route, selector);
      assert.equal(document.querySelector('h1').textContent.trim(), title);
      assert(document.activeElement === document.querySelector('h1'), 'Focus sur le titre ' + title);
      document.querySelector('.detail-back').click();
      await at('', '.home-extra-widgets');
      assert(document.activeElement === tile(id), 'Focus sur la tuile ' + id);
    }

    tile('monthlyCalendar').click();
    await at('calendrier', '.month-agenda-actions');
    document.querySelector('.month-agenda-actions button').click();
    await at('agenda', '.event-list');
    history.back();
    await at('calendrier', '.month-calendar');
    history.forward();
    await at('agenda', '.event-list');
    document.querySelector('.detail-back').click();
    await at('', '.home-extra-widgets');
    assert(document.activeElement === tile('monthlyCalendar'), 'Focus sur le calendrier');
    history.forward();
    await at('calendrier', '.month-calendar');
    history.back();
    await at('', '.home-extra-widgets');
    assert(document.activeElement === tile('monthlyCalendar'), 'Focus sur le calendrier');

    const swipeStart = { identifier: 1, clientX: 250, clientY: 80 };
    const swipeEnd = { ...swipeStart, clientX: 110 };
    const agenda = tile('statAgenda');
    agenda.dispatchEvent(new window.TouchEvent('touchstart', { bubbles: true, touches: [swipeStart] }));
    agenda.dispatchEvent(new window.TouchEvent('touchmove', { bubbles: true, touches: [swipeEnd] }));
    const panel = document.querySelector('.swipe-panel');
    assert.equal(panel.style.getPropertyValue('--swipe-offset'), '-140px');
    const end = new window.TouchEvent('touchend', { bubbles: true, cancelable: true, changedTouches: [swipeEnd] });
    assert.equal(agenda.dispatchEvent(end), false);
    await at('parametres', '.settings-page');
    assert.equal(panel.style.getPropertyValue('--swipe-offset'), '');
    document.querySelector('.settings-back').click();
    await at('', '.home-extra-widgets');

    tile('emails').click();
    await at('emails', '.demo-banner');
    window.fakeGooglePopupError = Object.assign(new Error('Popup bloquée'), { code: 'auth/popup-blocked' });
    document.querySelector('.demo-banner button').click();
    await until(() => document.querySelector('.error[role="alert"]')?.textContent.includes('fenêtres surgissantes'),
      'Le blocage du popup doit être visible dans E-mails');
    assert.equal(window.location.hash, '#/emails');
    assert(document.querySelector('.demo-banner button'));
    window.fakeGooglePopupError = null;
    document.querySelector('.demo-banner button').click();
    await until(() => document.querySelector('.error[role="alert"]')?.textContent.includes('préparer la connexion Google'),
      'Le défaut de session doit être visible dans E-mails');
    assert.equal(window.location.hash, '#/emails');
  } finally {
    window.close();
  }

  for (const [url, expectedRoute] of [['#/notes', 'notes'], ['?google=refus', 'briefing']]) {
    const direct = openPage(url, window => {
      window.sessionStorage.setItem('pilotage.google.return.v1', 'briefing');
      window.localStorage.setItem('pilotage.widgets.v1', JSON.stringify({
        visible: { notes: false, statEmails: false, emails: true },
      }));
    });
    const { window } = direct;
    try {
      await until(() => window.location.hash === '#/' + expectedRoute
        && window.document.querySelector('.detail-back'), 'Lien direct ' + expectedRoute);
      if (expectedRoute === 'briefing') {
        assert.equal(window.location.search, '');
        assert.equal(window.sessionStorage.getItem('pilotage.google.return.v1'), null);
        await until(() => window.document.querySelector('.error')?.textContent.includes('refusée ou annulée'),
          'Le retour OAuth en échec doit être visible sur le briefing');
      }
      window.document.querySelector('.detail-back').click();
      await until(() => window.document.querySelector('.home-extra-widgets'), 'Retour depuis un lien direct');
      assert.equal(window.location.hash, '#/');
      assert.equal(window.document.querySelector('[data-widget-id="notes"]'), null);
      assert.equal(window.document.querySelector('[data-widget-id="statEmails"]'), null);
      assert(window.document.querySelector('[data-widget-id="emails"]'));
      assert(window.document.activeElement.matches('[data-widget-route]'));
    } finally {
      window.close();
    }
  }

  console.log('Navigation des 14 tuiles, focus, historique, swipe, liens directs et échecs Google OK');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
