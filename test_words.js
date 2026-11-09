/* Dictionary transport: actual content plus WebViews with unreliable cancellation. */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const realWords = fs.readFileSync(path.join(__dirname, 'data/words.json'), 'utf8');
const validation = html.slice(html.indexOf('function str(v, max){'), html.indexOf('function readContentCache(){'));
const parser = html.slice(html.indexOf('function cleanJsonText(s){'), html.indexOf('/* Причина отказа словаря'));
const transport = html.slice(html.indexOf('function fetchPackage(){'), html.indexOf('function renderDictInfo(){'));
let checks = 0;
function context(fetchImpl, controller) {
  const sandbox = { console, Promise, JSON, CONTENT_URL: './data/words.json', SUPPORTED_SCHEMAS: [1, 2],
    LIMITS: { id:64, word:80, stress:120, pos:40, defShort:400, defFull:2000, example:600, register:60, list:40, item:80, cards:20000 },
    fetch: fetchImpl, AbortController: controller, clearTimeout,
    setTimeout: callback => setTimeout(callback, 20) };
  vm.createContext(sandbox);
  vm.runInContext(validation + parser + transport, sandbox);
  return sandbox;
}
async function rejects(promise, expected) {
  await assert.rejects(promise, expected); checks++;
}
(async () => {
  const good = context(async () => ({ ok:true, text:async () => realWords }));
  const pkg = await good.fetchPackage();
  assert.equal(pkg.cards.length, 1500); checks++;
  assert.equal(pkg.skipped, 0); checks++;
  await rejects(context(() => new Promise(() => {})).fetchPackage(), { name:'AbortError' });
  await rejects(context(async () => ({ ok:true, text:() => new Promise(() => {}) })).fetchPackage(), { name:'AbortError' });
  let aborts = 0;
  class IneffectiveController { constructor() { this.signal = {}; } abort() { aborts++; } }
  await rejects(context(() => new Promise(() => {}), IneffectiveController).fetchPackage(), { name:'AbortError' });
  assert.equal(aborts, 1); checks++;
  await rejects(context(() => { throw new Error('sync network failure'); }).fetchPackage(), /sync network failure/);
  await rejects(context(async () => ({ ok:false, status:404 })).fetchPackage(), /http 404/);
  await rejects(context(async () => ({ ok:true, text:async () => '<html>not JSON</html>' })).fetchPackage(), /parse/);
  // An independent request must work after a timed-out attempt.
  assert.equal((await good.fetchPackage()).cards.length, 1500); checks++;
  console.log('Words: ' + checks + ' checks passed');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
