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
async function boot(seed = {}, day = '2026-11-10') {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(e.message));
  const dom = new JSDOM(html, {
    url: 'https://morse.local/index.html', runScripts: 'dangerously',
    pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      const OriginalDate = w.Date;
      w.Date = class extends OriginalDate {
        constructor(...args) { super(...(args.length ? args : [day + 'T12:00:00'])); }
        static now() { return new OriginalDate(day + 'T12:00:00').getTime(); }
      };
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
function snapshot(app) {
  return Object.fromEntries(Array.from({length:app.w.localStorage.length}, (_, i) => {
    const name=app.w.localStorage.key(i); return [name,app.w.localStorage.getItem(name)];
  }));
}
function type(app, text) { for (const digit of text) app.digit(digit); }
function overview(app) { app.$('piOverviewBtn').click(); }
(async () => {
  const app=await boot();
  assert.equal(app.$('btnPiStart').closest('#secMore'),null);
  app.$('btnPiStart').click();
  assert.equal(app.$('piOverview').hidden,false);
  assert.equal(app.$('piPractice').hidden,true);
  assert.match(app.$('piStartBtn').textContent,/1–5/);
  app.$('piStartBtn').click();
  assert.equal(app.state().lesson.phase,'study');
  assert.equal(app.$('piKeys').hidden,true);
  assert.equal(app.$('piDigits').textContent,'14159');
  app.press('1');
  assert.equal(app.state().lesson.typed,'','study does not accept answers');
  app.press('Enter');
  assert.equal(app.state().lesson.phase,'recall');
  assert.equal(app.$('piDigits').textContent,'·····','hidden recall cannot leak the target');
  type(app,'14159');
  assert.equal(Object.keys(app.state().records).length,5);
  assert.equal(app.state().lesson.phase,'done');
  assert.equal(app.state().best,0,'lessons never inflate the full-prefix record');
  assert.equal(app.$('piProgress').textContent,'5 / 5');
  assert.ok(Object.values(app.state().records).every(r=>r.level===1&&r.due==='2026-11-11'));

  app.$('piNextBtn').click();
  assert.equal(app.state().lesson.start,5);
  assert.equal(app.$('piDigits').textContent,'26535');
  app.press('Enter'); type(app,'26535');
  assert.equal(app.state().lesson.phase,'bridge');
  assert.equal(Object.keys(app.state().records).length,5,'new block requires a sequence bridge');
  app.digit('0');
  assert.equal(app.state().lesson.phase,'study');
  assert.equal(app.$('piDigits').textContent,'1415926535');
  assert.equal(app.state().records[0].lapse,true);
  app.press('Enter'); type(app,'1415926535');
  assert.equal(app.state().lesson.phase,'done');
  assert.equal(Object.keys(app.state().records).length,10);
  assert.equal(app.$('piProgress').textContent,'5 / 5','bridge completion does not show 10/5');
  const resumed=await boot(snapshot(app));
  assert.equal(resumed.state().lesson.phase,'done');
  assert.equal(resumed.$('piProgress').textContent,'5 / 5','completed bridge survives restart');
  overview(resumed);
  resumed.w.document.querySelector('[data-pi-size="3"]').click();
  assert.equal(resumed.$('piLearned').textContent,'10','changing grouping preserves coverage');
  assert.equal(resumed.$('piMap').children.length,12,'map is paginated');
  resumed.w.document.querySelector('[data-pi-start="0"]').click();
  assert.equal(resumed.state().lesson.phase,'recall','known block starts with retrieval');
  type(resumed,'141');
  assert.equal(resumed.state().records[0].level,1,'same-day overlap cannot accelerate intervals');
  overview(resumed);
  resumed.w.document.querySelector('[data-pi-size="10"]').click();

  const review=await boot(snapshot(resumed),'2026-11-11'); overview(review);
  assert.equal(review.$('piDue').textContent,'10');
  assert.match(review.$('piStartBtn').textContent,/Повторить/);
  review.$('piStartBtn').click();
  assert.equal(review.state().lesson.phase,'recall','due review starts hidden');
  assert.equal(review.$('piDigits').textContent,'··········');
  type(review,digits.slice(0,10));
  assert.ok(Object.values(review.state().records).every(r=>r.level===2&&r.due==='2026-11-14'));
  overview(review); review.w.document.querySelector('[data-pi-start="0"]').click(); type(review,digits.slice(0,10));
  assert.equal(review.state().records[0].level,2);
  assert.equal(review.state().records[0].due,'2026-11-14');

  const mixedState=app.state();
  mixedState.size=10; mixedState.screen='overview'; mixedState.lesson=null;
  for(let i=5;i<10;i++) delete mixedState.records[i];
  const mixed=await boot({[key]:JSON.stringify(mixedState)},'2026-11-11');mixed.$('btnPiStart').click();mixed.$('piStartBtn').click();
  assert.equal(mixed.state().lesson.length,5,'review never includes unseen digits after resizing');
  type(mixed,'14159');
  assert.equal(Object.keys(mixed.state().records).length,5);

  const partial=await boot();partial.$('btnPiStart').click();partial.$('piStartBtn').click();partial.press('Enter');type(partial,'14');
  const partialRestart=await boot(snapshot(partial));
  assert.equal(partialRestart.state().lesson.typed,'14');
  type(partialRestart,'159');
  assert.equal(partialRestart.state().lesson.phase,'done');

  const old={schemaVersion:1,position:10,best:42,errors:0,hints:0,clean:true,hintAt:-1};
  const migration=await boot({[key]:JSON.stringify(old)});migration.$('btnPiStart').click();
  assert.equal(migration.$('piOverview').hidden,false);
  assert.equal(migration.$('piBest').textContent,'42');
  assert.equal(migration.$('piLearned').textContent,'0','old record cannot invent learned blocks');
  migration.$('piChallengeBtn').click();
  assert.equal(migration.state().position,10);
  migration.$('piRestartBtn').click();type(migration,'14159');
  assert.equal(migration.state().best,42);
  migration.$('piHintBtn').click();migration.digit('2');
  assert.equal(migration.state().best,42);
  assert.equal(Object.keys(migration.state().records).length,0);
  migration.press('Backspace');assert.equal(migration.state().position,5);
  migration.press('2',{ctrlKey:true});assert.equal(migration.state().position,5);
  migration.press('Escape');assert.equal(migration.$('piOverview').hidden,false);
  migration.press('Escape');assert.ok(migration.$('view-home').classList.contains('active'));
  migration.press('1');assert.equal(migration.state().position,5);

  const complete=await boot({[key]:JSON.stringify({...old,position:998,best:998})});
  complete.$('btnPiStart').click();complete.$('piChallengeBtn').click();type(complete,digits.slice(998));
  assert.equal(complete.state().position,1000);assert.equal(complete.state().best,1000);
  assert.ok(complete.$('piHintBtn').disabled);
  assert.equal(complete.w.document.querySelectorAll('[data-pi-digit]:disabled').length,10);
  assert.ok(complete.$('piDigits').textContent.length<70,'challenge prefix remains compact');
  complete.press('1');assert.equal(complete.state().position,1000);

  const tail=await boot({[key]:JSON.stringify({schemaVersion:2,size:3,screen:'overview',mapPage:27})});tail.$('btnPiStart').click();
  tail.w.document.querySelector('[data-pi-start="999"]').click();tail.press('Enter');type(tail,digits.slice(999));
  assert.equal(tail.state().lesson.phase,'bridge');
  assert.equal(tail.$('piDigits').querySelectorAll('.pi-digit').length,4,'short final block bridges the full previous group');
  type(tail,digits.slice(996));assert.equal(tail.state().lesson.phase,'done');
  assert.equal(Object.keys(tail.state().records).length,4);

  overview(app);
  const PreviousDate=app.w.Date;
  app.w.Date=class extends PreviousDate { constructor(...args){super(...(args.length?args:['2026-11-11T12:00:00']));} };
  app.w.document.dispatchEvent(new app.w.Event('visibilitychange'));
  assert.equal(app.$('piDue').textContent,'10','returning after midnight refreshes due reviews');

  const corrupt=await boot({[key]:JSON.stringify({schemaVersion:2,position:-20,best:'invalid',screen:'lesson',lesson:{start:-5},records:{bad:{},0:null}})});
  corrupt.$('btnPiStart').click();assert.equal(corrupt.$('piOverview').hidden,false);
  assert.equal(corrupt.$('piBest').textContent,'0');
  corrupt.$('piChallengeBtn').click();
  corrupt.w.Storage.prototype.setItem=()=>{throw new Error('quota');};corrupt.digit('1');
  assert.match(corrupt.$('piProgress').textContent,/1 \/ 1000/,'quota cannot interrupt practice');
  for(const test of [app,resumed,review,mixed,partial,partialRestart,migration,complete,tail,corrupt])assert.deepEqual(test.errors,[]);
  console.log('Pi course: study/recall/bridge, honest coverage, size changes, daily spacing, hidden due reviews, migration, resume, map, challenge and corrupt storage passed.');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;}).finally(()=>windows.forEach(w=>w.close()));
