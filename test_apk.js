/* Run the JavaScript shipped in the APK against its own offline assets.
   This checks web assets; it does not execute Android WebView/native cache code. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert/strict');
const { execFileSync } = require('child_process');
const { JSDOM, VirtualConsole } = require('jsdom');

const apk = path.resolve(process.argv[2] || path.join(__dirname, 'No1EqualsMe.apk'));
assert.ok(fs.existsSync(apk), 'Build the current APK first: python3 android/build.py --sdk <Android SDK>');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'no1-apk-'));
execFileSync('unzip', ['-q', apk, '-d', tmp]);
const www = path.join(tmp, 'assets', 'www');
const read = p => fs.readFileSync(path.join(www, p), 'utf8');
const HTML = read('index.html');
const STATE_KEY = 'no1equalsme_state_v2';
const CACHE_KEY = 'nem_content_cache_v1';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const windows = [];
let passed = 0;
function check(name, value) {
  assert.ok(value, name);
  passed++;
  console.log('✓ ' + name);
}
async function waitFor(predicate, label) {
  for (let i = 0; i < 150; i++) {
    if (predicate()) return;
    await sleep(20);
  }
  throw new Error('Timed out: ' + label);
}

function boot({ seed = {}, wordsFail = false, legacyWebView = false } = {}) {
  const errors = [];
  const requests = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(e.message));
  vc.on('error', (...args) => errors.push(args.join(' ')));
  const dom = new JSDOM(HTML, {
    url: 'https://morse.local/index.html',
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.Math.random = () => 0;
      if (legacyWebView) {
        w.String.prototype.padStart = undefined;
        w.AbortController = undefined;
      }
      Object.keys(seed).forEach(k => w.localStorage.setItem(k, seed[k]));
      w.addEventListener('error', e => errors.push(e.message));
      w.HTMLCanvasElement.prototype.getContext = () => null;
      const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {},
        exponentialRampToValueAtTime() {}, cancelScheduledValues() {} });
      w.AudioContext = class {
        constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
        resume() { return Promise.resolve(); }
        createOscillator() { return { frequency: param(), connect() {}, start() {}, stop() {} }; }
        createGain() { return { gain: param(), connect() {} }; }
      };
      w.Audio = function () {
        this.play = () => Promise.resolve(); this.pause = this.load = this.addEventListener = () => {};
      };
      w.Image = function () {
        Object.defineProperty(this, 'src', {
          set: value => { this._src = value; queueMicrotask(() => this.onload && this.onload()); },
          get: () => this._src || ''
        });
      };
      w.URL.createObjectURL = () => 'blob:offline-test';
      w.URL.revokeObjectURL = () => {};
      w.fetch = async function (input) {
        const url = new URL(String(input), w.location.href);
        requests.push(url.href);
        // Exact origin and path matching catches paths the old substring mock hid.
        assert.equal(url.origin, 'https://morse.local', 'APK requested an external resource');
        const relative = decodeURIComponent(url.pathname).replace(/^\//, '');
        const file = path.resolve(www, relative);
        assert.ok(file.startsWith(www + path.sep), 'APK asset path escaped its root');
        if ((wordsFail && relative === 'data/words.json') || !fs.existsSync(file)) {
          return { ok: false, status: 404, text: async () => '' };
        }
        const bytes = fs.readFileSync(file);
        return { ok: true, status: 200, text: async () => bytes.toString('utf8'),
          blob: async () => new w.Blob([bytes]) };
      };
    }
  });
  windows.push(dom.window);
  const w = dom.window;
  return { w, errors, requests, $: id => w.document.getElementById(id),
    state: () => JSON.parse(w.localStorage.getItem(STATE_KEY) || '{}') };
}

(async () => {
  check('APK index matches the reviewed source', fs.readFileSync(path.join(__dirname, 'index.html')).equals(fs.readFileSync(path.join(www, 'index.html'))));
  for (const name of ['words.json', 'morse-signs.json', 'languages.json', 'stenography.json', 'stenography-akopyan.json']) {
    check('APK data matches source: ' + name,
      fs.readFileSync(path.join(__dirname, 'data', name)).equals(fs.readFileSync(path.join(www, 'data', name))));
  }
  const words = JSON.parse(read('data/words.json'));
  check('All 1500 packaged words have definitions', words.cards.length === 1500 && words.cards.every(c => c.word && (c.definitionShort || c.definitionFull)));
  for (const name of ['morse-signs.json', 'languages.json', 'stenography.json', 'stenography-akopyan.json']) {
    const cards = JSON.parse(read('data/' + name)).cards;
    const refs = cards.flatMap(c => [c.image, c.audio, c.svg, c.png].filter(Boolean));
    check('All packaged media exists: ' + name,
      refs.length > 0 && refs.every(ref => fs.existsSync(path.join(www, ref.replace(/^\.\//, '')))));
  }

  const first = boot();
  await waitFor(() => first.$('bootScreen').classList.contains('hide'), 'offline boot');
  check('First offline launch loads all 1500 words', first.$('dictCount').textContent === '1500' && first.errors.length === 0);
  check('Offline launch writes the full dictionary cache', JSON.parse(first.w.localStorage.getItem(CACHE_KEY)).cards.length === 1500);
  check('Offline launch requests the canonical packaged dictionary', first.requests.includes('https://morse.local/data/words.json'));
  first.$('btnStart').click();
  await waitFor(() => first.state().view === 'session', 'word session');
  const cardId = first.state().queue[0];
  check('Word session starts with an actual dictionary card', words.cards.some(c => c.id === cardId));
  first.$('btnYes').click();
  await waitFor(() => first.state().sessionResults[cardId].done, 'saved answer');
  const stateAfter = first.state();
  check('Answer advances the word and saves its result', stateAfter.cards[cardId].currentStep > 0 && stateAfter.sessionResults[cardId].done);
  const seed = {};
  Object.keys(first.w.localStorage).forEach(k => { seed[k] = first.w.localStorage.getItem(k); });
  first.w.close();

  const restored = boot({ seed, wordsFail: true });
  await waitFor(() => restored.$('bootScreen').classList.contains('hide'), 'cached boot');
  await sleep(100);
  check('Missing dictionary file still boots from local cache', restored.$('dictCount').textContent === '1500' && /Локальная копия/.test(restored.$('dictSourceText').textContent));
  check('Restart preserves word progress and session',
    JSON.stringify(restored.state().cards) === JSON.stringify(stateAfter.cards) &&
    JSON.stringify(restored.state().sessionResults) === JSON.stringify(stateAfter.sessionResults));
  check('Restart produces no JavaScript errors', restored.errors.length === 0);
  check('Pi is visible on the main screen without expanding extra sections', !restored.$('btnPiStart').closest('#secMore'));
  restored.$('btnPiStart').click();
  for (const digit of '14159') restored.w.document.querySelector('[data-pi-digit="' + digit + '"]').click();
  const pi = JSON.parse(restored.w.localStorage.getItem('nem_pi_practice_v1'));
  check('Packaged Pi mode works fully offline and saves progress',
    restored.$('view-pi').classList.contains('active') && pi.position === 5 && pi.best === 5);
  check('Pi practice preserves the existing word progress',
    JSON.stringify(restored.state().cards) === JSON.stringify(stateAfter.cards));

  const legacy = boot({ legacyWebView: true });
  await waitFor(() => legacy.$('bootScreen').classList.contains('hide'), 'legacy WebView boot');
  check('Older WebView boots without String.padStart or AbortController', legacy.$('dictCount').textContent === '1500' && legacy.errors.length === 0);
  legacy.$('btnStart').click();
  await waitFor(() => legacy.state().view === 'session', 'legacy word session');
  legacy.$('btnYes').click();
  await waitFor(() => Object.values(legacy.state().sessionResults).some(r => r.done), 'legacy saved answer');
  check('Older WebView starts a word session and saves answers', legacy.state().queue.length > 0 && legacy.errors.length === 0);

  const failed = boot({ wordsFail: true });
  await waitFor(() => !failed.$('btnBootRetry').hidden, 'first-launch failure');
  check('Missing dictionary without a cache exposes retry', !failed.$('bootScreen').classList.contains('hide') && /Словарь не загрузился/.test(failed.$('bootTitle').textContent));
  console.log('APK: ' + passed + ' checks passed');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(() => {
  windows.forEach(w => w.close());
  fs.rmSync(tmp, { recursive: true, force: true });
});
