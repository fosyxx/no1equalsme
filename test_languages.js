/* Реальный словарь: назначения по языкам и сохранение прогресса в облаке. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/languages.json'), 'utf8'));
function source(name) {
  const start = html.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name);
  return html.slice(start, html.indexOf('\n}', start) + 2);
}
const codes = ['es','fr','de','it','pt','zh','ja','ko','ar','tr'];
const storage = {};
const ctx = vm.createContext({
  LANGS: codes.map(id => ({ id })), LANG_CK_PRE: 'nem_lang_',
  LANG_STATE_KEY: 'progress', LANG_MAX_DAY: 10, LANG_MAX_NEW: 5,
  langContent: {ready:false, byLang:{}, cardById:{}}, langState:null,
  langPendingCloud: {}, langSess: {},
  localStorage: {getItem:k => storage[k] || null, setItem:(k,v) => {storage[k] = v;}},
  renderLangHome(){}, renderLangs(){}, realToday:() => '2026-11-08',
  shuffle:arr => arr, schedulePush(){}, Date
});
for (const name of ['langMeta','langOfId','langIndexOfId','validateLangPackage',
  'freshLangState','validLangProg','sanitizeLangDays','loadLangState','saveLang',
  'langCardsOf','ensureLangDay','langQueueFor','langStartedCount','langBlockKey',
  'buildLangPayloads','mergeLangCloudValue','applyLangPackage','resetLangProgress']) {
  vm.runInContext(source(name), ctx);
}
const pkg = ctx.validateLangPackage(data);
assert.equal(pkg.error, undefined);
ctx.langState = ctx.freshLangState();
ctx.applyLangPackage(pkg, 'test');
assert.equal(data.cards.filter(c => ctx.langOfId(c.id) === c.languageId).length, 500);
assert.equal(ctx.langIndexOfId('lang_es_hello'), 0);
assert.equal(ctx.langIndexOfId('lang_es_unknown'), -1);
assert.equal(ctx.langOfId('lang_xx_hello'), null);
const day = ctx.ensureLangDay();
assert.equal(day.queue.length, 5);
for (const code of codes.slice(0, 5)) assert.equal(ctx.langQueueFor(code).length, 1);

for (const code of codes) {
  const card = pkg.byLang[code][0];
  ctx.langState.cards[card.id] = {s:4,d:'2026-11-09',e:2,c:'2026-11-01',a:0};
  ctx.langState.languageUpdatedAt[code] = 100;
  assert.equal(ctx.langStartedCount(code), 1);
}
const payloads = ctx.buildLangPayloads();
assert.equal(Object.keys(payloads).length, 10);
for (const payload of Object.values(payloads)) {
  const value = JSON.parse(payload);
  assert.equal(value.c.filter(Boolean).length, 1);
  assert.equal(value.c[0][0], 4);
}
ctx.langState = ctx.freshLangState();
for (const [key, value] of Object.entries(payloads)) ctx.mergeLangCloudValue(key, JSON.parse(value));
assert.equal(Object.keys(ctx.langState.cards).length, 10, 'All ten cloud blocks restore independently');
for (const code of codes) {
  assert.equal(ctx.langState.cards[pkg.byLang[code][0].id].s, 4);
  assert.equal(ctx.langState.languageUpdatedAt[code], 100);
}
ctx.langState.cards.lang_es_hello.s = 7;
ctx.langState.languageUpdatedAt.es = 200;
ctx.mergeLangCloudValue('nem_lang_es_v1', JSON.parse(payloads.nem_lang_es_v1));
assert.equal(ctx.langState.cards.lang_es_hello.s, 7, 'Older cloud must preserve newer local progress');

ctx.langState = ctx.freshLangState();
ctx.langContent.ready = false;
assert.equal(Object.keys(ctx.buildLangPayloads()).length, 0, 'Do not upload empty blocks before content loads');
ctx.mergeLangCloudValue('nem_lang_fr_v1', JSON.parse(payloads.nem_lang_fr_v1));
assert.equal(Object.keys(ctx.langState.cards).length, 0);
ctx.applyLangPackage(pkg, 'test');
assert.equal(ctx.langState.cards[pkg.byLang.fr[0].id].s, 4, 'Early cloud waits for real card IDs');

storage.progress = JSON.stringify({schemaVersion:3, cards:{lang_es_hello:{s:3,d:null,e:0,c:null,a:0}},updatedAt:123});
ctx.langState = null;
ctx.loadLangState();
assert.equal(ctx.langState.languageUpdatedAt.es, 123, 'Existing progress keeps its timestamp');
assert.equal(ctx.langState.languageUpdatedAt.fr, undefined);
ctx.resetLangProgress();
assert.equal(Object.keys(ctx.langState.cards).length, 0);
assert.equal(Object.keys(ctx.langState.languageUpdatedAt).length, 10, 'Explicit reset is newer for every language');
console.log('Languages: real 500-card IDs, daily assignments, cloud round trip, races and migration passed.');
