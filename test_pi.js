/* Exercise the actual offline app, including keyboard input and persistent π state. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const digits = html.match(/var PI_DIGITS='([0-9]+)'/)[1];
assert.equal(digits.length, 1000);
assert.equal(crypto.createHash('sha256').update(digits).digest('hex'),
  '808b01bd3137f0fd50877c7ad44b2a97478666390780372803859749172292bd');
const key = 'nem_pi_practice_v1';
const windows = [];
async function boot(seed = {}) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(e.message));
  const dom = new JSDOM(html, {
    url: 'https://morse.local/index.html', runScripts: 'dangerously',
    pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      Object.keys(seed).forEach(k => w.localStorage.setItem(k, seed[k]));
      w.addEventListener('error', e => errors.push(e.message));
      w.HTMLCanvasElement.prototype.getContext = () => null;
      w.Audio = function () { this.pause = this.load = this.addEventListener = () => {}; };
      w.Image = function () {
        Object.defineProperty(this, 'src', { set: () => queueMicrotask(() => this.onload && this.onload()) });
      };
      w.fetch = async url => {
        const file = path.join(__dirname, new URL(String(url), w.location.href).pathname);
        return { ok: fs.existsSync(file), status: fs.existsSync(file) ? 200 : 404,
          text: async () => fs.readFileSync(file, 'utf8') };
      };
    }
  });
  const w = dom.window;
  windows.push(w);
  for (let i = 0; i < 100 && !w.document.getElementById('bootScreen').classList.contains('hide'); i++) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.ok(w.document.getElementById('bootScreen').classList.contains('hide'), 'offline boot');
  return { w, errors, $: id => w.document.getElementById(id),
    state: () => JSON.parse(w.localStorage.getItem(key)),
    digit: d => w.document.querySelector('[data-pi-digit="' + d + '"]').click(),
    press: (value, opts = {}) => w.document.dispatchEvent(new w.KeyboardEvent('keydown', {key:value, bubbles:true, cancelable:true, ...opts})) };
}
(async () => {
  const app = await boot();
  app.$('btnPiStart').click();
  assert.ok(app.$('view-pi').classList.contains('active'));
  app.digit('1');
  assert.equal(app.state().position, 1);
  assert.equal(app.state().best, 1);
  app.digit('0');
  assert.equal(app.state().position, 1, 'wrong input cannot advance');
  assert.equal(app.state().errors, 1);
  app.$('btnPiHint').click();
  assert.match(app.$('piCue').textContent, /Следующая цифра — 4/);
  app.press('4');
  assert.equal(app.state().position, 2);
  assert.equal(app.state().best, 1, 'errors/hints cannot grow the clean record');
  app.press('Backspace');
  assert.equal(app.state().position, 1);
  app.press('4', {ctrlKey:true});
  assert.equal(app.state().position, 1, 'keyboard shortcuts are ignored');
  app.$('btnPiRestart').click();
  assert.equal(app.state().position, 0);
  assert.equal(app.state().best, 1, 'restart preserves record');
  for (const digit of digits.slice(0, 5)) app.press(digit);
  const seed = Object.fromEntries(Array.from({length:app.w.localStorage.length}, (_, i) => {
    const name = app.w.localStorage.key(i); return [name, app.w.localStorage.getItem(name)];
  }));
  const restored = await boot(seed);
  assert.ok(restored.$('view-pi').classList.contains('active'), 'resume π without resetting word state');
  assert.equal(restored.state().position, 5);
  assert.equal(restored.state().best, 5);
  restored.$('btnPiHint').click();
  restored.press('2');
  assert.equal(restored.state().best, 5, 'hinted digit does not inflate record');
  restored.$('btnPiRestart').click();
  for (const digit of digits) restored.digit(digit);
  assert.equal(restored.state().position, 1000);
  assert.equal(restored.state().best, 1000);
  assert.equal(restored.state().errors, 0);
  assert.match(restored.$('piCue').textContent, /Все 1 000 цифр/);
  assert.ok(restored.$('btnPiHint').disabled);
  assert.equal(restored.w.document.querySelectorAll('[data-pi-digit]:disabled').length, 10);
  assert.ok(restored.$('piEntered').textContent.length < 70, 'long prefixes stay bounded on mobile');
  restored.press('1');
  assert.equal(restored.state().position, 1000, 'completion ignores additional digits');
  restored.press('Escape');
  assert.ok(restored.$('view-home').classList.contains('active'));
  restored.press('1');
  assert.equal(restored.state().position, 1000, 'keyboard is inactive outside π');
  const corrupt = await boot({[key]:JSON.stringify({schemaVersion:1,position:-20,best:'invalid',errors:0,hints:0,clean:true})});
  corrupt.$('btnPiStart').click();
  assert.equal(corrupt.$('piPosition').textContent, '0');
  assert.equal(corrupt.$('piBest').textContent, '0');
  corrupt.w.Storage.prototype.setItem = () => { throw new Error('quota'); };
  corrupt.digit('1');
  assert.equal(corrupt.$('piPosition').textContent, '1', 'storage failure cannot stop practice');
  assert.deepEqual([...app.errors,...restored.errors,...corrupt.errors], []);
  console.log('Pi: verified 1000 digits, input, mistakes, hints, record, undo, restart, resume, completion and corrupt storage passed.');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; })
  .finally(() => windows.forEach(w => w.close()));
