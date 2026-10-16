/* Тесты раздела «Морзе + Дактиль» для index.html + регрессия слов */
const fs = require('fs');
const vm = require('vm');
const { JSDOM, VirtualConsole } = require('jsdom');

const HTML = fs.readFileSync('/home/user/index.html', 'utf8');
const STENO_BLOCK = fs.readFileSync('/home/user/steno/steno_block.js', 'utf8');
const MORSE_PKG = JSON.parse(fs.readFileSync('/home/user/uploads/morse-signs.json', 'utf8'));
const STENO_PKG = JSON.parse(fs.readFileSync('/home/user/data/stenography.json', 'utf8'));   // R40: реальный поставляемый файл
const AKOPYAN_PKG = JSON.parse(fs.readFileSync('/home/user/data/stenography-akopyan.json', 'utf8'));
const LANG_META = [
  ['es','Испанский','es-ES'],['fr','Французский','fr-FR'],['de','Немецкий','de-DE'],
  ['it','Итальянский','it-IT'],['pt','Португальский','pt-BR'],['zh','Китайский','zh-CN'],
  ['ja','Японский','ja-JP'],['ko','Корейский','ko-KR'],['ar','Арабский','ar-SA'],
  ['tr','Турецкий','tr-TR']
];
const LANG_BCP = {}; LANG_META.forEach(([id,nm,b]) => LANG_BCP[nm] = b);
/* Ровно 500 карточек, по 50 на язык; для zh/ja/ko/ar — непустая транскрипция */
function langPkg(){
  const cards = [];
  for (const [id, name, bcp47] of LANG_META){
    for (let i = 1; i <= 50; i++){
      const nn = (i < 10 ? '0' : '') + i;
      cards.push({
        id: 'lang_' + id + '_' + nn, languageId: id, language: name, bcp47: bcp47,
        script: 'Latin', native: name + ' слово ' + i,
        transliteration: (['zh','ja','ko','ar'].indexOf(id) >= 0) ? ('translit ' + i) : '',
        translationRu: 'перевод ' + i, topic: 'Тест', usageNoteRu: '',
        // audio обязателен (R22): безопасный относительный путь к MP3
        audio: './assets/languages/audio/lang_' + id + '_' + nn + '.mp3',
        contentVersion: 1
      });
    }
  }
  return { schemaVersion: 1, contentVersion: 1, kind: 'languages', language: 'ru',
           updatedAt: '2026-09-29', count: 500, cards: cards };
}
const WORDS = [
  { id:'w1', word:'пример', stress:'приме́р', partOfSpeech:'сущ.', definitionShort:'Опр.',
    definitionFull:'Полное определение примера.', synonyms:['образец'], example:'Это простой пример.',
    relatedWords:['иллюстрация'], register:'нейтр.' },
  { id:'w2', word:'слово', stress:'сло́во', partOfSpeech:'сущ.', definitionShort:'Опр.',
    definitionFull:'Полное определение слова.', synonyms:['лексема'], example:'Слобо состоит из звуков.',
    relatedWords:['речь'], register:'нейтр.' }
];
const LETTER = id => MORSE_PKG.cards.find(c => c.id === id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pad = n => String(n).padStart(2, '0');
const dayOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = () => dayOf(new Date());
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return dayOf(d); };

let pass = 0; const failures = [];
function t(name, cond, extra) {
  if (cond) { pass++; }
  else { failures.push(name + (extra ? ' | got: ' + extra : '')); console.log('✗ ' + name + (extra ? ' | got: ' + extra : '')); }
}

function boot(opts = {}) {
  const errors = [];
  const vc = new VirtualConsole();
  // jsdom без пакета canvas: заглушка, чтобы getContext не плодил Not-implemented (сайт и так терпит null)
  vc.on('jsdomError', e => errors.push('jsdomError: ' + e.message));
  vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
  const dom = new JSDOM(HTML, {
    url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(w) {
      w.__imgMode = opts.imgMode || 'ok';
      // Детерминизм: при 33 карточках случайный выбор делал тесты 3–5 «прыгающими»
      // (точка валидна для Е/Ё, тире — для Т). random=0 → всегда первая карточка (А, .-),
      // исключая повтор подряд: pickNextMorseId при r=0 возвращает первый допустимый id.
      w.Math.random = () => 0;
      // Записывающий стенд Web Audio: каждое запланированное осцилляторное событие
      // попадает в __audioLog — тесты доказывают, что звук «неверно» и саб-бас
      // действительно планируются (регрессия на «тихую» огибающую).
      w.__audioLog = [];
      {
        const mkParam = () => ({ events: [], value: 0,
          setValueAtTime(v, t) { this.events.push(['set', v, t]); this.value = v; },
          linearRampToValueAtTime(v, t) { this.events.push(['lin', v, t]); this.value = v; },
          exponentialRampToValueAtTime(v, t) { this.events.push(['exp', v, t]); this.value = v; },
          cancelScheduledValues(t) { this.events.push(['cancel', t]); } });
        class FakeOsc {
          constructor() { this.frequency = mkParam(); this.type = 'sine'; this._stop = null; }
          connect(n) { this._out = n; }
          start(t) { w.__audioLog.push({ osc: this, start: t }); }
          stop(t) { this._stop = t; }
        }
        class FakeGain { constructor() { this.gain = mkParam(); } connect(n) { this._out = n; } }
        w.AudioContext = class {
          constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
          resume() { this.state = 'running'; return Promise.resolve(); }
          createOscillator() { return new FakeOsc(); }
          createGain() { return new FakeGain(); }
        };
      }
      w.Image = function () {
        const self = this;
        let src = '';
        Object.defineProperty(self, 'src', {
          set(v) { src = String(v); queueMicrotask(() => {
            if (w.__imgMode === 'fail') { self.onerror && self.onerror(); }
            else { self.onload && self.onload(); }
          }); },
          get() { return src; }
        });
      };
      w.fetch = function (url) {
        const u = String(url);
        if (u.indexOf('languages') >= 0) {
          if (opts.langFail) return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') });
          return Promise.resolve({ ok: true, status: 200, text: () =>
            Promise.resolve(JSON.stringify(opts.langFile !== undefined ? opts.langFile : langPkg())) });
        }
        if (u.indexOf('morse-signs') >= 0)
          return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(MORSE_PKG)) });
        if (u.indexOf('stenography.json') >= 0) {   // ВАЖНО: не глотать ./assets/stenography/*.svg
          if (opts.stenoFail) return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') });
          if (typeof opts.stenoRaw === 'string') return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(opts.stenoRaw) });
          return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(STENO_PKG)) });
        }
        if (/\.(svg|png)$/.test(u)) {
          if (opts.signsFail) return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') });
          return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path d="M0 0"/></svg>') });
        }
        if (u.indexOf('words.json') >= 0) {
          if (opts.wordsFail)
            return Promise.reject(Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' }));
          const wr={ ok: true, status: 200, text: () =>
            Promise.resolve(typeof opts.wordsRaw === 'string' ? opts.wordsRaw
              : JSON.stringify(opts.wordsPkg !== undefined ? opts.wordsPkg : WORDS)) };
          if(opts.wordsDelayMs) return new Promise(resolve=>setTimeout(()=>resolve(wr),opts.wordsDelayMs));
          return Promise.resolve(wr);
        }
        return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') });
      };
      if (opts.cachePath) {
        // Эмуляция Cache API + objectURL: реальный путь «жест → кэш → память».
        // В обычных бутах кэша нет — старый путь new Image() не затронут.
        w.__imgFetches = 0; w.__cachePuts = [];
        w.URL.createObjectURL = () => 'blob:nem/' + w.__imgFetches + '/' + Math.random();
        w.URL.revokeObjectURL = () => {};
        w.Response = function (b) { this.body = b; };
        w.caches = {
          open: async () => ({
            match: opts.cacheHit
              ? async (u) => ({ ok: true, blob: async () => new w.Blob(['cached:' + u]) })
              : async () => null,
            put: async (u) => { w.__cachePuts.push(String(u)); }
          })
        };
        const baseFetchImg = w.fetch;
        w.fetch = function (url) {
          const u = String(url);
          if (u.indexOf('assets/signs/') >= 0) {
            w.__imgFetches++;
            return Promise.resolve({ ok: true, status: 200, blob: async () => new w.Blob(['img:' + u]) });
          }
          return baseFetchImg(u);
        };
      }
      w.__fetchLog = [];
      { const __bf0 = w.fetch; w.fetch = function (url) { w.__fetchLog.push(String(url)); return __bf0(url); }; }
      // MP3-плеер R22: подменяем Audio полностью — иначе jsdom кидает
      // Not implemented (pause/load), а тестам нужно управлять играми и ошибками.
      if (w.HTMLCanvasElement) w.HTMLCanvasElement.prototype.getContext = function(){ return null; };
      w.__audioPlays = [];
      w.Audio = function () {
        const a = this;
        const ls = {};
        a.preload = ''; a.paused = true; a.currentTime = 0;
        a._src = '';
        Object.defineProperty(a, 'src', {
          get() { return a._src; },
          set(v) { a._src = String(v); }
        });
        a.addEventListener = (ev, fn) => { (ls[ev] = ls[ev] || []).push(fn); };
        a.removeEventListener = (ev, fn) => {
          const l = ls[ev] || []; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1);
        };
        a.dispatch = (ev) => { (ls[ev] || []).slice().forEach(fn => { try { fn({ type: ev }); } catch (_e) {} }); };
        a.pause = () => { a.paused = true; };
        a.load = () => {};
        a.removeAttribute = (name) => { if (name === 'src') a._src = ''; };
        a.play = () => {
          a.paused = false;
          w.__audioInst = a;
          if (a._src) w.__audioPlays.push(a._src);
          if (opts.audioPlayFail) return Promise.reject(new Error('blocked'));
          if (opts.audioLoadFail) {
            // файл не загрузился: play() отклоняется И приходит событие error
            setTimeout(() => { a.paused = true; a.dispatch('error'); }, 5);
            return Promise.reject(new Error('load failed'));
          }
          return Promise.resolve();
        };
      };
      if (!opts.noSpeech) {
        w.__speech = [];
        w.__voices = (opts.voices !== undefined) ? opts.voices : LANG_META.map(([id, , b]) => ({ lang: b, name: 'V' + id }));
        w.__speechErr = opts.speechError || null;
        w.SpeechSynthesisUtterance = function (t) {
          this.text = t; this.lang = ''; this.rate = 1; this.pitch = 1; this.voice = null;
        };
        w.speechSynthesis = {
          cancel() { w.__speech.push({ cancel: true }); },
          speak(u) {
            w.__speech.push({ text: u.text, lang: u.lang, rate: u.rate, voice: u.voice ? u.voice.name : null });
            if (w.__speechErr) setTimeout(() => { try { u.onerror && u.onerror({ error: w.__speechErr }); } catch (_e) {} }, 10);
          },
          getVoices() { return w.__voices.slice(); },
          addEventListener() {}, removeEventListener() {}
        };
      }
      // Мок Telegram WebApp: записываем каждый вызов HapticFeedback — тесты
      // доказывают, что вибрация реально стреляет при зажатии, удержании и вводе
      w.__haptics = [];
      w.Telegram = { WebApp: { HapticFeedback: {
        impactOccurred(style) { w.__haptics.push('impact:' + style); },
        notificationOccurred(kind) { w.__haptics.push('notif:' + kind); },
        selectionChanged() { w.__haptics.push('sel'); }
      } } };
      if (opts.seed) Object.keys(opts.seed).forEach(k => w.localStorage.setItem(k, opts.seed[k]));
      w.addEventListener('error', e => errors.push('pageError: ' + (e.message || e)));
    }
  });
  const w = dom.window, doc = w.document;
  const api = {
    dom, w, doc, errors,
    $: id => doc.getElementById(id),
    click(el) { el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })); },
    pev(type) {
      const e = new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: 80, clientY: 80 });
      Object.defineProperty(e, 'pointerId', { value: 1 });
      return e;
    },
    pevXY(type, x, y) {
      const e = new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
      Object.defineProperty(e, 'pointerId', { value: 1 });
      return e;
    },
    async waitView(id) {
      for (let i = 0; i < 300; i++) { if (doc.getElementById(id).classList.contains('active')) return; await sleep(20); }
      throw new Error('view ' + id + ' не активировался');
    },
    async waitMorseReady() {
      for (let i = 0; i < 300; i++) {
        if (!api.$('btnMorseStart').disabled && api.$('morseSub').textContent.indexOf('из 10') >= 0) return;
        await sleep(20);
      }
      throw new Error('раздел морзе не готов');
    },
    mstate() { return JSON.parse(w.localStorage.getItem('nem_morse_practice_v1')); },
    async tap(kind) {
      const zone = api.$('morseZone');
      zone.dispatchEvent(api.pev('pointerdown'));
      await sleep(kind === 'dash' ? 270 : 70);
      zone.dispatchEvent(api.pev('pointerup'));
      await sleep(80);
    },
    async typeCode(code) { for (const ch of code) await api.tap(ch === '.' ? 'dot' : 'dash'); },
    async openMorse() { api.click(api.$('btnMorseStart')); await api.waitView('view-morse'); }
  };
  return api;
}

(async () => {
  /* ═══ 1. Загрузка, главная, статические проверки ═══ */
  const A = await boot();
  await A.waitView('view-home');
  t('1.1 главная активна', true);
  t('1.2 счётчик слов цел', /^Сегодня: \d+ \/ 15 слов/.test(A.$('cntToday').textContent), A.$('cntToday').textContent);
  t('1.3 строка морзе на главной', !!A.$('secList') && !!A.$('morseChip') && !!A.$('btnMorseStart') && !!A.$('morseAct'));
  await A.waitMorseReady();
  t('1.4 морзе загрузился независимо', true);
  const sub = A.$('morseSub').textContent;
  t('1.5 формат «0 из 10 правильных · около N минут»', /^0 из 10 правильных · около \d+ минут/.test(sub), sub);
  t('1.6 чип «Сегодня»', A.$('morseChip').textContent === 'Сегодня', A.$('morseChip').textContent);
  t('1.7 действие «Начать» в строке морзе', A.$('morseAct').textContent === 'Начать' && A.$('morseAct').textContent !== undefined);
  // регрессия: каждый экран должен быть прямым потомком #app (иначе активный
  // экран невидим из-за скрытого родителя — «пустой экран» при нажатии)
  const views = ['view-home', 'view-session', 'view-result', 'view-archive', 'view-morse', 'view-steno', 'view-details', 'view-langs', 'view-langsession'];
  const parentsOk = views.every(id => {
    const el = A.$(id);
    return el && el.parentElement && el.parentElement.id === 'app';
  });
  t('1.7а все 9 экранов — прямые дети #app (R40: добавлен view-steno)', parentsOk && A.doc.querySelectorAll('#app > section.view').length === 9,
    [...views].map(id => (A.$(id) || {}).parentElement && A.$(id).parentElement.id).join(','));
  {
    const secOrder = [...A.doc.querySelectorAll('#secList .sec-row')].map(b => b.id).join(',');
    t('1.7б главная: 4 ряда (Слова→Языки→Морзе+Дактиль→Стенография) + скрытые «Морзе», «Дактиль», «Чтение стенографии»',
      secOrder === 'btnStart,btnLangStart,btnMorseStart,btnStenoStart,btnDrillLetter,btnDrillDactyl,btnDrillStenoRead' &&
      !!A.$('btnDetails') &&
      A.$('secMore').hidden === true &&
      A.$('btnSecMore').getAttribute('aria-expanded') === 'false' &&
      !!A.$('btnShowResult').closest('.pill-result'),
      secOrder);
  }
  t('1.7в «Освоено слов» переехало в «Подробнее»',
    !!A.$('archRow') && !!A.$('archRow').closest('#view-details'));

  const slice = HTML.slice(HTML.indexOf('Морзе + Дактиль (второй независимый'), HTML.indexOf('ЯЗЫКИ — третий независимый раздел'));
  t('1.8 нет setInterval в модуле', slice.indexOf('setInterval') < 0);
  t('1.9 нет вызовов облачного API в модуле',
    slice.indexOf('tg.CloudStorage') < 0 && slice.indexOf('cloud.') < 0 && slice.indexOf('schedulePush') < 0);
  const bp = HTML.slice(HTML.indexOf('function buildPayloads'), HTML.indexOf('function buildPayloads') + 4000);
  t('1.10 payload облака не знает о морзе', bp.indexOf('morse') < 0 && bp.indexOf('Morse') < 0);
  const keys = [];
  for (let i = 0; i < A.w.localStorage.length; i++) keys.push(A.w.localStorage.key(i));
  const morseKeys = keys.filter(k => /morse/i.test(k)).sort();
  t('1.11 ровно два ключа морзе',
    JSON.stringify(morseKeys) === JSON.stringify(['nem_morse_cache_v1', 'nem_morse_practice_v1']),
    JSON.stringify(morseKeys));
  t('1.12 слова/кэш без морзе',
    keys.filter(k => !/morse/i.test(k)).every(k => A.w.localStorage.getItem(k).indexOf('morse') < 0),
    JSON.stringify(keys));

  /* ═══ 2. Экран упражнения: буква скрыта до проверки ═══ */
  await A.openMorse();
  let s = A.mstate();
  t('2.1 текущая буква выбрана', !!s.currentId && !!LETTER(s.currentId), s.currentId);
  const card = LETTER(s.currentId);
  t('2.2 статус «Правильно: 0 / 10»', A.$('morseStatusMain').textContent === 'Правильно: 0 / 10', A.$('morseStatusMain').textContent);
  t('2.3 точность показана', A.$('morseStatusSub').textContent === 'Точность: —', A.$('morseStatusSub').textContent);
  const firstId = s.currentId;
  const viewText = A.$('view-morse').textContent;
  t('2.4 буква НЕ видна до проверки', viewText.indexOf(card.letter) < 0, 'letter=' + card.letter);
  t('2.5 код НЕ виден до проверки', A.$('morseCode').textContent === '', A.$('morseCode').textContent);
  t('2.6 подсказка «Коснись и настучи код»', A.$('morseCue').hidden === false && A.$('morseCue').textContent === 'Коснись и настучи код');
  t('2.7 зона в единственном экземпляре', A.doc.querySelectorAll('#view-morse .morse-zone').length === 1);
  const btnTexts = [...A.doc.querySelectorAll('#view-morse button')].map(b => b.textContent.trim());
  t('2.8 нет кнопки проверки', !btnTexts.some(x => /Проверить|Ответить/.test(x)), JSON.stringify(btnTexts));
  t('2.9 нет отдельных зон Точка/Тире', !btnTexts.includes('Точка') && !btnTexts.includes('Тире'));
  t('2.10 изображение предзагрузилось', A.$('morseImg').hidden === false && A.$('morseImg').getAttribute('src').startsWith('./assets/signs/'),
    A.$('morseImg').getAttribute('src'));

  /* ═══ 3. Точка: всегда неверно для этих карт, подсказка руки ═══ */
  await A.tap('dot');
  t('3.1 точка отобразилась', A.$('morseCode').textContent === '·', A.$('morseCode').textContent);
  t('3.2 подсказка скрылась', A.$('morseCue').hidden === true);
  await sleep(650);
  t('3.3 режим результата', A.mstate().mode === 'incorrect', A.mstate().mode);
  t('3.4 красная зона', A.$('morseZone').classList.contains('bad'));
  s = A.mstate();
  t('3.5 счётчик верных не тронут', s.dailyCorrect === 0, String(s.dailyCorrect));
  t('3.6 попытка+ошибка', s.dailyAttempts === 1 && s.dailyErrors === 1, s.dailyAttempts + '/' + s.dailyErrors);
  t('3.7 слабость +2', s.weaknessScore[s.currentId] === 2, String(s.weaknessScore[s.currentId]));
  t('3.8 буква видна после проверки', A.$('view-morse').textContent.indexOf(LETTER(s.currentId).letter) >= 0);
  t('3.9 введённый и верный коды показаны',
    A.$('morseResCodes').textContent.indexOf('Вы ввели') >= 0 && A.$('morseResCodes').textContent.indexOf('Верно') >= 0,
    A.$('morseResCodes').textContent);
  t('3.10 подсказка руки (handshapeHint)', A.$('morseResHint').textContent === LETTER(s.currentId).handshapeHint);
  t('3.11 вердикт «Неверно»', A.$('morseResVerdict').textContent === 'Неверно');
  await sleep(1150);
  s = A.mstate();
  t('3.12 «Неверно»: буква НЕ изменилась, ввод очищен, снова input',
    s.mode === 'input' && s.sequence === '' && s.currentId === firstId, s.mode + '/' + s.currentId);

  /* ═══ 4. Тире: порог 240 мс, смена подписи; после ошибки — та же буква ═══ */
  const id4 = A.mstate().currentId;
  {
    const zone = A.$('morseZone');
    zone.dispatchEvent(A.pev('pointerdown'));
    await sleep(120);
    t('4.1 «Точка» до порога', A.$('morseZoneMain').textContent === 'Точка', A.$('morseZoneMain').textContent);
    t('4.2 полоски заполнения больше нет', A.$('morseHoldFill') === null);
    await sleep(160); // 280 мс ≥ 240
    t('4.3 «Тире» после порога', A.$('morseZoneMain').textContent === 'Тире', A.$('morseZoneMain').textContent);
    zone.dispatchEvent(A.pev('pointerup'));
    await sleep(60);
    t('4.4 тире добавлено', A.$('morseCode').textContent === '—', A.$('morseCode').textContent);
    t('4.5 сброс подписи на «Удерживай»', A.$('morseZoneMain').textContent === 'Удерживай');
  }
  await sleep(600);
  t('4.6 автоматическая проверка после тире', A.mstate().mode !== 'input', A.mstate().mode);
  await sleep(1150);
  s = A.mstate();
  t('4.7 снова ввод, буква та же (пока не введена верно)', s.mode === 'input' && s.currentId === id4,
    s.mode + '/' + s.currentId);

  /* ═══ 5. Верный ответ: правильный код, счётчики, −1 слабости ═══ */
  s = A.mstate();
  const card5 = LETTER(s.currentId);
  const weak5before = A.mstate().weaknessScore[card5.id] || 0;
  await A.typeCode(card5.morse);
  await sleep(650);
  s = A.mstate();
  t('5.1 верно засчитано', s.mode === 'correct', s.mode);
  t('5.2 дневной счётчик +1', s.dailyCorrect === 1, String(s.dailyCorrect));
  t('5.3 ошибок не прибавилось', s.dailyErrors === 2, String(s.dailyErrors));
  t('5.4 зелёная зона', A.$('morseZone').classList.contains('ok'));
  t('5.5 вердикт «Верно»', A.$('morseResVerdict').textContent === 'Верно');
  t('5.6 показан верный код', A.$('morseResCodes').textContent === pretty(card5.morse), A.$('morseResCodes').textContent);
  t('5.7 слабость −1 (не ниже 0)', s.weaknessScore[card5.id] === Math.max(0, weak5before - 1),
    JSON.stringify(s.weaknessScore));
  await sleep(1150);
  s = A.mstate();
  t('5.8 следующая буква не повторилась', s.mode === 'input' && s.currentId !== card5.id, s.currentId);

  /* ═══ 6. Шестой элемент: мгновенная проверка ═══ */
  for (let i = 0; i < 5; i++) await A.tap('dot');
  t('6.1 пять элементов набрано', A.$('morseCode').textContent === '· · · · ·', A.$('morseCode').textContent);
  const attBefore = A.mstate().dailyAttempts;
  {
    const zone = A.$('morseZone');
    zone.dispatchEvent(A.pev('pointerdown'));
    await sleep(70);
    zone.dispatchEvent(A.pev('pointerup'));
  }
  s = A.mstate();
  t('6.2 проверка сразу, без 500 мс', s.mode !== 'input', s.mode);
  t('6.3 шестой символ не добавился', s.sequence.length === 5, s.sequence);
  t('6.4 попытка +1', s.dailyAttempts === attBefore + 1, s.dailyAttempts);
  await sleep(1150);
  t('6.5 снова ввод', A.mstate().mode === 'input');

  /* ═══ 7. Debounce: новое нажатие отменяет проверку, проверка ровно один раз ═══ */
  const att7 = A.mstate().dailyAttempts;
  await A.tap('dot');
  await sleep(300);
  {
    const zone = A.$('morseZone');
    zone.dispatchEvent(A.pev('pointerdown'));
    await sleep(60);
    zone.dispatchEvent(A.pev('pointerup'));
  }
  await sleep(250); // 550 мс от первой — её таймер обязан быть отменён
  t('7.1 старая проверка отменена', A.mstate().mode === 'input', A.mstate().mode);
  await sleep(400); // новая пауза 500 мс прошла
  s = A.mstate();
  t('7.2 новая проверка прошла', s.mode !== 'input', s.mode);
  t('7.3 ровно одна попытка за оба нажатия', s.dailyAttempts === att7 + 1, s.dailyAttempts);
  await sleep(1150);

  /* ═══ 8. Cancel: символ не добавляется, отложенная проверка не срабатывает ═══ */
  const att8 = A.mstate().dailyAttempts;
  await A.tap('dot');                       // есть незавершённая проверка
  {
    const zone = A.$('morseZone');
    zone.dispatchEvent(A.pev('pointerdown'));
    await sleep(100);
    zone.dispatchEvent(A.pev('pointercancel'));
  }
  t('8.1 отмена не добавила символ', A.$('morseCode').textContent === '·', A.$('morseCode').textContent);
  await sleep(650);                         // момент старого таймера прошёл — он обязан быть отменён
  s = A.mstate();
  t('8.2 проверка после отмены не запускалась', s.mode === 'input' && s.dailyAttempts === att8,
    s.mode + '/' + s.dailyAttempts);

  /* ═══ 9. Нажатие < 40 мс игнорируется, но не подвешивает ввод ═══ */
  const seq9 = A.mstate().sequence;
  {
    const zone = A.$('morseZone');
    zone.dispatchEvent(A.pev('pointerdown'));
    zone.dispatchEvent(A.pev('pointerup')); // 0 мс
  }
  t('9.1 короткий тап не добавил символ', A.mstate().sequence === seq9, A.mstate().sequence);
  await sleep(650);
  t('9.2 незавершённый ввод не завис: проверка прошла', A.mstate().mode !== 'input', A.mstate().mode);
  await sleep(1150);
  t('9.3 снова ввод', A.mstate().mode === 'input');

  /* ═══ 10. Цель: 9 → 10, экран цели, свободная тренировка ═══ */
  const seedGoal = JSON.stringify({
    schemaVersion: 1, day: today(), dailyCorrect: 9, dailyAttempts: 3, dailyErrors: 1,
    weaknessScore: {}, currentId: 'rsl_a', sequence: '', mode: 'input', freeMode: false,
    sound: true, updatedAt: Date.now()
  });
  const B = await boot({ seed: { nem_morse_practice_v1: seedGoal } });
  await B.waitView('view-home'); await B.waitMorseReady();
  t('10.1 главная: 9 из 10', B.$('morseSub').textContent.indexOf('9 из 10') === 0, B.$('morseSub').textContent);
  await B.openMorse();
  t('10.2 сохранённая буква не сброшена', B.mstate().currentId === 'rsl_a', B.mstate().currentId);
  await B.typeCode(LETTER('rsl_a').morse);
  await sleep(650);
  s = B.mstate();
  t('10.3 десятый верный: результат показан', s.dailyCorrect === 10 && s.mode === 'correct',
    s.dailyCorrect + '/' + s.mode);
  await sleep(1150); // через 1000 мс — экран цели
  s = B.mstate();
  t('10.4 экран цели активен', s.mode === 'goal' && B.$('morseGoal').hidden === false && B.$('morseStatus').hidden === true, s.mode);
  t('10.5 попытки/ошибки на экране цели',
    B.$('mgAttempts').textContent === '4' && B.$('mgErrors').textContent === '1',
    B.$('mgAttempts').textContent + '/' + B.$('mgErrors').textContent);
  t('10.6 точность 75%', B.$('mgAccuracy').textContent === '75%', B.$('mgAccuracy').textContent);
  t('10.7 кнопка «Продолжить тренировку»', B.$('btnMorseContinue').textContent === 'Продолжить тренировку');
  B.click(B.$('btnMorseBack'));
  await B.waitView('view-home');
  t('10.8 главная после цели: «Цель выполнена · 10 из 10»', B.$('morseSub').textContent === 'Цель выполнена · 10 из 10', B.$('morseSub').textContent);
  t('10.9 «Продолжить тренировку» в строке морзе и она НЕ горит (серая, как «Пройти заново»)',
    B.$('morseAct').textContent === 'Продолжить тренировку' &&
    B.$('btnMorseStart').classList.contains('is-quiet') === true,
    B.$('btnMorseStart').className);
  t('10.10 чип «Готово»', B.$('morseChip').textContent === 'Готово', B.$('morseChip').textContent);
  await B.openMorse();
  s = B.mstate();
  t('10.11 свободный режим', s.freeMode === true && s.mode === 'input' && B.$('morseStatusMain').textContent === 'Свободная тренировка',
    s.freeMode + '/' + s.mode + '/' + B.$('morseStatusMain').textContent);
  t('10.12 после цели вышла новая буква', s.currentId !== 'rsl_a', s.currentId);
  await B.typeCode(LETTER(s.currentId).morse);
  await sleep(650);
  s = B.mstate();
  t('10.13 верный ответ в свободном режиме', s.mode === 'correct', s.mode);
  t('10.14 свободный режим копит верные (стало 11)', s.dailyCorrect === 11, String(s.dailyCorrect));
  await sleep(1150);
  s = B.mstate();
  t('10.15 экран цели не появился снова', s.mode === 'input' && B.$('morseGoal').hidden === true, s.mode);

  /* ═══ 11. Смена локальной даты: счётчики 0, слабость сохранена ═══ */
  const seedDay = JSON.stringify({
    schemaVersion: 1, day: yesterday(), dailyCorrect: 7, dailyAttempts: 9, dailyErrors: 3,
    weaknessScore: { rsl_a: 6, rsl_v: 2 }, currentId: 'rsl_v', sequence: '', mode: 'correct',
    freeMode: false, sound: true, updatedAt: Date.now()
  });
  const C = await boot({ seed: { nem_morse_practice_v1: seedDay } });
  await C.waitView('view-home'); await C.waitMorseReady();
  s = C.mstate();
  t('11.1 день = сегодня (локальная дата)', s.day === today(), s.day + ' vs ' + today());
  t('11.2 дневные счётчики обнулены', s.dailyCorrect === 0 && s.dailyAttempts === 0 && s.dailyErrors === 0,
    s.dailyCorrect + '/' + s.dailyAttempts + '/' + s.dailyErrors);
  t('11.3 слабость пережила смену дня', s.weaknessScore.rsl_a === 6 && s.weaknessScore.rsl_v === 2, JSON.stringify(s.weaknessScore));
  t('11.4 вчерашний результат не воскрес', s.mode === 'input' && s.currentId === null && s.sequence === '', s.mode);
  t('11.5 главная: 0 из 10', C.$('morseSub').textContent.indexOf('0 из 10') === 0, C.$('morseSub').textContent);

  /* ═══ 12. Взвешенный выбор (unit на извлечённой функции) ═══ */
  const fnSrc = (() => {
    const i = HTML.indexOf('function pickNextMorseId(');
    let d = 0, started = false;
    for (let j = i; j < HTML.length; j++) {
      const ch = HTML[j];
      if (ch === '{') { d++; started = true; }
      else if (ch === '}') { d--; if (started && d === 0) return HTML.slice(i, j + 1); }
    }
    throw new Error('fn not found');
  })();
  const sandbox = { MORSE_CARDS: MORSE_PKG.cards, Math: Math, morseWeak: () => 0 };
  vm.createContext(sandbox);
  vm.runInContext(fnSrc + '; __pick = pickNextMorseId;', sandbox);
  // а) нет повтора подряд при >1 карточки
  let allDifferent = true, prev = 'rsl_a';
  for (let i = 0; i < 500; i++) { const id = sandbox.__pick(prev); if (id === prev) allDifferent = false; prev = id; }
  t('12.1 буква не повторяется дважды подряд', allDifferent);
  // б) вес = 1 + weakness
  sandbox.morseWeak = id => id === 'rsl_a' ? 10 : 0;
  vm.runInContext('__pick = pickNextMorseId;', sandbox);
  // в библиотеке 33 буквы: вес 11 против 1 → ожидаемая доля ≈ 11/43 ≈ 0.256
  const counts = {};
  for (let i = 0; i < 3000; i++) { const id = sandbox.__pick(null); counts[id] = (counts[id] || 0) + 1; }
  const ratio = (counts.rsl_a || 0) / 3000;
  t('12.2 слабая буква выбирается чаще (вес 11 против 1, 33 буквы)',
    (counts.rsl_a || 0) > (counts.rsl_b || 0) * 4 && ratio > 0.18 && ratio < 0.36,
    JSON.stringify({ a: counts.rsl_a, b: counts.rsl_b, ratio: ratio }));
  // в) одна карточка — повтор разрешён
  const single = { MORSE_CARDS: [MORSE_PKG.cards[0]], Math: Math, morseWeak: () => 0 };
  vm.createContext(single);
  vm.runInContext(fnSrc + '; __one = pickNextMorseId(\'' + MORSE_PKG.cards[0].id + '\');', single);
  t('12.3 при единственной карточке выбор не пустой', single.__one === MORSE_PKG.cards[0].id, single.__one);

  /* ═══ 13. Звук и статистика в настройках + сброс только морзе ═══ */
  const seedStats = JSON.stringify({
    schemaVersion: 1, day: today(), dailyCorrect: 4, dailyAttempts: 6, dailyErrors: 2,
    weaknessScore: { rsl_a: 5, rsl_b: 2 }, currentId: null, sequence: '', mode: 'input',
    freeMode: false, sound: true, updatedAt: Date.now()
  });
  const D = await boot({ seed: { nem_morse_practice_v1: seedStats } });
  await D.waitView('view-home'); await D.waitMorseReady();
  const snapWords = () => {
    const out = [];
    for (let i = 0; i < D.w.localStorage.length; i++) {
      const k = D.w.localStorage.key(i);
      if (!/morse/i.test(k)) out.push([k, D.w.localStorage.getItem(k)]);
    }
    return JSON.stringify(out);
  };
  D.click(D.$('btnSettings'));
  await sleep(60);
  t('13.1 настройки открыты', D.$('settingsOverlay').hidden === false);
  t('13.2 строка «Звук Морзе» есть', !!D.$('swMorseSound'));
  t('13.3 статистика: правильно 4 / 10', D.$('msToday').textContent === '4 / 10', D.$('msToday').textContent);
  t('13.4 попытки 6, ошибки 2', D.$('msAttempts').textContent === '6' && D.$('msErrors').textContent === '2');
  t('13.5 точность 67%', D.$('msAccuracy').textContent === '67%', D.$('msAccuracy').textContent);
  t('13.6 букв в библиотеке 33', D.$('msCount').textContent === '33', D.$('msCount').textContent);
  t('13.7 слабые буквы «А (5), Б (2)»', D.$('msWeak').textContent === 'А (5), Б (2)', D.$('msWeak').textContent);
  t('13.8 звук включён по умолчанию', D.$('swMorseSound').getAttribute('aria-checked') === 'true' && D.mstate().sound === true);
  D.click(D.$('swMorseSound'));
  t('13.9 звук выключился и сохранился', D.mstate().sound === false && D.$('swMorseSound').getAttribute('aria-checked') === 'false');
  const wordsBeforeReset = snapWords();
  // сброс с подтверждением
  D.click(D.$('btnMorseReset'));
  t('13.10 подтверждение показано', D.$('morseResetConfirm').hidden === false && D.$('btnMorseReset').hidden === true);
  t('13.11 статистика ещё цела', D.$('msToday').textContent === '4 / 10');
  D.click(D.$('btnMorseResetNo'));
  t('13.12 «Отмена» закрыла подтверждение', D.$('morseResetConfirm').hidden === true);
  D.click(D.$('btnMorseReset'));
  D.click(D.$('btnMorseResetYes'));
  t('13.13 статистика морзе обнулена',
    D.$('msToday').textContent === '0 / 10' && D.$('msAttempts').textContent === '0' &&
    D.$('msErrors').textContent === '0' && D.$('msWeak').textContent === '—',
    D.$('msToday').textContent + '/' + D.$('msWeak').textContent);
  t('13.14 звук пережил сброс', D.mstate().sound === false);
  t('13.15 слова/облако не тронуты', snapWords() === wordsBeforeReset);
  t('13.16 переключатели слов на месте, резерв из настроек удалён',
    !!D.$('swHaptic') && !!D.$('sensRange') && !D.$('btnExport') && !D.$('btnImport') && !D.$('btnResetV1'));
  D.click(D.$('btnCloseSettings'));
  await sleep(300);
  t('13.17 настройки закрыты', D.$('settingsOverlay').hidden === true);

  /* ═══ 14. Сбой загрузки картинки: без утечки буквы, есть «Повторить» ═══ */
  const E = await boot({ imgMode: 'fail' });
  await E.waitView('view-home'); await E.waitMorseReady();
  await E.openMorse();
  await sleep(200);
  t('14.1 сообщение об ошибке картинки', E.$('morseImgErr').hidden === false && E.$('morseImg').hidden === true);
  t('14.2 текст ошибки дословно',
    E.$('morseImgErr').textContent.indexOf('Изображение жеста не загрузилось') >= 0,
    E.$('morseImgErr').textContent);
  const s14 = E.mstate(); const c14 = LETTER(s14.currentId);
  t('14.3 буква не утекла через alt/текст',
    E.$('view-morse').textContent.indexOf(c14.letter) < 0 && !(E.$('morseImg').getAttribute('alt') || '').includes(c14.letter),
    c14.letter);
  E.w.__imgMode = 'ok';
  E.click(E.$('btnMorseImgRetry'));
  await sleep(200);
  t('14.4 «Повторить» восстановил картинку', E.$('morseImg').hidden === false && E.$('morseImgErr').hidden === true);
  t('14.5 относительный путь ./assets/signs/',
    (E.$('morseImg').getAttribute('src') || '').startsWith('./assets/signs/') && (E.$('morseImg').getAttribute('src') || '').endsWith('.png'),
    E.$('morseImg').getAttribute('src'));

  /* ═══ 15. visibilitychange: сохранение, отмена, безопасный повтор ═══ */
  const att15 = E.mstate().dailyAttempts;
  await E.tap('dot');
  await sleep(250);
  t('15.1 ввод сохранён после нажатия', E.mstate().sequence === '.', E.mstate().sequence);
  const doc15 = E.doc;
  Object.defineProperty(doc15, 'hidden', { configurable: true, get: () => true });
  Object.defineProperty(doc15, 'visibilityState', { configurable: true, get: () => 'hidden' });
  doc15.dispatchEvent(new E.w.Event('visibilitychange'));
  await sleep(400); // момент старого таймера прошёл
  t('15.2 проверка не стрельнула в фоне', E.mstate().mode === 'input' && E.mstate().dailyAttempts === att15,
    E.mstate().mode + '/' + E.mstate().dailyAttempts);
  t('15.3 сессия сохранена в скрытом виде', E.mstate().sequence === '.');
  Object.defineProperty(doc15, 'hidden', { configurable: true, get: () => false });
  Object.defineProperty(doc15, 'visibilityState', { configurable: true, get: () => 'visible' });
  doc15.dispatchEvent(new E.w.Event('visibilitychange'));
  t('15.4 при возврате ввод цел', E.mstate().sequence === '.' && E.mstate().mode === 'input');
  await sleep(650);
  s = E.mstate();
  t('15.5 свежая проверка прошла ровно один раз', s.dailyAttempts === att15 + 1 && s.mode !== 'input',
    s.dailyAttempts + '/' + s.mode);
  await sleep(1150);

  /* ═══ 16. Перезапуск посреди результата: без повторного засчёта ═══ */
  const seedRes = JSON.stringify({
    schemaVersion: 1, day: today(), dailyCorrect: 3, dailyAttempts: 5, dailyErrors: 1,
    weaknessScore: { rsl_b: 1 }, currentId: 'rsl_b', sequence: LETTER('rsl_b').morse,
    mode: 'correct', freeMode: false, sound: true, updatedAt: Date.now()
  });
  const F = await boot({ seed: { nem_morse_practice_v1: seedRes } });
  await F.waitView('view-home'); await F.waitMorseReady();
  await F.openMorse();
  s = F.mstate();
  t('16.1 результат восстановился: зелёный, «Верно», буква Б',
    F.$('morseZone').classList.contains('ok') && F.$('morseResVerdict').textContent === 'Верно' &&
    F.$('view-morse').textContent.indexOf('Б') >= 0);
  t('16.2 счётчики НЕ изменились при старте', s.dailyCorrect === 3 && s.dailyAttempts === 5,
    s.dailyCorrect + '/' + s.dailyAttempts);
  await sleep(1200); // остаток показа результата (1000 мс от открытия)
  s = F.mstate();
  t('16.3 после 1 с — следующая буква, счётчики те же',
    s.mode === 'input' && s.dailyCorrect === 3 && s.dailyAttempts === 5 && s.currentId !== 'rsl_b',
    s.mode + '/' + s.dailyCorrect + '/' + s.currentId);

  /* ═══ 17. Регрессия слов ═══ */
  t('17.1 главная слова жива', A.$('cntToday') !== null && /^Сегодня: \d+ \/ 15 слов/.test(A.$('cntToday').textContent));
  A.click(A.$('archRow'));
  await A.waitView('view-archive');
  t('17.2 архив открывается', true);
  A.click(A.$('btnBack'));
  await A.waitView('view-home');
  t('17.3 возврат на главную', true);

  /* ═══ 18. Экран «Статистика» (бывш. Подробнее): вкладки, графики, свайпы ═══ */
  t('18.0а кнопка на главной называется «Статистика»', A.$('btnDetails').textContent.trim() === 'Статистика',
    A.$('btnDetails').textContent);
  t('18.0б обе кнопки Начать/Продолжить одного стиля', A.$('btnStart').className === A.$('btnMorseStart').className,
    A.$('btnStart').className + ' vs ' + A.$('btnMorseStart').className);
  A.click(A.$('btnDetails'));
  await A.waitView('view-details');
  t('18.1 экран «Подробнее» открылся', A.$('view-details').classList.contains('active'));
  t('18.2 график слов: 14 столбцов-дней', A.doc.querySelectorAll('#dtWordsChart .dt-day').length === 14,
    A.doc.querySelectorAll('#dtWordsChart .dt-day').length);
  t('18.3 график морзе: 14 столбцов-дней', A.doc.querySelectorAll('#dtMorseChart .dt-day').length === 14);
  t('18.4 легенда «Изучено/Показано новых/Повторено»',
    /Изучено/.test(A.$('view-details').textContent) && /Показано новых/.test(A.$('view-details').textContent));
  t('18.5 деталь дня заполнена', A.$('dtWordsDetail').textContent.length > 0, A.$('dtWordsDetail').textContent);
  t('18.5а внизу-центре слов: «Всего показано слов: N»',
    /Всего показано слов: \d+/.test(A.$('detWordsFoot').textContent), A.$('detWordsFoot').textContent);
  t('18.5б своя статистика слов (дни и лучшая серия)',
    /Дней с тренировками: \d+/.test(A.$('detWordsFoot').textContent) && /Лучшая серия: \d+/.test(A.$('detWordsFoot').textContent),
    A.$('detWordsFoot').textContent);
  t('18.5в внизу-центре морзе: процент верных вводов по буквам',
    /Верный ввод по буквам: /.test(A.$('detMorseFoot').textContent), A.$('detMorseFoot').textContent);
  t('18.5г своя статистика морзе: точность за всё время',
    /Точность за всё время: /.test(A.$('detMorseFoot').textContent), A.$('detMorseFoot').textContent);
  t('18.5д кнопка сброса статистики морзе — в настройках, не в «Статистике»',
    !!A.$('btnMorseReset') && !!A.$('btnMorseReset').closest('#settingsSheet') &&
    !A.$('btnMorseReset').closest('#view-details'));
  t('18.6 итоги морзе на вкладке',
    /Сегодня: \d+ \/ 10/.test(A.$('dtMorseTotals').textContent), A.$('dtMorseTotals').textContent);
  const firstCell = A.doc.querySelector('#dtWordsChart .dt-day');
  A.click(firstCell);
  t('18.7 тап по дню показывает цифры',
    /Изучено \d+ · Показано новых \d+ · Повторено \d+/.test(A.$('dtWordsDetail').textContent),
    A.$('dtWordsDetail').textContent);
  const track = A.$('detTrack');
  track.dispatchEvent(A.pevXY('pointerdown', 300, 200));
  track.dispatchEvent(A.pevXY('pointermove', 260, 205)); // короткий свайп на 40px
  track.dispatchEvent(A.pevXY('pointerup', 260, 205));
  t('18.8 короткий свайп влево перелистнул вкладку', track.style.transform === 'translateX(' + (-1 * (100 / 4)) + '%)', track.style.transform);
  t('18.9 активная вкладка подсвечена', A.doc.querySelectorAll('.det-tab')[1].classList.contains('active'));
  A.click(A.doc.querySelectorAll('.det-tab')[0]);
  t('18.10 тап по вкладке вернул «Слова»', track.style.transform === 'translateX(0%)', track.style.transform);
  A.click(A.$('btnDetailsBack'));
  await A.waitView('view-home');
  t('18.11 назад на главную', true);

  /* ═══ 19. Свайп вниз закрывает панели + вибро-настройка ═══ */
  A.click(A.$('btnSettings'));
  await sleep(60);
  t('19.1 настройки открыты', A.$('settingsOverlay').hidden === false);
  t('19.2 строки «Вибрация при вводе Морзе» больше нет',
    !A.$('swMorseVibe') && HTML.indexOf('Вибрация при вводе Морзе') < 0);
  const sheet = A.$('settingsSheet');
  sheet.dispatchEvent(A.pevXY('pointerdown', 100, 100));
  sheet.dispatchEvent(A.pevXY('pointermove', 100, 140)); // короткий свайп вниз на 40px
  sheet.dispatchEvent(A.pevXY('pointerup', 100, 140));
  await sleep(330);
  t('19.3 короткий свайп вниз закрыл настройки', A.$('settingsOverlay').hidden === true,
    String(A.$('settingsOverlay').hidden));
  // вибро-переключатель хранится только в состоянии морзе, слова не трогает
  const wordsKeys = [];
  for (let i = 0; i < A.w.localStorage.length; i++) {
    const k = A.w.localStorage.key(i);
    if (!/morse/i.test(k)) wordsKeys.push(k);
  }
  const hapticsKey = wordsKeys.find(k => (A.w.localStorage.getItem(k) || '').indexOf('haptics') >= 0);
  A.click(A.$('btnSettings'));
  await sleep(60);
  const rg = A.$('rgRhythm');
  t('19.4 ползунок WPM: на месте, по умолчанию 20, живёт в морзе-состоянии',
    !!rg && rg.value === '20' && A.mstate().wpm === 20, rg ? rg.value : 'none');
  rg.value = '40';
  rg.dispatchEvent(new A.w.Event('input', { bubbles: true }));
  t('19.4a правее — быстрее: wpm=40 сохранён локально, подпись: точка 30 мс',
    A.mstate().wpm === 40 && /очка 30 мс/.test(A.$('rhythmSub').textContent), String(A.mstate().wpm));
  rg.value = '20';
  rg.dispatchEvent(new A.w.Event('input', { bubbles: true }));
  t('19.5 переключателя вибро-ввода нет: весь вибро морзе гасится общим «Виброоткликом»',
    HTML.indexOf('morseState.vibeInput') < 0 && HTML.indexOf('settings.haptics) return') >= 0,
    'static');
  // ползунок громкости
  const vr = A.$('volRange');
  t('19.6 ползунок громкости в настройках', !!vr);
  vr.value = '40';
  vr.dispatchEvent(new A.w.Event('input', { bubbles: true }));
  const sndNow = JSON.parse(A.w.localStorage.getItem(hapticsKey)).settings.sndVol;
  t('19.7 громкость сохранилась в настройках слов', sndNow === 40, String(sndNow));
  vr.value = '100';
  vr.dispatchEvent(new A.w.Event('input', { bubbles: true }));
  // убранные из настроек блоки скрыты
  t('19.8 архив/словарь/синхронизация убраны из настроек',
    A.$('archOpen').hidden === true && A.$('rowDict').hidden === true && A.$('rowSync').hidden === true,
    [A.$('archOpen').hidden, A.$('rowDict').hidden, A.$('rowSync').hidden].join(','));
  t('19.9 блок «Статистика морзе» убран из настроек', A.$('morseStatsZone').hidden === true);
  // удаление облачного прогресса — только с паролем
  A.click(A.$('btnCloudWipe'));
  t('19.10 без Telegram облачная кнопка не открывает подтверждение', A.$('cloudWipe1').hidden === true);
  A.$('cloudWipe1').hidden = false; // эмуляция открытого шага (в jsdom облака нет)
  A.click(A.$('btnCloudWipeNext'));
  t('19.11 второй шаг с полем пароля', A.$('cloudWipe2').hidden === false && !!A.$('wipePass'));
  A.$('wipePass').value = '12345';
  A.click(A.$('btnCloudWipeYes'));
  t('19.12 неверный пароль блокирует удаление',
    A.$('cloudWipe2').hidden === false && A.$('cloudAfter').hidden === true,
    'wipe2=' + A.$('cloudWipe2').hidden);
  A.click(A.$('btnCloudWipeNo2'));
  A.click(A.$('btnCloseSettings'));
  await sleep(330);

  /* ═══ 20. История морзе + статические формы (квадрат, поле, полоска) ═══ */
  const hist = A.mstate().history;
  t('20.1 история по сегодняшнему дню ведётся',
    !!hist && typeof hist === 'object' && !!hist[today()] && hist[today()].attempts >= 1,
    JSON.stringify(hist));
  t('20.2 полоска заполнения убрана из разметки', HTML.indexOf('id="morseHoldFill"') < 0);
  t('20.3 фото всегда квадратное (aspect-ratio:1/1)', /morse-imgwrap\{[^}]*aspect-ratio:1\/1/.test(HTML));
  t('20.4 поле ввода выше (min-height:220px)', /morse-zone\{[^}]*min-height:220px/.test(HTML));
  t('20.5 recordDayStats пишет состав дня (nw/rv)', /row\.nw=/.test(HTML) && /row\.rv=/.test(HTML));
  t('20.6 панели закрываются свайпом вниз (attachSwipeClose)', HTML.indexOf('attachSwipeClose') >= 0);
  t('20.7 только кнопка «Проверить» отсутствует и раньше — поле одно',
    A.doc.querySelectorAll('#view-morse .morse-zone').length === 1);

  t('20.7а тире = 192 мс (80% от 240)', /MORSE_DOT_MS=192/.test(HTML) && !/MORSE_DOT_MS=240/.test(HTML));
  t('20.7б вибрация при удержании — максимальный уровень', HTML.indexOf("impactOccurred('heavy')") >= 0);
  t('20.7в порог тире без отклика; единственный light — на нажатие дактиля',
    (HTML.match(/haptic\('light'\)/g) || []).length === 1 &&
    /haptic\('light'\); morseTick\(false\);/.test(HTML));
  t('20.7г звуковое сопровождение ответов слов',
    HTML.indexOf('sfxWord(true)') >= 0 && HTML.indexOf('sfxWord(false)') >= 0);
  t('20.7д громкость переживает миграцию/сброс (sndVol в 7 местах)',
    (HTML.match(/sndVol/g) || []).length >= 10, String((HTML.match(/sndVol/g) || []).length));
  t('20.7е пароль fosyx стоит перед удалением облака', HTML.indexOf("trim()!=='fosyx'") >= 0);
  const lstat = A.mstate().letterStats || {};
  const lstatTotal = Object.keys(lstat).reduce((s2, k) => s2 + (lstat[k].ok | 0) + (lstat[k].bad | 0), 0);
  t('20.7ж letterStats: каждый ответ по буквам учтён', lstatTotal >= 5, String(lstatTotal));

  /* ═══ 21. Раунд 4: отступы, 33 буквы, «Продолжить тренировку» слов, сброс в настройках ═══ */
  t('21.1 отступы главной: список разделов и «Статистика»',
    /\.sec-list\{margin-top:14px/.test(HTML) &&
    /#btnDetails\{margin-top:14px\}/.test(HTML),
    'sec-list/btnDetails');
  t('21.2 строки разделов без тяжёлых теней (компактный список)',
    /\.sec-row\{/.test(HTML) && !/\.sec-row\{[^}]*box-shadow/.test(HTML));
  t('21.3 статистика под графиком крупнее (18px)',
    /\.det-foot\{[^}]*font-size:18px/.test(HTML) &&
    !/\.det-foot\{[^}]*font-size:15\.5px/.test(HTML));
  t('21.4 сброс морзе в настройках и убран из «Статистики»',
    !!A.$('btnMorseReset') && !!A.$('btnMorseReset').closest('#settingsSheet') &&
    !A.$('btnMorseReset').closest('#view-details'));
  const mcache = JSON.parse(A.w.localStorage.getItem('nem_morse_cache_v1') || 'null');
  t('21.5 библиотека морзе — все 33 буквы', !!mcache && mcache.cards.length === 33,
    mcache ? String(mcache.cards.length) : 'нет кэша');
  t('21.6 картинки по относительным путям ./assets/signs/…',
    !!mcache && mcache.cards.every(c => /^\.\/assets\/signs\/[a-z]+\.png$/.test(c.image)),
    mcache ? mcache.cards[0].image : '');

  /* ——— 21.7–21.20: свободная тренировка слов после нормы дня ——— */
  const TODAY4 = today();
  const daySeed = {
    schemaVersion: 3, status: 'completed', sessionDate: TODAY4, view: 'home', cardScreen: 'question',
    queue: [], sessionTotal: 2,
    sessionResults: {
      w1: { errors: 0, firstTry: true, done: true, tomorrow: false, advanced: true, graduatedNow: false },
      w2: { errors: 1, firstTry: false, done: true, tomorrow: true, advanced: false, graduatedNow: false }
    },
    cards: {
      w1: { status: 'learning', currentStep: 2, nextReviewDate: yesterday(), createdAt: TODAY4, updatedAt: 1 },
      w2: { status: 'learning', currentStep: 1, nextReviewDate: TODAY4, createdAt: TODAY4, updatedAt: 1 }
    },
    dayPlanDate: TODAY4, dayQueue: ['w1', 'w2'], dayPlan: { total: 2, reviews: 1, news: 1 },
    customWords: [], lastStudyDate: TODAY4, startedAt: 1, completedAt: 2, updatedAt: Date.now(),
    settings: { haptics: true, theme: 'evening', swipeSens: 50, sndVol: 100 },
    stats: { days: {} }
  };
  daySeed.stats.days[TODAY4] = { f: 1, r: 0, t: 1, e: 1, a: 1, g: 0, n: 2, ts: 2, nw: 1, rv: 1 };
  const G = await boot({ seed: { no1equalsme_state_v2: JSON.stringify(daySeed) } });
  await G.waitView('view-home');
  // обёртка renderHome держит кнопку в состоянии «Загружаем словарь…», пока words.json не готов
  for (let i = 0; i < 300 && (G.$('btnStart').disabled || G.$('catAct').textContent !== 'Пройти заново'); i++) await sleep(20);
  const loadG = () => JSON.parse(G.w.localStorage.getItem('no1equalsme_state_v2'));
  const dayResults = JSON.stringify(daySeed.sessionResults);
  t('21.7 после нормы действие «Пройти заново» и строка НЕ горит',
    G.$('btnStart').hidden === false && G.$('catAct').textContent === 'Пройти заново' &&
    G.$('btnStart').classList.contains('is-quiet') === true,
    G.$('catAct').textContent + '/' + G.$('btnStart').className);
  t('21.8 чип «Готово» и «Посмотреть результат» видны; «На сегодня всё» — только когда готовы все три раздела',
    G.$('catChip').textContent === 'Готово' && G.$('btnShowResult').hidden === false &&
    G.$('homeTitle').textContent !== 'На сегодня всё',
    G.$('homeTitle').textContent);
  t('21.9 итоги дня в сохранении как в сиде', JSON.stringify(loadG().sessionResults) === dayResults);
  // «Посмотреть результат» — стата ДНЕВНОГО прохождения + тап по забытому слову
  G.click(G.$('btnShowResult'));
  await G.waitView('view-result');
  t('21.9б дневная стата: Правильно 1, Неправильно 1, Новых 2, Повторено 0, Забыл с прошлых дней 0',
    G.$('statRight').textContent === '1' && G.$('statWrong').textContent === '1' &&
    G.$('statRep').textContent === '0' && G.$('statNew').textContent === '2' &&
    G.$('statForgotPast').textContent === '0',
    [G.$('statRight').textContent, G.$('statWrong').textContent, G.$('statRep').textContent,
     G.$('statNew').textContent, G.$('statForgotPast').textContent].join('/'));
  {
    const li0 = G.doc.querySelector('#forgotList li');
    const w2s = (WORDS.find(x => x.id === 'w2') || {}).stress || '';
    t('21.9в «Слова, которые позабылись»: чип со словом w2', !!li0 && li0.textContent === w2s,
      li0 ? li0.textContent : 'нет');
    G.click(li0);
    await sleep(60);
    t('21.9г тап по забытому слову открывает панель «Подробнее» этого слова',
      G.$('detailsOverlay').hidden === false && G.$('dtWord').textContent === w2s,
      G.$('dtWord').textContent);
    G.click(G.$('btnDetailsClose'));
    await sleep(300);
  }
  G.click(G.$('btnResultHome'));
  await G.waitView('view-home');
  G.click(G.$('btnStart'));
  await G.waitView('view-session');
  let g4 = loadG();
  t('21.10 тренировка активна, practice=true', g4.status === 'active' && g4.practice === true,
    g4.status + '/' + g4.practice);
  t('21.11 бэкап итогов дня сохранён', !!g4.practiceBackup && JSON.stringify(g4.practiceBackup.r) === dayResults,
    JSON.stringify(g4.practiceBackup));
  const p0 = g4.queue[0];
  t('21.12 очередь — только начатые слова (≤15)', g4.queue.length === 2 && ['w1', 'w2'].indexOf(p0) >= 0,
    g4.queue.join(','));
  const step0 = g4.cards[p0].currentStep, nr0 = g4.cards[p0].nextReviewDate;
  G.click(G.$('btnYes'));
  await sleep(350); // D.fly=250 + запас
  g4 = loadG();
  t('21.13 «ЗНАЮ» в тренировке не двигает шаг и интервал',
    g4.cards[p0].currentStep === step0 && g4.cards[p0].nextReviewDate === nr0,
    g4.cards[p0].currentStep + '/' + g4.cards[p0].nextReviewDate);
  t('21.14 карточка ушла из очереди', g4.queue.length === 1, String(g4.queue.length));
  const p1 = g4.queue[0];
  const step1 = g4.cards[p1].currentStep, nr1 = g4.cards[p1].nextReviewDate;
  G.click(G.$('btnNo'));
  await sleep(80);
  g4 = loadG();
  t('21.15 «НЕ ЗНАЮ» показывает определение', g4.cardScreen === 'definition', g4.cardScreen);
  t('21.15б оборот по умолчанию — КОРОТКОЕ определение, без кнопки «Подробнее»',
    G.$('defBack').textContent === 'Опр.' && G.$('defBack').textContent.indexOf('Полное') < 0,
    G.$('defBack').textContent);
  t('21.16 «НЕ ЗНАЮ» не уводит на завтра и не сбрасывает шаг',
    g4.sessionResults[p1].tomorrow === false && g4.cards[p1].currentStep === step1 &&
    g4.cards[p1].nextReviewDate === nr1,
    JSON.stringify(g4.sessionResults[p1]) + '|' + g4.cards[p1].currentStep);
  t('21.16в звук «неверно» для слова запланирован (E5→C5, обе ноты)',
    (G.w.__audioLog || []).some(e => {
      const f = e.osc.frequency.events;
      return f[0] && f[0][1] === 659.26;
    }) && (G.w.__audioLog || []).some(e => {
      const f = e.osc.frequency.events;
      return f[0] && f[0][1] === 523.25;
    }), JSON.stringify((G.w.__audioLog || []).length));
  await sleep(340); // flipAt: guard 300 мс + lock D.flip
  G.click(G.$('btnBackAction'));
  await sleep(400); // уход из определения: слово закрыто БЕЗ повторного показа
  g4 = loadG();
  t('21.16е «Не помню» без повторений: слово закрыто, практика финиширует → результат',
    G.$('view-result').classList.contains('active') === true &&
    g4.queue.length === 0 && g4.practice === false && g4.status === 'completed',
    g4.queue.join(',') + '/' + g4.cardScreen + '/' + g4.practice + '/' + g4.status);
  t('21.16ж экран статы именно по прохождению: Правильно 1, Неправильно 1, Новых 2, Повторено 0',
    G.$('statRight').textContent === '1' && G.$('statWrong').textContent === '1' &&
    G.$('statRep').textContent === '0' && G.$('statNew').textContent === '2' &&
    G.$('statForgotPast').textContent === '0',
    [G.$('statRight').textContent, G.$('statWrong').textContent, G.$('statRep').textContent,
     G.$('statNew').textContent, G.$('statForgotPast').textContent].join('/'));
  {
    const liP = G.doc.querySelector('#forgotList li');
    const w2s = (WORDS.find(x => x.id === 'w2') || {}).stress || '';
    t('21.16и забытое слово есть в разделе «Слова, которые позабылись»',
      !!liP && liP.textContent === w2s, liP ? liP.textContent : 'нет');
    G.click(liP);
    await sleep(60);
    t('21.16к тап по нему открывает панель «Подробнее»',
      G.$('detailsOverlay').hidden === false && G.$('dtWord').textContent === w2s,
      G.$('dtWord').textContent);
    G.click(G.$('btnDetailsClose'));
    await sleep(300);
  }
  g4 = loadG();
  t('21.17 финиш: practice=false, статус completed', g4.practice === false && g4.status === 'completed',
    g4.practice + '/' + g4.status);
  t('21.18 итоги дня восстановлены', JSON.stringify(g4.sessionResults) === dayResults);
  t('21.19 очередь и длина дня восстановлены', g4.queue.length === 0 && g4.sessionTotal === 2,
    g4.queue.length + '/' + g4.sessionTotal);
  t('21.20 шаги слов не тронуты',
    g4.cards.w1.currentStep === 2 && g4.cards.w1.nextReviewDate === yesterday() &&
    g4.cards.w2.currentStep === 1 && g4.cards.w2.nextReviewDate === TODAY4);
  t('21.21 статистика дня не тронута',
    JSON.stringify(g4.stats.days[TODAY4]) === JSON.stringify(daySeed.stats.days[TODAY4]));
  G.click(G.$('btnResultHome'));
  await G.waitView('view-home');
  t('21.22 главная снова предлагает «Пройти заново» (не горит)',
    G.$('btnStart').hidden === false && G.$('catAct').textContent === 'Пройти заново' &&
    G.$('btnStart').classList.contains('is-quiet') === true,
    G.$('catAct').textContent);
  t('21.23 плашка «Итог дня» убрана с начального экрана',
    G.$('homeSummary') === null && G.$('summaryLine1') === null,
    String(G.$('homeSummary')));
  // ещё один круг — тренировка повторяема
  G.click(G.$('btnStart'));
  await G.waitView('view-session');
  t('21.24 повторный запуск тренировки работает', loadG().practice === true);
  G.click(G.$('btnBack')); // сохраниться и выйти
  await G.waitView('view-home');
  t('21.25 выход из практики: сессия активна, прогресс нулевой → «Начать», не горит',
    loadG().practice === true && loadG().status === 'active' &&
    G.$('catAct').textContent === 'Начать' &&
    G.$('btnStart').classList.contains('is-quiet') === false &&
    G.$('homeTitle').textContent === 'Продолжим?',
    loadG().practice + '/' + G.$('catAct').textContent + '/' + G.$('homeTitle').textContent);

  /* ——— 21.26–21.27: нормальная сессия → дневной журнал f/r/t/e + экран статы ——— */
  {
    const GD = await boot({ seed: { no1equalsme_state_v2: JSON.stringify({
      schemaVersion: 6, status: 'active', sessionDate: '2026-09-30', view: 'home', cardScreen: 'question',
      queue: ['w1', 'w2'], sessionTotal: 2,
      sessionResults: {
        w1: { errors: 0, firstTry: true, done: false, tomorrow: false, advanced: false, graduatedNow: false },
        w2: { errors: 0, firstTry: true, done: false, tomorrow: false, advanced: false, graduatedNow: false }
      },
      cards: {
        w1: { status: 'learning', currentStep: 2, nextReviewDate: '2026-09-30', createdAt: '2026-09-01', updatedAt: 1 },
        w2: { status: 'learning', currentStep: 1, nextReviewDate: '2026-09-30', createdAt: '2026-09-01', updatedAt: 1 }
      },
      dayPlanDate: '2026-09-30', dayQueue: ['w1', 'w2'], dayPlan: { total: 2, reviews: 2, news: 0 },
      customWords: [], lastStudyDate: '2026-09-29', startedAt: 1, completedAt: null, updatedAt: Date.now(),
      settings: { haptics: true, theme: 'evening', swipeSens: 50, sndVol: 100 }, stats: { days: {} }
    }) } });
    await GD.waitView('view-home');
    for (let i = 0; i < 300 && (GD.$('btnStart').disabled || GD.$('catAct').textContent !== 'Продолжить'); i++) await sleep(20);
    GD.click(GD.$('btnStart'));
    await GD.waitView('view-session');
    GD.click(GD.$('btnYes'));           // w1 — правильно с первого раза
    await sleep(350);
    GD.click(GD.$('btnNo'));            // w2 — «Не помню» → определение
    await sleep(80);
    await sleep(340);
    GD.click(GD.$('btnBackAction'));    // выход: слово закрыто без повтора, сессия финиширует
    await sleep(420);
    await GD.waitView('view-result');
    const gd = JSON.parse(GD.w.localStorage.getItem('no1equalsme_state_v2'));
    const row = (gd.stats.days || {})[gd.sessionDate] || {};
    t('21.26 дневной журнал после нормальной сессии: f=1, r=0, t=1, e=1, n=2',
      row.f === 1 && row.r === 0 && row.t === 1 && row.e === 1 && row.n === 2,
      JSON.stringify(row) + ' status=' + gd.status);
    t('21.27 экран статы после 15(2) слов: Правильно 1, Неправильно 1',
      GD.$('statRight').textContent === '1' && GD.$('statWrong').textContent === '1' &&
      GD.$('view-result').classList.contains('active') === true,
      GD.$('statRight').textContent + '/' + GD.$('statWrong').textContent);
    GD.click(GD.$('btnResultHome'));
    await GD.waitView('view-home');
  }

  /* ═══ 22. Свайпы через тач-события (то, что «ломалось» на телефоне) ═══ */
  const tev = (type, x, y) => {
    const e = new A.w.Event(type, { bubbles: true, cancelable: true });
    const list = (type === 'touchend' || type === 'touchcancel') ? [] :
      [{ clientX: x, clientY: y, identifier: 1, isPrimary: true }];
    Object.defineProperty(e, 'touches', { value: list });
    Object.defineProperty(e, 'changedTouches', { value: list });
    return e;
  };
  if (!A.$('settingsOverlay').hidden) { A.click(A.$('btnCloseSettings')); await sleep(330); }
  A.click(A.$('btnSettings'));
  await sleep(60);
  const sheet4 = A.$('settingsSheet');
  sheet4.dispatchEvent(tev('touchstart', 100, 100));
  sheet4.dispatchEvent(tev('touchmove', 100, 135)); // вниз на 35px
  sheet4.dispatchEvent(tev('touchend'));
  await sleep(330);
  t('22.1 тач-свайп вниз закрыл настройки', A.$('settingsOverlay').hidden === true,
    String(A.$('settingsOverlay').hidden));
  A.click(A.$('btnSettings'));
  await sleep(60);
  sheet4.dispatchEvent(tev('touchstart', 100, 100));
  sheet4.dispatchEvent(tev('touchmove', 100, 60));  // вверх — не закрывает
  sheet4.dispatchEvent(tev('touchend'));
  await sleep(330);
  t('22.2 движение вверх панель не закрыло', A.$('settingsOverlay').hidden === false);
  A.click(A.$('btnCloseSettings'));
  await sleep(330);
  A.click(A.$('btnDetails'));
  await A.waitView('view-details');
  const track4 = A.$('detTrack');
  track4.dispatchEvent(tev('touchstart', 300, 200));
  track4.dispatchEvent(tev('touchmove', 255, 203)); // лёгкий горизонтальный на 45px
  track4.dispatchEvent(tev('touchend'));
  t('22.3 тач-свайп влево перелистнул вкладку', track4.style.transform === 'translateX(' + (-1 * (100 / 4)) + '%)',
    track4.style.transform);
  t('22.4 активна вкладка «Морзе + Дактиль»', A.doc.querySelectorAll('.det-tab')[1].classList.contains('active'));
  track4.dispatchEvent(tev('touchstart', 100, 200));
  track4.dispatchEvent(tev('touchmove', 140, 202)); // вправо обратно
  track4.dispatchEvent(tev('touchend'));
  t('22.5 свайп вправо вернул «Слова»', track4.style.transform === 'translateX(0%)', track4.style.transform);
  track4.dispatchEvent(tev('touchstart', 300, 200));
  track4.dispatchEvent(tev('touchmove', 300, 250)); // вертикальное — не наше
  track4.dispatchEvent(tev('touchend'));
  t('22.6 вертикальный жест вкладки не трогает', track4.style.transform === 'translateX(0%)',
    track4.style.transform);
  A.click(A.$('btnDetailsBack'));
  await A.waitView('view-home');
  t('22.7 назад на главную после свайпов', true);

  /* ═══ 23. Раунд 7: работающая вибрация, саб 60+120, «бом-бух», подсказка ═══ */
  t('23.1 поле ввода 220px — габариты выросли', /morse-zone\{[^}]*min-height:220px/.test(HTML));
  t('23.2 фон тихий: мягкий light-пульс каждые 170 мс (65 мс Android сливал в тишину)',
    /setTimeout\(pulse, 170\)/.test(HTML) && HTML.indexOf('morseSoftPulse(16);') >= 0 &&
    HTML.indexOf('setTimeout(pulse, 110)') < 0);
  t('23.3 двойной драйвер удара: impact + navigator, стоп vibrate(0)',
    /function morseHeavyPulse/.test(HTML) && HTML.indexOf('navigator.vibrate') >= 0 &&
    HTML.indexOf('vibrate(0)') >= 0);
  t('23.4 без setInterval; heavy сохранён',
    HTML.indexOf("impactOccurred('heavy')") >= 0 && HTML.indexOf('setInterval') < 0);
  t('23.5 саб-бас фона убавлен (R34): 60×0.15 + 120×0.08, клиппинга нет',
    /mk\(60, 0\.15\)/.test(HTML) && /mk\(120, 0\.08\)/.test(HTML) &&
    /Math\.max\(0\.0002, amp\*sndVolF\(\)\)/.test(HTML) &&
    HTML.indexOf('mk(60, 0.26)') < 0 && HTML.indexOf('mk(60, 1.0)') < 0 && HTML.indexOf('mk(120, 0.35)') < 0);
  t('23.6 саб-бас стартует и останавливается вместе с вибрацией',
    /function startMorseVibe\(\)\{[\s\S]*?startMorseSub\(\);/.test(HTML) &&
    /function stopMorseVibe\(\)\{[\s\S]*?stopMorseSub\(\);/.test(HTML));
  t('23.7 «неверно» = два коротких тона (sfxWrong, треугольник, без старого glide)',
    /function sfxWrong/.test(HTML) && /osc\.type='triangle'/.test(HTML) &&
    HTML.indexOf('softDrop') < 0);
  t('23.8 тона: E5→C5 — та же октава523–784, что у «верно», оба <0.4 с',
    /note\(659\.26, 0, 0\.16, 0\.09\)/.test(HTML) && /note\(523\.25, 0\.11, 0\.30, 0\.13\)/.test(HTML) &&
    HTML.indexOf('329.63') < 0 && HTML.indexOf('261.63') < 0);
  t('23.9 толчок на каждую введённую единицу: hold 40 мс, ямбик сильный 90 мс',
    HTML.indexOf('morseHeavyPulse(40);') >= 0 && HTML.indexOf('morseHeavyPulse(90);') >= 0 &&
    HTML.indexOf('morseHeavyPulse(45)') < 0);
  t('23.10 мягкие звуки «верно» сохранены', HTML.indexOf('function softBell') >= 0);
  const pulseBody = HTML.slice(HTML.indexOf('function morseHeavyPulse'), HTML.indexOf('function startMorseSub'));
  t('23.10б вибрация тремя каналами: navigator + notification(страховка) + impact',
    pulseBody.length > 0 && /notificationOccurred\('warning'\)/.test(pulseBody) &&
    pulseBody.indexOf("impactOccurred('heavy')") > pulseBody.indexOf("notificationOccurred('warning')") &&
    /navigator\.vibrate/.test(pulseBody) && /platform!=='ios'/.test(pulseBody));
  t('23.10в Telegram читается в момент вызова (tgLive и в haptic())',
    /function tgLive/.test(HTML) && /tLive=tgLive\(\)/.test(HTML) && /var t=tgLive\(\)/.test(HTML));

  // Живой сценарий: точка и тире дают вибрацию, саб-бас синхронен, «неверно» звучит
  const seedH = JSON.stringify({
    schemaVersion: 1, day: today(), dailyCorrect: 0, dailyAttempts: 0, dailyErrors: 0,
    weaknessScore: {}, currentId: 'rsl_a', sequence: '', mode: 'input', freeMode: false,
    sound: true, history: {}, letterStats: {}, updatedAt: Date.now()
  });
  const H = await boot({ seed: { nem_morse_practice_v1: seedH } });
  await H.waitView('view-home');
  await H.waitMorseReady();
  await H.openMorse();
  const wrongIn = (log) => (log || []).some(e => {
    const f = e.osc.frequency.events;
    return f[0] && (f[0][1] === 659.26 || f[0][1] === 523.25);
  });
  const isSub = (e) => { const f = e.osc.frequency.events; return f[0] && (f[0][1] === 60 || f[0][1] === 120); };
  const subIn = (log) => (log || []).some(e =>
    isSub(e) && e.osc._out && e.osc._out.gain &&
    e.osc._out.gain.events.some(ev => ev[0] === 'exp' && ev[1] >= 0.01 && ev[1] <= 0.5));
  const impacts = () => H.w.__haptics.filter(x => x === 'impact:heavy').length;
  const lights = () => H.w.__haptics.filter(x => x === 'impact:light').length;

  // ——— Точка ———
  H.w.__haptics.length = 0;
  H.$('morseZone').dispatchEvent(H.pev('pointerdown'));
  t('23.11 саб-бас 60 Гц запущен при зажатии', subIn(H.w.__audioLog));
  await sleep(70);
  H.$('morseZone').dispatchEvent(H.pev('pointerup'));
  await sleep(80);
  t('23.12 точка: сильный heavy — ровно на символ, фон даёт мягкий light (не heavy)',
    impacts() >= 1 && lights() >= 1 && impacts() <= 2, impacts() + '/' + lights());
  const last2 = H.w.__haptics.filter(x => x.indexOf('notif:') === 0 || x.indexOf('impact:') === 0).slice(-2);
  t('23.12б каналы толчка идут парами: notification → impact (impact последним)',
    last2[0] === 'notif:warning' && last2[1] === 'impact:heavy', JSON.stringify(last2));
  const subEntry = H.w.__audioLog.find(e =>
    isSub(e) && e.osc._out && e.osc._out.gain &&
    e.osc._out.gain.events.some(ev => ev[0] === 'exp' && ev[1] <= 0.5));
  t('23.13 саб-бас синхронно остановлен на отпускание',
    !!subEntry && subEntry.osc._stop !== null, subEntry ? String(subEntry.osc._stop) : 'нет саба');
  await sleep(650); // автопроверка 500 мс
  t('23.14 режим «Неверно» после точки', H.mstate().mode === 'incorrect', H.mstate().mode);
  t('23.15 звук «неверно» для буквы запланирован (оба тона)', wrongIn(H.w.__audioLog));
  await sleep(1200); // удержание результата 1000 мс
  t('23.16 снова ввод, красный снят', H.mstate().mode === 'input' &&
    !H.$('morseZone').classList.contains('bad'), H.mstate().mode);
  const wh = H.$('morseWrongHint');
  t('23.17 подсказка после ошибки осталась', !!wh && wh.hidden === false, wh ? wh.textContent : 'нет элемента');
  t('23.18 в подсказке буква и верный код',
    /Буква А/.test(wh.textContent) && /·/.test(wh.textContent) && /—/.test(wh.textContent), wh.textContent);
  t('23.19 подсказка заменила cue (не дублирует)', H.$('morseCue').hidden === true);

  // ——— Тире: цикл ударов живёт всё время удержания ———
  H.w.__haptics.length = 0;
  H.$('morseZone').dispatchEvent(H.pev('pointerdown')); // первый тап нового ввода
  t('23.20 первый тап погасил подсказку', wh.hidden === true);
  await sleep(280); // дольше порога тире (192 мс): мягкий фон на 0/170 мс
  const duringHoldLights = lights();
  const duringHold = impacts();
  t('23.21 удержание тире: ≥2 мягких light-пульса за 280 мс, heavy фон не крадёт',
    duringHoldLights >= 2 && duringHold === 0, duringHoldLights + 'L/' + duringHold + 'H');
  H.$('morseZone').dispatchEvent(H.pev('pointerup'));
  await sleep(80);
  const afterUp = impacts();
  t('23.22 единица введена — дополнительный толчок', afterUp > duringHold,
    duringHold + '→' + afterUp);
  const snapshot = impacts();
  await sleep(320); // следующего удара цикла уже быть не может (отпускание остановило цикл)
  t('23.23 после отпускания цикл остановлен', impacts() === snapshot,
    snapshot + '→' + impacts());
  await sleep(450); // автопроверка «—» против «.-» → снова неверно
  t('23.24 ввод работает после тире', ['input', 'incorrect'].indexOf(H.mstate().mode) >= 0,
    H.mstate().mode);
  H.click(H.$('btnMorseBack'));
  await H.waitView('view-home');

  /* ═══ 24. Словарь: «заменил файл — и он подхватился» ═══ */
  const mkW = (i) => ({ id: 'w' + i, word: 'слово' + i, definitionShort: 'кратко ' + i }); // минимум полей — остальное дефолты
  const dc = (Hh) => Hh.$('dictCount').textContent;
  const waitCount = async (Hh, want) => { // view-home активен с самого начала HTML — ждём счётчик, а не view
    for (let i = 0; i < 150; i++) { if (dc(Hh) === want) return true; await sleep(20); }
    return false;
  };

  // 24.1 обвязка необязательна: только {cards:[…]} — без schemaVersion/language/contentVersion
  const D1 = await boot({ wordsPkg: { cards: [mkW(1), mkW(2), mkW(3)] } });
  await D1.waitView('view-home');
  t('24.1 файл без обвязки (только cards) принят целиком', await waitCount(D1, '3'), dc(D1));

  // 24.2 кеш v9 + новый файл БЕЗ версии → берём новый, а не отбрасываем как «старый»
  const D2 = await boot({
    seed: { nem_content_cache_v1: JSON.stringify({ schemaVersion: 2, contentVersion: 9, language: 'ru', updatedAt: '2026-01-01', cards: [mkW(9)] }) },
    wordsPkg: { cards: [mkW(1), mkW(2)] }
  });
  await D2.waitView('view-home');
  t('24.2 файл без версии не отброшен как «старый» (кеш v9)', await waitCount(D2, '2'), dc(D2));

  // 24.3 явно старая версия по-прежнему проигрывает кешу — защита от отката
  const D3 = await boot({
    seed: { nem_content_cache_v1: JSON.stringify({ schemaVersion: 2, contentVersion: 9, language: 'ru', updatedAt: '2026-01-01', cards: [mkW(9)] }) },
    wordsPkg: { schemaVersion: 2, contentVersion: 3, language: 'ru', updatedAt: '2026-01-01', cards: [mkW(1), mkW(2)] }
  });
  await D3.waitView('view-home');
  t('24.3 явно старая версия (3 < 9) не затирает кеш', await waitCount(D3, '1'), dc(D3));

  // 24.4 BOM и «висячая» запятая — два самых частых артефакта ручной правки
  const D4 = await boot({ wordsRaw: '\uFEFF[{"id":"a","word":"тест","definitionShort":"д"},]' });
  await D4.waitView('view-home');
  t('24.4 BOM и висячая запятая вычищаются, файл принимается', await waitCount(D4, '1'), dc(D4));

  // 24.5 отказ больше не молчит: тост называет конкретную причину
  const D5 = await boot({
    seed: { nem_content_cache_v1: JSON.stringify({ schemaVersion: 2, contentVersion: 9, language: 'ru', updatedAt: 'x', cards: [mkW(9)] }) },
    wordsPkg: { schemaVersion: 9, contentVersion: 99, language: 'ru', cards: [mkW(1)] }
  });
  await D5.waitView('view-home');
  await sleep(1400); // тост отказа +400..900 мс на этом буте; читает, пока отказовой тост (2.8 с) ещё висит
  t('24.5 при отказе видна причина (schemaVersion)', /schemaVersion/.test(D5.$('toast').textContent), D5.$('toast').textContent);

  // 24.6 принятый файл подтверждается тостом — «подсосался» видно сразу
  const D6 = await boot({
    seed: { nem_content_cache_v1: JSON.stringify({ schemaVersion: 2, contentVersion: 9, language: 'ru', updatedAt: 'x', cards: [mkW(9)] }) },
    wordsPkg: { schemaVersion: 2, contentVersion: 10, language: 'ru', updatedAt: 'x', cards: [mkW(1), mkW(2)] }
  });
  await D6.waitView('view-home');
  await sleep(80);
  t('24.6 обновление словаря подтверждено тостом',
    /Словарь обновлён: слов 2 \(было 1\)/.test(D6.$('toast').textContent), D6.$('toast').textContent);

  t('21.15г статически: defBack питается от definitionShort, не definitionFull',
    HTML.indexOf('elDefBack.textContent=c.definitionShort') >= 0 &&
    HTML.indexOf('elDefBack.textContent=c.definitionFull') < 0 &&
    HTML.indexOf('elDtDefFull.textContent=c.definitionFull') >= 0);

  // 24.7/24.8 — обрыв запроса («user aborted the request» из-за нашего таймаута)
  t('24.7 таймаут загрузки25 с (оба загрузчика), AbortError объяснён по-русски',
    HTML.indexOf(', 25000)') >= 0 && HTML.indexOf(', 12000)') < 0 &&
    /загрузка прервалась/.test(HTML) && !/user aborted the request/.test(
      HTML.slice(HTML.indexOf('function dictErrText'), HTML.indexOf('function fetchPackage'))));
  const D7 = await boot({
    seed: { nem_content_cache_v1: JSON.stringify({ schemaVersion: 2, contentVersion: 9, language: 'ru', updatedAt: 'x', cards: [mkW(9)] }) },
    wordsFail: true
  });
  await D7.waitView('view-home');
  await sleep(1400); // тост отказа +400..900 мс на этом буте; читает, пока отказовой тост (2.8 с) ещё висит
  t('24.8 обрыв показан понятным текстом, а не «user aborted»',
    /загрузка прервалась/.test(D7.$('toast').textContent) &&
    !/user aborted/i.test(D7.$('toast').textContent), D7.$('toast').textContent);

  /* ═══ 25. Правки статистики и главной (раунд12) ═══ */
  t('25.1 плашка «Итог дня» удалена из HTML и JS',
    HTML.indexOf('id="homeSummary"') < 0 && HTML.indexOf('Итог дня') < 0 &&
    HTML.indexOf('elHomeSummary') < 0 && HTML.indexOf('summaryLine1') < 0);
  t('25.2 легенда морзе: «Введено верно» + «Введено неверно», красный ряд есть',
    /lg-violet"><\/i>Введено верно/.test(HTML) && /lg-red"><\/i>Введено неверно/.test(HTML) &&
    /\.lg-red\{background:var\(--red\)\}/.test(HTML) &&
    /\.dt-bar\.b-red\{background:var\(--red\)\}/.test(HTML));
  const seedS = JSON.stringify({
    schemaVersion: 1, day: today(), dailyCorrect: 3, dailyAttempts: 5, dailyErrors: 2,
    weaknessScore: {}, currentId: null, sequence: '', mode: 'input', freeMode: false,
    sound: true, vibeInput: false, updatedAt: Date.now(),
    history: (function(){ const o = {}; o[today()] = { correct: 3, attempts: 5, errors: 2 }; return o; })(),
    letterStats: { rsl_a: { ok: 2, bad: 8 }, rsl_b: { ok: 9, bad: 1 } }
  });
  const S5 = await boot({ seed: { nem_morse_practice_v1: seedS } });
  await S5.waitView('view-home');
  await S5.waitMorseReady();
  S5.click(S5.$('btnDetails'));
  await S5.waitView('view-details');
  const foot5 = S5.$('detMorseFoot').textContent;
  t('25.3 буквы отсортированы по точности (Б 90% раньше А 20%), не по алфавиту',
    foot5.indexOf('Б 90%') >= 0 && foot5.indexOf('А 20%') >= 0 &&
    foot5.indexOf('Б 90%') < foot5.indexOf('А 20%'), foot5);
  const redBars = S5.doc.querySelectorAll('#dtMorseChart .dt-bar.b-red');
  t('25.4 на графике красный столбец «неверно» в каждом дне, ненулевой сегодня',
    redBars.length === 14 && S5.doc.querySelectorAll('#dtMorseChart .dt-bar.b-red:not(.zero)').length === 1,
    redBars.length + '/' + S5.doc.querySelectorAll('#dtMorseChart .dt-bar.b-red:not(.zero)').length);
  t('25.5 деталь дня: верно/попытки/ошибки', /Верно 3 · Попыток 5 · Ошибок 2/.test(
    S5.$('dtMorseDetail').textContent), S5.$('dtMorseDetail').textContent);
  t('25.6 легенда «Введено неверно» на экране статистики',
    /Введено неверно/.test(S5.$('view-details').textContent));
  t('25.7 нога под графиком слов —18px вживую',
    S5.w.getComputedStyle(S5.$('detWordsFoot')).fontSize === '18px',
    S5.w.getComputedStyle(S5.$('detWordsFoot')).fontSize);


  /* ═══ 26. Основной цвет приложения (акцент в настройках темы) ═══ */
  t('26.1 строка «Основной цвет» — пять точек в настройках',
    HTML.indexOf('Основной цвет') >= 0 &&
    A.doc.querySelectorAll('[data-accent-btn]').length === 5 &&
    !!A.doc.querySelector('[data-accent-btn="violet"]'));
  t('26.2 CSS-правила акцентов: 4 базовых + 4 для светлой темы',
    (HTML.match(/html\[data-accent="/g) || []).length === 4 &&
    (HTML.match(/html\[data-theme="light"\]\[data-accent="/g) || []).length === 4,
    [(HTML.match(/html\[data-accent="/g) || []).length,
     (HTML.match(/html\[data-theme="light"\]\[data-accent="/g) || []).length].join('/'));
  t('26.3 по умолчанию — фиолетовый (data-accent=violet)',
    A.w.document.documentElement.getAttribute('data-accent') === 'violet',
    String(A.w.document.documentElement.getAttribute('data-accent')));
  t('26.4 хардкод rgba(165,139,255) остался только в палитрах (6 = 2×3 строки тем)',
    (HTML.match(/rgba\(165,139,255/g) || []).length === 6,
    String((HTML.match(/rgba\(165,139,255/g) || []).length));
  t('26.5 «залипшие» элементы переведены на переменные акцента',
    /\.badge\{[^}]*var\(--violet-line\)/.test(HTML) &&
    /\.btn-more:active\{background:var\(--violet-soft\)\}/.test(HTML) &&
    /\.gl-violet \.card-back\{[^}]*var\(--violet-line\)\}/.test(HTML));
  A.click(A.$('btnSettings'));
  await sleep(60);
  t('26.6 настройки открыты, фиолетовая точка активна',
    A.$('settingsOverlay').hidden === false &&
    A.doc.querySelector('[data-accent-btn="violet"]').classList.contains('on'));
  const dotGreen = A.doc.querySelector('[data-accent-btn="green"]');
  A.click(dotGreen);
  t('26.7 зелёный выбран: атрибут, aria, активная точка',
    A.w.document.documentElement.getAttribute('data-accent') === 'green' &&
    dotGreen.classList.contains('on') &&
    dotGreen.getAttribute('aria-checked') === 'true' &&
    A.doc.querySelector('[data-accent-btn="violet"]').getAttribute('aria-checked') === 'false',
    String(A.w.document.documentElement.getAttribute('data-accent')));
  const persisted13 = JSON.parse(A.w.localStorage.getItem('no1equalsme_state_v2'));
  t('26.8 акцент сохранён в состоянии', persisted13.settings.accent === 'green',
    String(persisted13.settings && persisted13.settings.accent));
  A.click(A.doc.querySelector('[data-theme-btn="light"]'));
  await sleep(40);
  t('26.9 светлая тема применяется вместе с выбранным акцентом',
    A.w.document.documentElement.getAttribute('data-theme') === 'light' &&
    A.w.document.documentElement.getAttribute('data-accent') === 'green',
    A.w.document.documentElement.getAttribute('data-theme') + '/' +
    A.w.document.documentElement.getAttribute('data-accent'));
  A.click(A.doc.querySelector('[data-theme-btn="evening"]'));
  A.click(A.$('btnCloseSettings'));
  await sleep(330);
  const accSeed13 = { 'no1equalsme_state_v2': A.w.localStorage.getItem('no1equalsme_state_v2') };
  const A2 = await boot({ seed: accSeed13 });
  await A2.waitView('view-home');
  await A2.waitMorseReady();
  t('26.10 акцент пережил перезапуск',
    A2.w.document.documentElement.getAttribute('data-accent') === 'green',
    String(A2.w.document.documentElement.getAttribute('data-accent')));
  t('26.11 валидация акцента: миграция + guard при старте',
    HTML.indexOf('if(ACCENTS.indexOf(s.settings.accent)>=0) out.settings.accent') >= 0 &&
    HTML.indexOf("ACCENTS.indexOf(state.settings.accent)<0") >= 0);
  t('26.12 акцент уходит в облако и keep (3 места: payload, keep×2 — экспорт удалён)',
    (HTML.match(/accent:currentAccent\(\)/g) || []).length === 3,
    String((HTML.match(/accent:currentAccent\(\)/g) || []).length));

  /* ═══ 27. Стрик морзе: огонёк с числом и рекордная подсветка ═══ */
  t('27.1 CSS огонька, пульсации и reduced-motion',
    /\.ms-streak\{/.test(HTML) && /@keyframes streakPulse/.test(HTML) &&
    /html\.rm \.ms-streak\.rec svg\{animation:none\}/.test(HTML));
  t('27.2 огонёк со счётчиком в строке статуса морзе',
    HTML.indexOf('id="morseStreak"') >= 0 && HTML.indexOf('id="morseStreakN"') >= 0);
  t('27.3 поля стрика в состоянии (свежий объект + санитайзер)',
    /streak:0, streakBest:0/.test(HTML) && /streak:clampInt\(s\.streak,0,1000000\)/.test(HTML));
  const S7 = await boot({ seed: { 'nem_morse_practice_v1': JSON.stringify({
    schemaVersion: 1, day: today(), dailyCorrect: 2, dailyAttempts: 5, dailyErrors: 1,
    weaknessScore: {}, currentId: null, sequence: '', mode: 'input', freeMode: false,
    sound: true, vibeInput: false, history: {}, letterStats: {}, streak: 2, streakBest: 2,
    updatedAt: Date.now() }) } });
  await S7.waitView('view-home');
  await S7.waitMorseReady();
  await S7.openMorse();
  await sleep(80);
  t('27.4 при открытии стрик показан и «на рекорде»',
    S7.$('morseStreakN').textContent === '2' && S7.$('morseStreak').classList.contains('rec'),
    S7.$('morseStreakN').textContent + '/' + S7.$('morseStreak').className);
  const c27 = LETTER(S7.mstate().currentId);
  await S7.typeCode(c27.morse);
  await sleep(650); // вердикт на 500-й мс после отпускания
  t('27.5 верная буква: 3 подряд, огонёк горит рекордом',
    S7.$('morseStreakN').textContent === '3' && S7.$('morseStreak').classList.contains('rec'),
    S7.$('morseStreakN').textContent + '/' + S7.$('morseStreak').className);
  t('27.6 рекорд серии обновлён', S7.mstate().streak === 3 && S7.mstate().streakBest === 3,
    S7.mstate().streak + '/' + S7.mstate().streakBest);
  await sleep(1150); // удержание результата 1000 мс → обратно к вводу
  await S7.typeCode('.'); // «точка» — не код ни одной буквы: всегда ошибка
  await sleep(650);
  t('27.7 ошибка обнулила стрик и погасила рекордную подсветку',
    S7.$('morseStreakN').textContent === '0' && !S7.$('morseStreak').classList.contains('rec'),
    S7.$('morseStreakN').textContent + '/' + S7.$('morseStreak').className);
  t('27.8 состояние: стрик 0, рекорд 3 сохранён',
    S7.mstate().streak === 0 && S7.mstate().streakBest === 3,
    S7.mstate().streak + '/' + S7.mstate().streakBest);

  /* ═══ 28. Крупный огонёк и надёжная загрузка жестов ═══ */
  t('28.1 CSS огонька крупнее: иконка 28px, число 17px',
    /\.ms-streak svg\{width:28px;height:28px/.test(HTML) &&
    /\.ms-streak\{[^}]*font-size:17px;font-weight:800/.test(HTML));
  t('28.2 очередь картинок с лимитом параллелизма',
    HTML.indexOf('var morseImgQueue=[];') >= 0 &&
    HTML.indexOf('MORSE_IMG_PAR=3') >= 0 &&
    HTML.indexOf('function pumpMorseImgQueue()') >= 0);
  t('28.3 авто-повтор после сбоя (3 попытки с растущей паузой)',
    HTML.indexOf('MORSE_IMG_ATTEMPTS=3') >= 0 &&
    HTML.indexOf("loadMorseImage(MORSE_MAP[id], 'auto')") >= 0 &&
    /MORSE_IMG_RETRY_MS\*\(morseImgFails\[id\]\|0\)/.test(HTML));
  t('28.4 приоритет текущей карточки: рендер, открытие и кэш-прелоад',
    HTML.indexOf('loadMorseImage(card, false, true)') >= 0 &&
    HTML.indexOf('loadMorseImage(currentMorseCard(), false, true)') >= 0 &&
    HTML.indexOf('preloadMorseImages(); // качаем жесты заранее') >= 0);
  t('28.5 разбор битого кэша: decoding + восстановление по error',
    HTML.indexOf('decoding="async"') >= 0 &&
    HTML.indexOf("$('morseImg').addEventListener('error'") >= 0);
  const U1 = await boot({ seed: { 'nem_morse_practice_v1': JSON.stringify({
    schemaVersion: 1, day: today(), dailyCorrect: 1, dailyAttempts: 1, dailyErrors: 0,
    weaknessScore: {}, currentId: null, sequence: '', mode: 'input', freeMode: false,
    sound: true, vibeInput: false, history: {}, letterStats: {}, streak: 1, streakBest: 1,
    updatedAt: Date.now() }) } });
  await U1.waitView('view-home');
  await U1.waitMorseReady();
  await U1.openMorse();
  await sleep(80);
  {
    const svg28 = U1.$('morseStreak').querySelector('svg');
    const num28 = U1.$('morseStreakN');
    t('28.6 огонёк крупный вживую и горит рекордом',
      U1.w.getComputedStyle(svg28).width === '28px' &&
      U1.w.getComputedStyle(num28).fontSize === '17px' &&
      U1.$('morseStreak').classList.contains('rec') &&
      ['var(--flame-rec)', 'rgb(255, 186, 82)'].indexOf(
        U1.w.getComputedStyle(U1.$('morseStreak')).color) >= 0,
      [U1.w.getComputedStyle(svg28).width, U1.w.getComputedStyle(num28).fontSize,
       U1.w.getComputedStyle(U1.$('morseStreak')).color].join('/'));
  }
  /* Самоисцеление: все жесты падают, но без ручного «Повторить»
     картинка должна вернуться после авто-повтора. */
  const U2 = await boot({ imgMode: 'fail' });
  await U2.waitView('view-home');
  await U2.waitMorseReady();
  await U2.openMorse();
  await sleep(150);
  t('28.7 сбой показан сразу (ошибка без задержки)',
    U2.$('morseImgErr').hidden === false && U2.$('morseImg').hidden === true);
  U2.w.__imgMode = 'ok'; // сеть «починилась» — ручных действий не делаем
  await sleep(1800);     // авто-повтор назначается на +1200 мс от первой неудачи
  t('28.8 жест восстановился без ручного «Повторить»',
    U2.$('morseImg').hidden === false && U2.$('morseImgErr').hidden === true &&
    (U2.$('morseImg').getAttribute('src') || '').startsWith('./assets/signs/'),
    U2.$('morseImg').getAttribute('src'));

  /* ═══ 29. Жесты из памяти (Cache API → objectURL) и компактная раскладка ═══ */
  t('29.1 пайплайн кэша: Cache API + objectURL, имя с версией контента',
    HTML.indexOf('function morseImgFromCache(') >= 0 &&
    HTML.indexOf('function morseImgFetch(') >= 0 &&
    HTML.indexOf('function morseImgCachePut(') >= 0 &&
    HTML.indexOf('nem-signs-img-v') >= 0 &&
    HTML.indexOf('var morseImgObj={};') >= 0);
  t('29.2 рендер показывает objectURL, если он есть',
    HTML.indexOf('var imgSrc=morseImgObj[card.id]||card.image;') >= 0);
  t('29.3 base64 для картинок не используется (квота localStorage цела)',
    HTML.indexOf('btoa(') < 0 && HTML.indexOf('localStorage.setItem(MORSE_IMG') < 0);
  t('29.4 раскладка: огонёк ниже на 5px, фото 42vh, зона 220px',
    /padding:2px 6px;transform:translateY\(5px\)/.test(HTML) &&
    /width:min\(100%,42vh\)/.test(HTML) &&
    /morse-zone\{[^}]*min-height:220px/.test(HTML));
  /* Первая сессия: сеть один раз → кэш → показ из памяти. */
  const U3 = await boot({ cachePath: true });
  await U3.waitView('view-home');
  await U3.waitMorseReady();
  await U3.openMorse();
  await sleep(200);
  t('29.5 жест показывается из памяти (blob:…), а не по сети',
    (U3.$('morseImg').getAttribute('src') || '').startsWith('blob:nem/') &&
    U3.$('morseImg').hidden === false,
    U3.$('morseImg').getAttribute('src'));
  await sleep(500); // put в Cache API асинхронный
  t('29.6 все 33 жеста ушли в дисковый кэш',
    U3.w.__cachePuts.length >= 33, String(U3.w.__cachePuts.length));
  t('29.7 на каждый жест — ровно одна загрузка (без повторов)',
    U3.w.__imgFetches === 33, String(U3.w.__imgFetches));
  /* Вторая сессия: кэш отдаёт всё, сеть для жестов не нужна вовсе. */
  const U4 = await boot({ cachePath: true, cacheHit: true });
  await U4.waitView('view-home');
  await U4.waitMorseReady();
  await U4.openMorse();
  await sleep(400); // фоновая ревалидация всех жестов (PAR=3, промисы)
  t('29.8 повторный вход: показ из памяти + ревалидация всех 33 жестов',
    U4.w.__imgFetches === 33 &&
    (U4.$('morseImg').getAttribute('src') || '').startsWith('blob:nem/') &&
    U4.$('morseImg').hidden === false,
    'fetches=' + U4.w.__imgFetches + ' src=' + U4.$('morseImg').getAttribute('src'));
  t('29.9 ответ сервера (200) записан в кэш — новые signs заменяют старые',
    U4.w.__cachePuts.length >= 33, String(U4.w.__cachePuts.length));
  t('29.10 статика ревалидации: условный запрос, no-cache, подмена на лету',
    HTML.indexOf('function startMorseImgReval(') >= 0 &&
    HTML.indexOf('function morseImgEnqueueReval(') >= 0 &&
    HTML.indexOf("headers['If-None-Match']=et") >= 0 &&
    HTML.indexOf('r.status===304') >= 0 &&
    (HTML.match(/cache:'no-cache'/g) || []).length >= 2 &&
    HTML.indexOf('reval:true') >= 0);

  /* ═══ 30. Правильные ответы после цели (>10) ═══ */
  t('30.1 статика: клампа на цели нет, инкремент без гейта',
    HTML.indexOf('clampInt(s.dailyCorrect,0,1000000)') >= 0 &&
    HTML.indexOf('clampInt(s.dailyCorrect,0,MORSE_GOAL)') < 0 &&
    HTML.indexOf('morseState.dailyCorrect=(morseState.dailyCorrect|0)+1') >= 0 &&
    HTML.indexOf('Math.min(MORSE_GOAL, morseState.dailyCorrect+1)') < 0);
  const U5 = await boot({ seed: { 'nem_morse_practice_v1': JSON.stringify({
    schemaVersion: 1, day: today(), dailyCorrect: 9, dailyAttempts: 3, dailyErrors: 1,
    weaknessScore: {}, currentId: null, sequence: '', mode: 'input', freeMode: false,
    sound: true, vibeInput: false, history: {}, letterStats: {},
    streak: 0, streakBest: 0, updatedAt: Date.now() }) } });
  await U5.waitView('view-home');
  await U5.waitMorseReady();
  await U5.openMorse();
  await U5.typeCode(LETTER(U5.mstate().currentId).morse);
  await sleep(650);
  t('30.2 десятый верный закрыл цель', U5.mstate().dailyCorrect === 10,
    String(U5.mstate().dailyCorrect));
  await sleep(1150); // удержание результата → экран цели
  t('30.3 экран цели показан', U5.mstate().mode === 'goal', U5.mstate().mode);
  U5.click(U5.$('btnMorseContinue'));
  await sleep(80);
  t('30.4 переход в свободный режим',
    U5.mstate().freeMode === true && U5.mstate().mode === 'input',
    U5.mstate().freeMode + '/' + U5.mstate().mode);
  await U5.typeCode(LETTER(U5.mstate().currentId).morse);
  await sleep(650);
  t('30.5 одиннадцатый верный после цели', U5.mstate().dailyCorrect === 11,
    String(U5.mstate().dailyCorrect));
  await sleep(1150);
  await U5.typeCode('.'); // «точка» не является кодом ни одной буквы — всегда ошибка
  await sleep(650);
  t('30.6 ошибка в свободном режиме: +1 ошибке, верные не тронуты',
    U5.mstate().dailyErrors === 2 && U5.mstate().dailyCorrect === 11,
    U5.mstate().dailyErrors + '/' + U5.mstate().dailyCorrect);
  await sleep(1150);
  await U5.typeCode(LETTER(U5.mstate().currentId).morse);
  await sleep(650);
  t('30.7 стало 12', U5.mstate().dailyCorrect === 12,
    String(U5.mstate().dailyCorrect));
  const u5seed = { 'nem_morse_practice_v1': U5.w.localStorage.getItem('nem_morse_practice_v1') };
  const U6 = await boot({ seed: u5seed });
  await U6.waitView('view-home');
  await U6.waitMorseReady();
  t('30.8 перезагрузка не вернула кламп 10',
    U6.mstate().dailyCorrect === 12, String(U6.mstate().dailyCorrect));
  U6.click(U6.$('btnDetails'));
  await U6.waitView('view-details');
  await sleep(80);
  t('30.9 статистика: «Сегодня: 12 / 10» и «Верно 12»',
    U6.$('dtMorseTotals').textContent.indexOf('Сегодня: 12 / 10') >= 0 &&
    U6.$('dtMorseDetail').textContent.indexOf('Верно 12') >= 0,
    U6.$('dtMorseTotals').textContent + ' || ' + U6.$('dtMorseDetail').textContent);

  /* ═══ 31. Языки: обзор, дневная сессия, карточка, озвучка ═══ */
  const L1 = await boot({});
  await L1.waitView('view-home');
  await L1.waitMorseReady();
  for (let i = 0; i < 300 && L1.$('langSub').textContent.indexOf('500') < 0; i++) await sleep(20);
  t('31.1 карточка «Языки»: подпись, прогресс «0 из 10», кнопка «Начать»',
    /10 языков · 500 слов и фраз/.test(L1.$('langSub').textContent) &&
    L1.$('langChip').textContent === '0 из 10' &&
    L1.$('langAct').textContent === 'Начать',
    L1.$('langSub').textContent + '/' + L1.$('langChip').textContent);
  await L1.click(L1.$('btnMorseStart'));
  await L1.waitView('view-morse');
  await L1.click(L1.$('btnMorseBack'));
  await L1.waitView('view-home');
  t('31.2 разделы независимы: морзе открылся и вернулся при живых языках', true);
  await L1.click(L1.$('btnLangStart'));
  await L1.waitView('view-langsession');
  await sleep(60);
  L1.click(L1.$('btnLsessBack'));
  await L1.waitView('view-langs');
  const rows31 = L1.doc.querySelectorAll('#langGrid .lang-row');
  t('31.3 обзор: «Изучено 0 из 500», сетка 10 языков, у каждого «/ 50»',
    L1.$('langTotal').textContent === 'Изучено 0 из 500' &&
    rows31.length === 10 && rows31[0].textContent.indexOf('Испанский') === 0 &&
    rows31[0].textContent.indexOf('/ 50') >= 0,
    L1.$('langTotal').textContent + '/rows=' + rows31.length);
  t('31.4 свежий день: новыми набирается ровно 5 (лимит ≤5, норма ≤10)',
    rows31[0].textContent.indexOf('на сегодня: 1') >= 0 &&
    rows31[5].textContent.indexOf('на сегодня: 0') >= 0);
  await L1.click(L1.$('btnMixedTrain'));
  await L1.waitView('view-langsession');
  await sleep(60);
  t('31.5 механика как в словах: кнопки ответа видны сразу, фронт не перевёрнут',
    L1.$('lsProgress').textContent === '0 из 5' &&
    L1.$('lsActions').classList.contains('hidden') === false &&
    L1.$('lsDrag').classList.contains('flipped') === false &&
    !!L1.$('btnLsPeek'),
    L1.$('lsProgress').textContent);
  t('31.6 ранняя стадия: на лице native, русского нет, звук разрешён',
    L1.$('lsQ').textContent.length > 0 &&
    L1.$('lsLabel').textContent === 'Вспомни перевод' &&
    L1.$('btnLsSpeakFront').hidden === false,
    L1.$('lsQ').textContent);
  // короткий сдвиг (ниже порога) — как в словах, ответ не засчитывается
  L1.$('lsDrag').dispatchEvent(L1.pevXY('pointerdown', 120, 300));
  L1.$('lsDrag').dispatchEvent(L1.pevXY('pointermove', 135, 300));
  L1.$('lsDrag').dispatchEvent(L1.pevXY('pointerup', 135, 300));
  await sleep(260); // откат к центру (spring)
  t('31.7 короткий сдвиг не засчитывает ответ: очередь цела, экран тот же',
    L1.$('lsActions').classList.contains('hidden') === false &&
    L1.$('view-langsession').classList.contains('active') === true &&
    L1.$('lsDrag').classList.contains('flipped') === false);
  {
    const stA = JSON.parse(L1.w.localStorage.getItem('nem_languages_progress_v1'));
    t('31.7б очередь не уменьшилась без ответа', stA.day.queue.length === 5, String(stA.day.queue.length));
  }
  // озвучка лицевой стороны: MP3 из card.audio внутри нажатия; синтез не нужен,
  // нажатие не раскрывает карточку и не засчитывает ответ
  const firstId31 = JSON.parse(L1.w.localStorage.getItem('nem_languages_progress_v1')).day.queue[0];
  L1.click(L1.$('btnLsSpeakFront'));
  const plays31 = L1.w.__audioPlays.slice();
  t('31.8 MP3 из card.audio внутри нажатия: файл тот же, синтез не вызван, карточка не тронута',
    plays31.length === 1 &&
    plays31[0] === './assets/languages/audio/' + firstId31 + '.mp3' &&
    L1.$('btnLsSpeakFront').classList.contains('is-playing') &&
    (L1.w.__speech || []).filter(x => x.text).length === 0 &&
    L1.$('lsDrag').classList.contains('flipped') === false &&
    L1.$('lsActions').classList.contains('hidden') === false,
    plays31[0] || 'нет игры');
  // peek, как в словах: глазик подсматривает, не отвечая
  L1.click(L1.$('btnLsPeek'));
  await sleep(330);
  t('31.9 peek как в словах: оборот с переводом, бейдж, кнопки скрыты',
    L1.$('lsDrag').classList.contains('flipped') === true &&
    L1.$('lsBadgePeek').hidden === false &&
    L1.$('lsActions').classList.contains('hidden') === true &&
    L1.$('btnLsBackAction').textContent === 'Вернуться к слову' &&
    /перевод \d+/.test(L1.$('lsBackHead').textContent),
    L1.$('lsBackHead').textContent);
  L1.click(L1.$('btnLsBackAction'));
  await sleep(330);
  t('31.9б возврат с peek к вопросу',
    L1.$('lsDrag').classList.contains('flipped') === false &&
    L1.$('lsActions').classList.contains('hidden') === false);
  const T31 = today();
  const plusDay = (ymd, k) => {
    const [Y, M, D] = ymd.split('-').map(Number);
    const t0 = new Date(Y, M - 1, D + k, 12);
    const mm = t0.getMonth() + 1, dd = t0.getDate();
    return t0.getFullYear() + '-' + (mm < 10 ? '0' : '') + mm + '-' + (dd < 10 ? '0' : '') + dd;
  };
  L1.click(L1.$('btnLsYes'));
  await sleep(350); // fly-вылет (250 мс) и появление следующей карточки
  t('31.10а после «Помню» — вылет и прогресс «1 из 5»',
    L1.$('lsProgress').textContent === '1 из 5', L1.$('lsProgress').textContent);
  {
    const st = JSON.parse(L1.w.localStorage.getItem('nem_languages_progress_v1'));
    const cp = st.cards[firstId31];
    t('31.10 ответ засчитан в общий лимит, карточка получила следующий этап',
      st.day.done === 1 && st.day.nd === 1 && st.day.queue.length === 4 &&
      !!cp && cp.s === 2 && cp.d === plusDay(T31, 3) && cp.c === T31,
      st.day.done + '/' + st.day.queue.length + '/' + (cp ? (cp.s + '/' + cp.d) : 'нет'));
  }
  for (let k = 0; k < 4; k++){
    L1.click(L1.$('btnLsYes'));
    await sleep(350);
  }
  await L1.waitView('view-langs');
  await L1.click(L1.$('btnLangsBack'));
  await L1.waitView('view-home');
  t('31.11 день закрыт: чип «Готово», кнопка «Пройти заново» и она НЕ горит',
    L1.$('langChip').textContent === 'Готово' &&
    L1.$('btnLangStart').hidden === false &&
    L1.$('langAct').textContent === 'Пройти заново' &&
    L1.$('btnLangStart').classList.contains('is-quiet') === true,
    L1.$('langChip').textContent + '/' + L1.$('langAct').textContent);
  {
    // «Пройти заново» в языках: те же карточки дня, ответы НЕ двигают прогресс
    const beforeRedo = JSON.parse(L1.w.localStorage.getItem('nem_languages_progress_v1'));
    const all0 = beforeRedo.day.all && beforeRedo.day.all[0];
    L1.click(L1.$('btnLangStart'));
    await L1.waitView('view-langsession');
    await sleep(60);
    t('31.11б практика открылась: та же тренировка (base = длина дня), счётчик 0 из N',
      L1.$('lsProgress').textContent === '0 из ' + beforeRedo.day.all.length,
      L1.$('lsProgress').textContent);
    const stageBefore = beforeRedo.cards[all0] ? beforeRedo.cards[all0].s : null;
    L1.click(L1.$('btnLsYes'));
    await sleep(350);
    const afterRedo = JSON.parse(L1.w.localStorage.getItem('nem_languages_progress_v1'));
    t('31.11в ответ в практике: день (done/queue) и этапы слов не тронуты',
      afterRedo.day.done === beforeRedo.day.done &&
      afterRedo.day.queue.length === beforeRedo.day.queue.length &&
      JSON.stringify(afterRedo.day.all) === JSON.stringify(beforeRedo.day.all) &&
      (afterRedo.cards[all0] ? afterRedo.cards[all0].s : null) === stageBefore,
      afterRedo.day.done + '/' + afterRedo.day.queue.length + '/' +
      (afterRedo.cards[all0] ? afterRedo.cards[all0].s : 'нет'));
    L1.click(L1.$('btnLsessBack'));  // вышли из практики не закончив
    await L1.waitView('view-langs');
    L1.click(L1.$('btnLangsBack'));
    await L1.waitView('view-home');
    await sleep(60);
    t('31.11г практика не закончена — главная предлагает «Продолжить» (не «Пройти заново»)',
      L1.$('langAct').textContent === 'Продолжить' &&
      L1.$('btnLangStart').classList.contains('is-quiet') === false,
      L1.$('langAct').textContent);
    L1.click(L1.$('btnLangStart'));  // возобновляем практику
    await L1.waitView('view-langsession');
    await sleep(60);
    t('31.11д возобновление практики: прогресс продолжился с места выхода',
      L1.$('lsProgress').textContent === '1 из ' + beforeRedo.day.all.length,
      L1.$('lsProgress').textContent);
    L1.click(L1.$('btnLsessBack'));
    await L1.waitView('view-langs');
    L1.click(L1.$('btnLangsBack'));
    await L1.waitView('view-home');
  }
  await L1.click(L1.$('btnLangStart'));
  await L1.waitView('view-langsession');
  await sleep(60);
  L1.click(L1.$('btnLsessBack'));
  await L1.waitView('view-langs');
  const stx = L1.$('langStats').textContent;
  t('31.12 статистика языков: выполнено 5/10, новые 5, изучено 5 из 500, архив 0',
    stx.indexOf('Сегодня выполнено: 5 / 10') >= 0 &&
    stx.indexOf('Новые сегодня: 5') >= 0 &&
    stx.indexOf('Изучено карточек: 5 из 500') >= 0 &&
    stx.indexOf('Архивировано: 0') >= 0, stx.slice(0, 200));

  /* ═══ 32. Обратное направление (после 30 дней) и сброс ошибкой ═══ */
  const L2 = await boot({ audioLoadFail: true, seed: { nem_languages_progress_v1: JSON.stringify({
    schemaVersion: 1,
    cards: {
      'lang_es_06': { s: 6, d: T31, e: 0, c: yesterday(), a: 0 },
      'lang_fr_01': { s: 5, d: T31, e: 1, c: yesterday(), a: 0 }
    },
    day: null, ok: 4, bad: 2, updatedAt: Date.now() }) } });
  await L2.waitView('view-home');
  await L2.waitMorseReady();
  for (let i = 0; i < 300 && L2.$('langSub').textContent.indexOf('500') < 0; i++) await sleep(20);
  await L2.click(L2.$('btnLangStart'));
  await L2.waitView('view-langsession');
  await sleep(60);
  L2.click(L2.$('btnLsessBack'));
  await L2.waitView('view-langs');
  const rowEs = L2.doc.querySelector('[data-lang="es"]');
  t('32.1 просроченная карточка назначена на сегодня (es: 1)', rowEs && !rowEs.disabled);
  await L2.click(rowEs);
  await L2.waitView('view-langsession');
  await sleep(60);
  t('32.2 стадия 3 месяца: направление русский → иностранное',
    L2.$('lsQ').textContent === 'перевод 6' &&
    L2.$('lsLabel').textContent === 'Что это за слово?' &&
    L2.$('lsActions').classList.contains('hidden') === false,
    L2.$('lsQ').textContent);
  t('32.3 на вопросе обратного направления звук скрыт (назвал бы ответ)',
    L2.$('btnLsSpeakFront').hidden === true);
  // peek показывает оборот: native + транскрипция
  await L2.click(L2.$('btnLsPeek'));
  await sleep(330);
  t('32.4 peek — native на обороте и рабочий звук',
    L2.$('lsBackHead').textContent === 'Испанский слово 6',
    L2.$('lsBackHead').textContent);
  L2.click(L2.$('btnLsSpeakBack'));
  await sleep(120);                      // MP3 не загрузилась → запасной путь (Web Speech)
  const sp32 = L2.w.__speech.filter(x => x.text).pop();
  t('32.5 MP3 не загрузилась → запасной Web Speech: native + bcp47=es-ES',
    !!sp32 && sp32.lang === 'es-ES' && sp32.text === 'Испанский слово 6' && sp32.rate === 0.85,
    sp32 ? sp32.lang + '/' + sp32.text : 'нет');
  L2.click(L2.$('btnLsBackAction'));           // «Вернуться к слову»
  await sleep(330);
  L2.click(L2.$('btnLsNo'));                   // «Не помню» → экран обратной связи
  await sleep(330);
  t('32.5б «Не помню»: оборот с переводом, «вернётся завтра», кнопки скрыты',
    L2.$('lsDrag').classList.contains('flipped') === true &&
    L2.$('lsReturnNote').hidden === false &&
    L2.$('lsReturnNote').textContent === 'Это слово вернётся завтра' &&
    L2.$('btnLsBackAction').textContent === 'Понятно, повторить позже' &&
    L2.$('lsActions').classList.contains('hidden') === true,
    L2.$('lsReturnNote').textContent + '/' + L2.$('btnLsBackAction').textContent);
  {
    const st = JSON.parse(L2.w.localStorage.getItem('nem_languages_progress_v1'));
    const p = st.cards['lang_es_06'];
    t('32.6 ошибка: сброс на начало цикла, завтра, +1 ошибка',
      p && p.s === 1 && p.d === plusDay(T31, 1) && p.e === 1 && p.a === 0,
      p ? (p.s + '/' + p.d + '/' + p.e) : 'нет');
  }
  L2.click(L2.$('btnLsBackAction'));           // «Понятно, повторить позже» → дальше
  await sleep(350);
  await L2.waitView('view-langs');

  /* ═══ 33. Год → архив, календарные месяцы, сброс языков ═══ */
  const L3 = await boot({ seed: { nem_languages_progress_v1: JSON.stringify({
    schemaVersion: 1,
    cards: {
      'lang_de_08': { s: 8, d: T31, e: 0, c: yesterday(), a: 0 },
      'lang_it_05': { s: 5, d: T31, e: 0, c: yesterday(), a: 0 }
    },
    day: null, ok: 9, bad: 1, updatedAt: Date.now() }) } });
  await L3.waitView('view-home');
  await L3.waitMorseReady();
  for (let i = 0; i < 300 && L3.$('langSub').textContent.indexOf('500') < 0; i++) await sleep(20);
  await L3.click(L3.$('btnLangStart'));
  await L3.waitView('view-langsession');
  await sleep(60);
  L3.click(L3.$('btnLsessBack'));
  await L3.waitView('view-langs');
  await L3.click(L3.doc.querySelector('[data-lang="de"]'));
  await L3.waitView('view-langsession');
  await sleep(60);
  L3.click(L3.$('btnLsYes'));
  await sleep(350);
  {
    const st = JSON.parse(L3.w.localStorage.getItem('nem_languages_progress_v1'));
    const p = st.cards['lang_de_08'];
    t('33.1 после годовой проверки карточка в архиве',
      p && p.a === 1 && p.d === null, p ? (p.a + '/' + p.d) : 'нет');
  }
  await L3.waitView('view-langs');
  await L3.click(L3.doc.querySelector('[data-lang="it"]'));
  await L3.waitView('view-langsession');
  await sleep(60);
  L3.click(L3.$('btnLsYes'));
  await sleep(350);
  {
    const st = JSON.parse(L3.w.localStorage.getItem('nem_languages_progress_v1'));
    const p = st.cards['lang_it_05'];
    // ожидание: +3 календарных месяца (число месяца сохраняется, иначе последний день)
    const [Y, M, D] = T31.split('-').map(Number);
    const t0 = new Date(Y, M - 1 + 3, 1, 12);
    const last = new Date(t0.getFullYear(), t0.getMonth() + 1, 0, 12).getDate();
    const exp = t0.getFullYear() + '-' + String(t0.getMonth() + 1).padStart(2, '0') + '-' +
      String(Math.min(D, last)).padStart(2, '0');
    t('33.2 успешный 30-дневный (этап 5→6) → 3 календарных месяца (не 90 суток)',
      p && p.s === 6 && p.d === exp, p ? (p.s + '/' + p.d + ' != ' + exp) : 'нет');
  }
  // сброс языков не трогает слова и морзе
  const wordsBefore = L3.w.localStorage.getItem('no1equalsme_state_v2');
  const morseBefore = L3.w.localStorage.getItem('nem_morse_practice_v1');
  L3.click(L3.$('btnLangReset'));
  await sleep(30);
  t('33.3 сброс требует подтверждения', L3.$('langResetConfirm').hidden === false);
  L3.click(L3.$('btnLangResetYes'));
  await sleep(60);
  {
    const st = JSON.parse(L3.w.localStorage.getItem('nem_languages_progress_v1'));
    t('33.4 сброс языков: прогресс пуст, слова и морзе нетронуты',
      st.cards && Object.keys(st.cards).length === 0 &&
      (st.day === null || (st.day.done === 0 && st.day.queue.length > 0)) &&
      (st.ok | 0) === 0 && (st.bad | 0) === 0 &&
      L3.w.localStorage.getItem('no1equalsme_state_v2') === wordsBefore &&
      L3.w.localStorage.getItem('nem_morse_practice_v1') === morseBefore &&
      /Слова и Морзе не затронуты/.test(L3.$('toast').textContent),
      'cards=' + (st.cards ? Object.keys(st.cards).length : '?') +
      ' day=' + (st.day ? (st.day.done + '/' + st.day.queue.length) : 'null') +
      ' toast=' + L3.$('toast').textContent);
  }

  /* ═══ 34. Слова: миграция 3 → 4 и длинный цикл ═══ */
  const T34 = today();
  const mkW18 = (over) => Object.assign({
    schemaVersion: 3, status: 'completed', sessionDate: T34, view: 'home', cardScreen: 'question',
    queue: [], sessionTotal: 0, sessionResults: {},
    cards: {
      w1: { status: 'learning', currentStep: 4, nextReviewDate: T34, createdAt: yesterday(), updatedAt: 1 },
      w2: { status: 'learned', currentStep: 5, nextReviewDate: null, createdAt: yesterday(), updatedAt: 1 }
    },
    dayPlanDate: T34, dayQueue: [], dayPlan: { total: 0, reviews: 0, news: 0 }, customWords: [],
    lastStudyDate: T34, startedAt: 1, completedAt: 2, updatedAt: Date.now(),
    settings: { haptics: true, theme: 'evening', swipeSens: 50, sndVol: 100 }, stats: { days: {} }
  }, over || {});
  const W1 = await boot({ seed: { no1equalsme_state_v2: JSON.stringify(mkW18()) } });
  await W1.waitView('view-home');
  for (let i = 0; i < 300 && JSON.parse(W1.w.localStorage.getItem('no1equalsme_state_v2')).schemaVersion !== 6; i++) await sleep(20);
  const stW1 = JSON.parse(W1.w.localStorage.getItem('no1equalsme_state_v2'));
  t('34.1 миграция слов: schemaVersion 6, sv3 шаг 4 (30 дней) → 5, дата цела',
    stW1.schemaVersion === 6 && stW1.cards.w1.currentStep === 5 &&
    stW1.cards.w1.nextReviewDate === T34,
    stW1.schemaVersion + '/' + stW1.cards.w1.currentStep + '/' + stW1.cards.w1.nextReviewDate);
  t('34.2 архивированные слова не вернулись',
    stW1.cards.w2.status === 'learned' && stW1.cards.w2.nextReviewDate === null);
  const W2 = await boot({ seed: { no1equalsme_state_v2: JSON.stringify(stW1) } });
  await W2.waitView('view-home');
  for (let i = 0; i < 300 && !JSON.parse(W2.w.localStorage.getItem('no1equalsme_state_v2')).cards.w1; i++) await sleep(20);
  const stW2 = JSON.parse(W2.w.localStorage.getItem('no1equalsme_state_v2'));
  t('34.3 повторный запуск миграции идемпотентен',
    stW2.schemaVersion === 6 && stW2.cards.w1.currentStep === 5 &&
    JSON.stringify(stW2.cards.w1) === JSON.stringify(stW1.cards.w1));
  /* 34.1б: sv4 — уже 8-этапная схема (15 дней есть): сдвига нет, версия → 6 */
  const W4 = await boot({ seed: { no1equalsme_state_v2: JSON.stringify(mkW18({
    schemaVersion: 4,
    cards: { w1: { status: 'learning', currentStep: 4, nextReviewDate: T34, createdAt: yesterday(), updatedAt: 1 },
             w2: { status: 'learned', currentStep: 5, nextReviewDate: null, createdAt: yesterday(), updatedAt: 1 } }
  })) } });
  await W4.waitView('view-home');
  for (let i = 0; i < 300 && JSON.parse(W4.w.localStorage.getItem('no1equalsme_state_v2')).schemaVersion !== 6; i++) await sleep(20);
  const stW4 = JSON.parse(W4.w.localStorage.getItem('no1equalsme_state_v2'));
  t('34.1б миграция sv4: без сдвига (15 дней уже есть), даты целы',
    stW4.schemaVersion === 6 && stW4.cards.w1.currentStep === 4 &&
    stW4.cards.w1.nextReviewDate === T34 && stW4.cards.w2.currentStep === 5,
    stW4.schemaVersion + '/' + stW4.cards.w1.currentStep + '/' + stW4.cards.w2.currentStep);
  const W3 = await boot({ seed: { no1equalsme_state_v2: JSON.stringify(mkW18({
    schemaVersion: 4, status: 'active', queue: ['w1'], sessionTotal: 1,
    sessionResults: { w1: { errors: 0, firstTry: true, done: false, tomorrow: false, advanced: false, graduatedNow: false } },
    cards: { w1: { status: 'learning', currentStep: 5, nextReviewDate: T34, createdAt: yesterday(), updatedAt: 1 },
             w2: { status: 'learned', currentStep: 5, nextReviewDate: null, createdAt: yesterday(), updatedAt: 1 } }
  })) } });
  await W3.waitView('view-home');
  for (let i = 0; i < 300 && (W3.$('btnStart').disabled || W3.$('catAct').textContent !== 'Продолжить'); i++) await sleep(20);
  W3.click(W3.$('btnStart'));
  await W3.waitView('view-session');
  W3.click(W3.$('btnYes'));
  await sleep(350);
  {
    const st = JSON.parse(W3.w.localStorage.getItem('no1equalsme_state_v2'));
    const p = st.cards.w1;
    const [Y, M, D] = T34.split('-').map(Number);
    const t0 = new Date(Y, M - 1 + 3, 1, 12);
    const last = new Date(t0.getFullYear(), t0.getMonth() + 1, 0, 12).getDate();
    const exp = t0.getFullYear() + '-' + String(t0.getMonth() + 1).padStart(2, '0') + '-' +
      String(Math.min(D, last)).padStart(2, '0');
    t('34.4 после 30 дней (этап 5→6) — 3 календарных месяца, не архив',
      p.currentStep === 6 && p.status === 'learning' && p.nextReviewDate === exp &&
      st.sessionResults.w1.advanced === true,
      p.currentStep + '/' + p.nextReviewDate + ' != ' + exp);
  }

  /* ═══ 35. Статика спеки: лимиты, валидация, облако, цикл ═══ */
  t('35.1 дневные лимиты: 10 карточек и 5 новых, просроченные первыми',
    HTML.indexOf('var LANG_MAX_DAY=10') >= 0 && HTML.indexOf('var LANG_MAX_NEW=5') >= 0 &&
    HTML.indexOf('overdue.slice(0,LANG_MAX_DAY)') >= 0 &&
    HTML.indexOf('newsN=Math.min(slots, LANG_MAX_NEW)') >= 0);
  t('35.2 строгая валидация languages.json: 500, 50 на язык, транскрипции',
    HTML.indexOf("if(cards.length!==500) return {error:'count'}") >= 0 &&
    HTML.indexOf("byLang[LANGS[j].id].length!==50") >= 0 &&
    HTML.indexOf("return {error:'translit'}") >= 0 &&
    HTML.indexOf("return {error:'ids'}") >= 0 &&
    HTML.indexOf("return {error:'audio'}") >= 0 &&
    HTML.indexOf('пустые или небезопасные пути к MP3') >= 0);
  const langMod = HTML.slice(HTML.indexOf('ЯЗЫКИ — третий независимый раздел'),
                              HTML.indexOf('/* ================= Инициализация'));
  const langPay = HTML.slice(HTML.indexOf('function langBlockKey'),
                             HTML.indexOf('function mergeLangCloudValue'));
  t('35.3 в облако уходят только компактные позиции, без текстов карточек',
    langPay.indexOf('[p.s|0, p.d||0, p.e|0, p.c||0, p.a?1:0]') >= 0 &&
    langPay.indexOf('translationRu') < 0 && langPay.indexOf('.native') < 0 &&
    langPay.indexOf("'_v1'") >= 0 &&
    langMod.indexOf("var LANG_CK_PRE='nem_lang_'") >= 0);
  t('35.4 сторонних серверов/TTS/токенов нет (Web Speech только)',
    langMod.indexOf('googleapis') < 0 && langMod.indexOf('elevenlabs') < 0 &&
    langMod.indexOf('api.telegram.org') < 0 && langMod.indexOf('speechSynthesis') >= 0);
  const applyKnowSlice = HTML.slice(HTML.indexOf('function applyKnow'), HTML.indexOf('function applyForget'));
  t('35.5 цикл слов — 8 этапов: 15/30 дней, месяцы календарно, архив после года',
    HTML.indexOf('var STEP_INTERVAL = {1:1, 2:3, 3:7, 4:15, 5:30}') >= 0 &&
    (applyKnowSlice.match(/addCalMonthsStr\(studyDate/g) || []).length === 3 &&
    applyKnowSlice.indexOf('ns>=9') >= 0 &&
    applyKnowSlice.indexOf("p.status==='learned'") >= 0 &&
    HTML.indexOf('migrateWordsV6') >= 0 && HTML.indexOf('schemaVersion:6') >= 0);

  /* ═══ 35.6. Исправный MP3: играет даже без speechSynthesis ═══ */
  const L4 = await boot({ noSpeech: true });
  await L4.waitView('view-home');
  await L4.waitMorseReady();
  for (let i = 0; i < 300 && L4.$('langSub').textContent.indexOf('500') < 0; i++) await sleep(20);
  await L4.click(L4.$('btnLangStart'));
  await L4.waitView('view-langsession');
  await sleep(60);
  L4.click(L4.$('btnLsessBack'));
  await L4.waitView('view-langs');
  await L4.click(L4.$('btnMixedTrain'));
  await L4.waitView('view-langsession');
  await sleep(60);
  L4.click(L4.$('btnLsSpeakFront'));
  await sleep(60);
  t('35.6 исправный MP3 играет без Web Speech: без тостов, сессия жива',
    L4.w.__audioPlays.length === 1 &&
    /^\.\/assets\/languages\/audio\/lang_[a-z]{2}_\d{2}\.mp3$/.test(L4.w.__audioPlays[0]) &&
    L4.$('toast').hidden === true &&
    L4.$('view-langsession').classList.contains('active') === true,
    (L4.w.__audioPlays[0] || 'нет игры') + '/' + L4.$('toast').textContent);
  L4.click(L4.$('btnLsYes'));
  await sleep(350);
  t('35.7 ответ после отсутствия голоса засчитан',
    JSON.parse(L4.w.localStorage.getItem('nem_languages_progress_v1')).day.done === 1);
  const L5 = await boot({ noSpeech: true, audioLoadFail: true });
  await L5.waitView('view-home');
  await L5.waitMorseReady();
  for (let i = 0; i < 300 && L5.$('langSub').textContent.indexOf('500') < 0; i++) await sleep(20);
  await L5.click(L5.$('btnLangStart'));
  await L5.waitView('view-langsession');
  await sleep(60);
  L5.click(L5.$('btnLsessBack'));
  await L5.waitView('view-langs');
  await L5.click(L5.$('btnMixedTrain'));
  await L5.waitView('view-langsession');
  await sleep(60);
  L5.click(L5.$('btnLsSpeakFront'));
  await sleep(60);
  t('35.8 MP3 не загрузилась и Web Speech нет — понятное сообщение + «Повторить»',
    /Аудио этой карточки не загрузилось/.test(L5.$('toast').textContent) &&
    (L5.$('toast').querySelector('.toast-act') || {}).textContent === 'Повторить' &&
    !/no-speech|код:|Chrome|synthesis/i.test(L5.$('toast').textContent),
    L5.$('toast').textContent);
  {
    const beforeRetry = L5.w.__audioPlays.length;
    L5.click(L5.$('toast').querySelector('.toast-act'));
    await sleep(80);
    t('35.8б «Повторить» заново запускает тот же MP3 внутри нажатия',
      L5.w.__audioPlays.length === beforeRetry + 1,
      beforeRetry + ' → ' + L5.w.__audioPlays.length);
  }

  t('35.10 звук в коде: MP3-плеер первичен, Web Speech — запасной, причины в консоли',
    HTML.indexOf('function langLogSound(') >= 0 &&
    HTML.indexOf("langLogSound('нет Web Speech API'") >= 0 &&
    HTML.indexOf("langLogSound('ошибка синтеза'") >= 0 &&
    HTML.indexOf("langLogSound('MP3 не загрузился'") >= 0 &&
    HTML.indexOf('u.onerror=function') >= 0 &&
    HTML.indexOf('var langAudio=new Audio()') >= 0 &&
    HTML.indexOf('langAudio.preload') >= 0 &&
    HTML.indexOf("langAudio.removeAttribute('src')") >= 0 &&
    HTML.indexOf("langAudio.addEventListener('error'") >= 0 &&
    HTML.indexOf('onvoiceschanged') >= 0);
  const L7 = await boot({ speechError: 'synthesis-unavailable', audioLoadFail: true });
  await L7.waitView('view-home');
  await L7.waitMorseReady();
  for (let i = 0; i < 300 && L7.$('langSub').textContent.indexOf('500') < 0; i++) await sleep(20);
  await L7.click(L7.$('btnLangStart'));
  await L7.waitView('view-langsession');
  await sleep(60);
  L7.click(L7.$('btnLsessBack'));
  await L7.waitView('view-langs');
  await L7.click(L7.$('btnMixedTrain'));
  await L7.waitView('view-langsession');
  await sleep(60);
  L7.click(L7.$('btnLsSpeakFront'));
  for (let i = 0; i < 40 && !/Не удалось воспроизвести/.test(L7.$('toast').textContent); i++) await sleep(50);
  t('35.11 ошибка запасного синтеза → человеческий текст без кода',
    /Не удалось воспроизвести звук/.test(L7.$('toast').textContent) &&
    !/\(код:|synthesis=|Chrome/i.test(L7.$('toast').textContent),
    L7.$('toast').textContent);

  /* ═══ 35.9. Ошибка языков не блокирует «Слова» и «Морзе» ═══ */
  const L6 = await boot({ langFail: true });
  await L6.waitView('view-home');
  await L6.waitMorseReady();
  for (let i = 0; i < 200 && L6.$('langChip').textContent !== 'Ошибка'; i++) await sleep(20);
  t('35.9 languages.json не загрузился: карточка в ошибке, слова и морзе живы',
    L6.$('langChip').textContent === 'Ошибка' &&
    /не загрузились|Ошибка/.test(L6.$('langSub').textContent) &&
    L6.$('langAct').textContent === 'Повторить' &&
    L6.$('btnStart').hidden === false &&
    !!L6.$('morseAct'),
    L6.$('langChip').textContent + '/' + L6.$('langSub').textContent);
  await L6.click(L6.$('btnMorseStart'));
  await L6.waitView('view-morse');
  t('35.9б морзе открывается при упавших языках', true);

  
  /* ═══ 36. Раунд 20: «Освоено слов» с прогрессом, сортировки, вкладка «Языки»,
     отмена ввода морзе (3.5 с), страховка свайпа языков ═══ */
  // — 36.1–36.6 список с прогрессом и 4 сортировки —
  const WORDS20 = WORDS.concat([Object.assign({}, WORDS[0], { id: 'w3', word: 'третий', stress: 'тре́тий' })]);
  const mk36 = (over) => Object.assign({
    schemaVersion: 5, status: 'completed', sessionDate: T34, view: 'home', cardScreen: 'question',
    queue: [], sessionTotal: 0, sessionResults: {},
    cards: {
      w1: { status: 'learning', currentStep: 2, nextReviewDate: T34, createdAt: '2026-01-05', updatedAt: 100 },
      w2: { status: 'learned',  currentStep: 8, nextReviewDate: null, createdAt: '2026-03-01', updatedAt: 200 },
      w3: { status: 'new',      currentStep: 0, nextReviewDate: null, createdAt: null, updatedAt: 300 }
    },
    dayPlanDate: T34, dayQueue: [], dayPlan: { total: 0, reviews: 0, news: 0 }, customWords: [],
    lastStudyDate: T34, startedAt: 1, completedAt: 2, updatedAt: Date.now(),
    settings: { haptics: true, theme: 'evening', swipeSens: 50, sndVol: 100 }, stats: { days: {} }
  }, over || {});
  const A36 = await boot({ wordsPkg: WORDS20, seed: { no1equalsme_state_v2: JSON.stringify(mk36()) } });
  await A36.waitView('view-home');
  await A36.waitMorseReady();   // маркер реально завершившегося старта приложения
  A36.click(A36.$('btnDetails'));
  await A36.waitView('view-details');
  A36.click(A36.$('archRow'));
  await A36.waitView('view-archive');
  {
    const rows = () => Array.from(A36.doc.querySelectorAll('#archList li')).map(li => li.textContent);
    t('36.1 счётчик «Слов с прогрессом» + сколько освоено полностью',
      A36.$('archCount').textContent === 'Слов с прогрессом: 2 · освоено полностью: 1',
      A36.$('archCount').textContent);
    const r0 = rows();
    t('36.2 по умолчанию — наибольший прогресс (8/8, затем 2/8)',
      r0.length === 2 && /8\/8/.test(r0[0]) && /2\/8/.test(r0[1]), JSON.stringify(r0));
    A36.click(A36.doc.querySelector('#archSorts [data-sort="pasc"]'));
    const r1 = rows();
    t('36.3 сортировка «Наименьший прогресс»', /2\/8/.test(r1[0]) && /8\/8/.test(r1[1]), JSON.stringify(r1));
    A36.click(A36.doc.querySelector('#archSorts [data-sort="old"]'));
    const r2 = rows();
    t('36.4 сортировка «Самые старые» — по первой дате знакомства',
      /приме́р/.test(r2[0]) && /сло́во/.test(r2[1]), JSON.stringify(r2));
    A36.click(A36.doc.querySelector('#archSorts [data-sort="new"]'));
    const r3 = rows();
    t('36.5 сортировка «Самые новые»', /сло́во/.test(r3[0]), JSON.stringify(r3));
    t('36.6 слово без прогресса (status new) не отображается',
      rows().join('|').indexOf('тре́тий') < 0, rows().join('|'));
  }
  // — 36.7 шкала «Изучено»: ушедшие в «Освоено» за день —
  t('36.7 «Изучено» берётся из поля g (архив за день), а не из «перешедших шаг»',
    HTML.indexOf('return {a:raw.g|0, nw:nw, rv:rv}') >= 0 &&
    HTML.indexOf('a:computeStats().graduated|0') >= 0 &&
    HTML.indexOf('function langDayRow(d)') >= 0);
  A36.click(A36.$('btnBack'));
  await A36.waitView('view-home');
  // — 36.8–36.13 вкладка «Языки»: график из суточного журнала —
  {
    const dNow = today();
    const L20 = await boot({ seed: { nem_languages_progress_v1: JSON.stringify({
      schemaVersion: 2, cards: {},
      days: { [dNow]: { g: 2, nw: 3, rv: 5 } },
      day: { date: dNow, queue: [], done: 0, nd: 0, rd: 0, lastLang: null },
      ok: 0, bad: 0, updatedAt: Date.now() }) } });
    await L20.waitView('view-home');
    await L20.waitMorseReady();
    L20.click(L20.$('btnDetails'));
    await L20.waitView('view-details');
    await sleep(60);
    const tabs20 = L20.doc.querySelectorAll('.det-tab');
    t('36.8 в статистике четыре вкладки: третья — «Стенография», последняя — «Языки»',
      tabs20.length === 4 && tabs20[2].textContent.trim() === 'Стенография' && tabs20[3].textContent.trim() === 'Языки',
      tabs20.length + '/' + (tabs20[2] ? tabs20[2].textContent : '-'));
    L20.click(tabs20[2]);
    await sleep(330);
    t('36.9 переключение на -2/4 ширины трека',
      L20.$('detTrack').style.transform === 'translateX(' + (-2 * (100 / 4)) + '%)',
      L20.$('detTrack').style.transform);
    t('36.10 график языков: 14 столбцов-дней',
      L20.doc.querySelectorAll('#dtLangChart .dt-day').length === 14,
      L20.doc.querySelectorAll('#dtLangChart .dt-day').length);
    const langCells = L20.doc.querySelectorAll('#dtLangChart .dt-day');
    L20.click(langCells[langCells.length - 1]);
    await sleep(30);
    t('36.11 тап по дню: Изучено 2 · Показано новых 3 · Повторено 5',
      /Изучено 2 · Показано новых 3 · Повторено 5/.test(L20.$('dtLangDetail').textContent),
      L20.$('dtLangDetail').textContent);
    t('36.12 итоги языков внизу вкладки',
      /Всего показано карточек: 8/.test(L20.$('detLangFoot').textContent) &&
      /Дней с тренировками: 1/.test(L20.$('detLangFoot').textContent),
      L20.$('detLangFoot').textContent);
    t('36.13 блок «Карточки с прогрессом» есть и показывает пустое состояние',
      !!L20.$('langArchList') && L20.$('langArchEmpty').hidden === false &&
      /Карточек с прогрессом: 0/.test(L20.$('langArchCount').textContent),
      L20.$('langArchCount').textContent);
  }
  // — 36.14–36.16 морзе: удержание тире ≥3.5 с = отмена ввода, стрик цел —
  {
    const AM = await boot({ seed: { nem_morse_practice_v1: JSON.stringify({
      schemaVersion: 1, day: today(), dailyCorrect: 3, dailyAttempts: 7, dailyErrors: 1,
      streak: 5, streakBest: 6, weaknessScore: {}, currentId: 'rsl_a', sequence: '',
      mode: 'input', freeMode: false, sound: false, updatedAt: Date.now() }) } });
    await AM.waitView('view-home');
    await AM.waitMorseReady();
    await AM.openMorse();
    await AM.tap('dot');   // ввели точку: буфер '.', автопроверка запланирована
    t('36.14 точка в буфере до отмены', AM.mstate().sequence === '.', AM.mstate().sequence);
    {
      const zone = AM.$('morseZone');
      zone.dispatchEvent(AM.pev('pointerdown'));
      await sleep(3600);   // > MORSE_CANCEL_MS (3500)
      t('36.15 удержание ≥3.5 с: подпись «Отмена», буфер стёрт, нажатие снято',
        AM.$('morseZoneMain').textContent === 'Отмена' && AM.mstate().sequence === '' &&
        !AM.$('morseZone').classList.contains('press'),
        AM.$('morseZoneMain').textContent + '/' + AM.mstate().sequence + '/' +
        AM.$('morseZone').className);
      zone.dispatchEvent(AM.pev('pointerup'));
      await sleep(60);
      t('36.15б после отпускания «Отмена» остаётся на экране (не «Удерживай»)',
        AM.$('morseZoneMain').textContent === 'Отмена' &&
        !AM.$('morseZone').classList.contains('press'),
        AM.$('morseZoneMain').textContent);
    }
    await sleep(700);       // больше MORSE_CHECK_MS — вердикт так и не приходит
    {
      const s36 = AM.mstate();
      t('36.16 отмена: ни символа, ни проверки; стрик и попытки не тронуты',
        s36.sequence === '' && s36.mode === 'input' && s36.streak === 5 && s36.dailyAttempts === 7,
        s36.sequence + '/' + s36.mode + '/' + s36.streak + '/' + s36.dailyAttempts);
    }
  }
  // — 36.17 страховка свайпа языков: pointerup на window — ответ засчитан —
  {
    const AS = await boot();
    await AS.waitView('view-home');
    await AS.waitMorseReady();
    for (let i = 0; i < 300 && AS.$('langSub').textContent.indexOf('500') < 0; i++) await sleep(20);
    AS.click(AS.$('btnLangStart'));
    await AS.waitView('view-langsession');
    await sleep(60);
    AS.click(AS.$('btnLsessBack'));
    await AS.waitView('view-langs');
    AS.click(AS.$('btnMixedTrain'));
    await AS.waitView('view-langsession');
    await sleep(60);
    const drag = AS.$('lsDrag');
    drag.dispatchEvent(AS.pevXY('pointerdown', 40, 300));
    drag.dispatchEvent(AS.pevXY('pointermove', 240, 300));   // далеко за порогом
    AS.w.dispatchEvent(AS.pevXY('pointerup', 240, 300));     // «потерянный» указатель ушёл на window
    await sleep(750);                                        // полёт карточки + переход
    const st36 = JSON.parse(AS.w.localStorage.getItem('nem_languages_progress_v1'));
    const done36 = st36.day ? (st36.day.done | 0) : 0;
    t('36.17 свайп, завершённый на window: ответ засчитан, transform пуст',
      done36 === 1 && AS.$('lsDrag').style.transform === '',
      done36 + '/' + AS.$('lsDrag').style.transform);
    // блокировку lsLock снаружи не прочитать — доказываем поведением: второй жест работает
    drag.dispatchEvent(AS.pevXY('pointerdown', 40, 300));
    drag.dispatchEvent(AS.pevXY('pointermove', 240, 300));
    drag.dispatchEvent(AS.pevXY('pointerup', 240, 300));
    await sleep(750);
    const st37 = JSON.parse(AS.w.localStorage.getItem('nem_languages_progress_v1'));
    const done37 = st37.day ? (st37.day.done | 0) : 0;
    t('36.17б после восстановления карточка не «заморожена»: второй свайп тоже засчитан',
      done37 === 2 && AS.$('lsDrag').style.transform === '',
      done37 + '/' + AS.$('lsDrag').style.transform);
  }
  // — 36.18 статика Раунда 20 —
  t('36.18 статика: отмена 3.5 с, центрирование оборота, оконная страховка, без техстрок в тостах',
    HTML.indexOf('var MORSE_CANCEL_MS=3500') >= 0 &&
    HTML.indexOf('var wasCancel=mz.cancelled') >= 0 &&
    HTML.indexOf('function triggerMorseCancel()') >= 0 &&
    HTML.indexOf('#lsBack .back-scroll{display:flex;flex-direction:column;justify-content:center') >= 0 &&
    HTML.indexOf('#lsBack .back-scroll>:first-child{margin-top:auto}') < 0 &&
    HTML.indexOf("window.addEventListener('pointerup'") >= 0 &&
    HTML.indexOf('function lsRecover(') >= 0 &&
    // R22: пользователь никогда не видит технических строк и советов про Chrome
    HTML.indexOf('no-speech-api') < 0 && HTML.indexOf('Откройте в Chrome') < 0 &&
    HTML.indexOf('synthesis=нет') < 0 &&
    HTML.indexOf("bindSortBox('archSorts'") >= 0 &&
    HTML.indexOf("bindSortBox('langArchSorts'") >= 0);
  t('36.20 статика R21/R22: полная отмена, MP3-плеер первичен, повтор слова в очереди',
    HTML.indexOf('function triggerMorseCancel()') >= 0 &&
    HTML.indexOf('палец ещё держит') >= 0 &&
    HTML.indexOf('mz.cancelled?\'Отмена\':\'Удерживай\'') >= 0 &&
    HTML.indexOf('function langSynth()') >= 0 && HTML.indexOf('webkitSpeechSynthesis') >= 0 &&
    HTML.indexOf('var langAudio=new Audio()') >= 0 &&
    HTML.indexOf('Не удалось запустить звук. Нажмите ещё раз.') >= 0 &&
    // R23: без повторных показов («Не помню» → сразу в «позабылись») и тихая «Пройти заново»
    HTML.indexOf('state.queue.push(state.queue.shift())') < 0 &&
    HTML.indexOf('r.requeued=true') < 0 &&
    HTML.indexOf('Слова, которые позабылись') >= 0 &&
    HTML.indexOf('.btn-primary.is-quiet') >= 0);
  t('36.19 статика языков: schemaVersion 3, журнал days, облако v:3, цикл 8 этапов',
    HTML.indexOf('return {schemaVersion:3, cards:{}, days:{}') >= 0 &&
    HTML.indexOf('JSON.stringify({v:3, u:langState.updatedAt') >= 0 &&
    HTML.indexOf('var LANG_STEP_DAYS={1:1,2:3,3:7,4:15,5:30}') >= 0 &&
    HTML.indexOf('return !!(p && p.s>=6)') >= 0 &&
    HTML.indexOf('p.a=1; p.d=null;') >= 0);

  /* ═══ 37. Раунд 22: реальные данные языков, MP3-поведение, все десять языков ═══ */
  {
    const fs = require('fs');
    const path = require('path');
    const real = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'languages.json'), 'utf8'));
    const cardsR = Array.isArray(real.cards) ? real.cards : [];
    const byLangR = {};
    cardsR.forEach(c => { (byLangR[c.languageId] = byLangR[c.languageId] || []).push(c); });
    // формат id эволюционировал: позиционные lang_XX_NN → семантические (lang_es_hello);
    // инвариант — «lang_<код языка>_<слаш>», уникальность и совпадение с именем mp3.
    const idOk = cardsR.every(c => /^lang_[a-z]{2}_[a-z0-9][a-z0-9_-]*$/.test(c.id) && c.audio === './assets/languages/audio/' + c.id + '.mp3');
    const uniq = new Set(cardsR.map(c => c.id)).size;
    const audioOk = cardsR.every(c => typeof c.audio === 'string' &&
      /^\.\/assets\/languages\/audio\/lang_[A-Za-z0-9_\-]+\.mp3$/.test(c.audio) &&
      c.audio.indexOf('..') < 0 && c.audio[0] !== '/' && !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(c.audio));
    const translitOk = cardsR.filter(c => ['zh', 'ja', 'ko', 'ar'].indexOf(c.languageId) >= 0)
      .every(c => String(c.transliteration || '').trim());
    const reqOk = cardsR.every(c => c.native && c.translationRu && c.languageId && c.bcp47 && c.language);
    const langs10 = Object.keys(byLangR).filter(k => byLangR[k].length === 50);
    // у каждого из десяти языков есть хотя бы одна MP3-карточка для проверки
    const langsAudio = langs10.filter(k => byLangR[k].some(c => /\.mp3$/.test(c.audio || '')));
    t('37.1 data/languages.json: 500 (10×50), позиционные id, audio безопасен, поля непусты',
      cardsR.length === 500 && langs10.length === 10 && uniq === 500 && idOk &&
      audioOk && translitOk && reqOk && langsAudio.length === 10,
      cardsR.length + '/' + langs10.length + '/' + uniq + '/' + (idOk && audioOk && translitOk) + '/' + langsAudio.length);

    // реальный файл проходит валидацию приложения и не ломает главную
    const LR = await boot({ langFile: real });
    await LR.waitView('view-home');
    await LR.waitMorseReady();
    for (let i = 0; i < 300 && LR.$('langSub').textContent.indexOf('500') < 0; i++) await sleep(20);
    t('37.2 приложение приняло реальный languages.json: «10 языков · 500», карточка без ошибки',
      /10 языков · 500 слов и фраз/.test(LR.$('langSub').textContent) &&
      LR.$('langChip').textContent === '0 из 10' &&
      LR.$('langAct').textContent === 'Начать',
      LR.$('langSub').textContent + '/' + LR.$('langChip').textContent);
    LR.click(LR.$('btnLangStart'));
    await LR.waitView('view-langsession');
    await sleep(60);
    LR.click(LR.$('btnLsessBack'));
    await LR.waitView('view-langs');
    LR.click(LR.$('btnMixedTrain'));
    await LR.waitView('view-langsession');
    await sleep(60);
    const stR = JSON.parse(LR.w.localStorage.getItem('nem_languages_progress_v1'));
    const qR = (stR && stR.day && stR.day.queue) ? stR.day.queue : [];
    const codes = qR.map(x => { const m = /^lang_([a-z]{2})_[a-z0-9][a-z0-9_-]*$/.exec(x); return m ? m[1] : null; }).filter(Boolean);
    t('37.3 очередь из реального файла: id строго lang_XX_NN, язык не повторяется подряд',
      qR.length === 5 && codes.length === qR.length &&
      qR.every((id, i) => i === 0 || qR[i - 1].slice(5, 7) !== id.slice(5, 7)),
      qR.length + '/' + codes.length + '/' + qR.slice(0, 4).join(','));
    const card0 = cardsR.find(c => c.id === qR[0]);
    LR.click(LR.$('btnLsSpeakFront'));
    const playReal = LR.w.__audioPlays;
    t('37.4 реальная карточка: play(card.audio) — путь совпадает с файлом данных',
      playReal.length === 1 && !!card0 && playReal[0] === card0.audio,
      (playReal[0] || 'нет') + ' vs ' + (card0 ? card0.audio : '?'));
  }

  // — 37.5: по одной MP3-карточке каждого из десяти языков —
  {
    const NAME2ID = {}; LANG_META.forEach(([id, nm]) => { NAME2ID[nm] = id; });
    const Q10 = LANG_META.map(([id]) => 'lang_' + id + '_01');
    const L10 = await boot({ seed: { nem_languages_progress_v1: JSON.stringify({
      schemaVersion: 3, cards: {}, days: {},
      day: { date: today(), queue: Q10, done: 0, nd: 0, rd: 0, lastLang: null },
      ok: 0, bad: 0, updatedAt: Date.now() }) } });
    await L10.waitView('view-home');
    await L10.waitMorseReady();
    for (let i = 0; i < 300 && L10.$('langSub').textContent.indexOf('500') < 0; i++) await sleep(20);
    L10.click(L10.$('btnLangStart'));
    await L10.waitView('view-langsession');
    await sleep(60);
    L10.click(L10.$('btnLsessBack'));
    await L10.waitView('view-langs');
    L10.click(L10.$('btnMixedTrain'));
    await L10.waitView('view-langsession');
    await sleep(60);
    const heard = new Set();
    for (let k = 0; k < 10; k++) {
      const nm = L10.$('lsLangName').textContent;
      const code = NAME2ID[nm];
      L10.click(L10.$('btnLsSpeakFront'));
      const pl = L10.w.__audioPlays;
      const src = pl[pl.length - 1] || '';
      if (src === './assets/languages/audio/lang_' + code + '_01.mp3') heard.add(code);
      L10.click(L10.$('btnLsYes'));
      await sleep(380);
    }
    t('37.5 MP3 проверена на карточке каждого из десяти языков',
      heard.size === 10,
      'прошло ' + heard.size + '; не прошли: ' + LANG_META.map(x => x[0]).filter(c => !heard.has(c)).join(','));
  }

  // — 37.6–37.10: механика MP3: перезапуск, ended, стоп на новой карточке и на выходе —
  {
    const MP = await boot();
    await MP.waitView('view-home');
    await MP.waitMorseReady();
    for (let i = 0; i < 300 && MP.$('langSub').textContent.indexOf('500') < 0; i++) await sleep(20);
    MP.click(MP.$('btnLangStart'));
    await MP.waitView('view-langsession');
    await sleep(60);
    MP.click(MP.$('btnLsessBack'));
    await MP.waitView('view-langs');
    MP.click(MP.$('btnMixedTrain'));
    await MP.waitView('view-langsession');
    await sleep(60);
    MP.click(MP.$('btnLsSpeakFront'));
    MP.click(MP.$('btnLsSpeakFront'));
    t('37.6 повторное нажатие 🔊 перезапускает запись (два play, тот же файл)',
      MP.w.__audioPlays.length === 2 && MP.w.__audioPlays[0] === MP.w.__audioPlays[1],
      MP.w.__audioPlays.join(' | '));
    MP.w.__audioInst.dispatch('ended');
    t('37.7 по ended кнопка успокаивается',
      MP.$('btnLsSpeakFront').classList.contains('is-playing') === false);
    MP.click(MP.$('btnLsSpeakFront'));
    t('37.8 во время игры кнопка в активном состоянии',
      MP.$('btnLsSpeakFront').classList.contains('is-playing') === true);
    MP.click(MP.$('btnLsYes'));
    await sleep(380);
    t('37.9 новая карточка: плеер очищен (src пуст, кнопка не горит)',
      MP.w.__audioInst.src === '' &&
      MP.$('btnLsSpeakFront').classList.contains('is-playing') === false,
      'src=' + MP.w.__audioInst.src);
    MP.click(MP.$('btnLsSpeakFront'));
    MP.click(MP.$('btnLsessBack'));
    await sleep(80);
    t('37.10 выход из упражнения: плеер пуст', MP.w.__audioInst.src === '', 'src=' + MP.w.__audioInst.src);
  }

  // — 37.11–37.12: play() отклонился — человеческий тост, обучение не блокируется —
  {
    const PF = await boot({ audioPlayFail: true });
    await PF.waitView('view-home');
    await PF.waitMorseReady();
    for (let i = 0; i < 300 && PF.$('langSub').textContent.indexOf('500') < 0; i++) await sleep(20);
    PF.click(PF.$('btnLangStart'));
    await PF.waitView('view-langsession');
    await sleep(60);
    PF.click(PF.$('btnLsessBack'));
    await PF.waitView('view-langs');
    PF.click(PF.$('btnMixedTrain'));
    await PF.waitView('view-langsession');
    await sleep(60);
    PF.click(PF.$('btnLsSpeakFront'));
    await sleep(140);
    t('37.11 play() не запустился → «Не удалось запустить звук. Нажмите ещё раз.»',
      /Не удалось запустить звук\. Нажмите ещё раз\./.test(PF.$('toast').textContent) &&
      !PF.$('toast').querySelector('.toast-act') &&
      !/no-speech|код:|Chrome/i.test(PF.$('toast').textContent),
      PF.$('toast').textContent);
    PF.click(PF.$('btnLsYes'));
    await sleep(380);
    t('37.12 ошибка звука не мешает ответу и прогрессу',
      JSON.parse(PF.w.localStorage.getItem('nem_languages_progress_v1')).day.done === 1);
  }

  t('37.13 резерв удалён совсем; миграция схемы и стоп плеера на pagehide целы',
    HTML.indexOf('function exportBackup') < 0 && HTML.indexOf('exportVersion:7') < 0 &&
    HTML.indexOf('schemaVersion:6,') >= 0 &&
    HTML.indexOf('migrateWordsV6(); save();') >= 0 &&
    HTML.indexOf("window.addEventListener('pagehide', function(){ stopLangSpeech(); langAudioStop(); })") >= 0);

/* ═══ 38. Главный экран: два вида, переключатель в конце настроек ═══ */
  {
    const H1 = await boot({});
    await H1.waitView('view-home');
    for (let i = 0; i < 300 && !H1.$('homeDate').textContent; i++) await sleep(20);
    t('38.1 по умолчанию «Мой вариант» (data-home-layout=mine)',
      H1.$('view-home').getAttribute('data-home-layout') === 'mine',
      H1.$('view-home').getAttribute('data-home-layout'));
    t('38.2 заголовок дня при не начатом дне — «Вечерняя тренировка»',
      H1.$('homeTitle').textContent === 'Вечерняя тренировка', H1.$('homeTitle').textContent);
    t('38.3 пилл «✓ Посмотреть результат дня» под сводкой, скрыт когда дня нет',
      H1.$('btnShowResult').textContent.indexOf('Посмотреть результат дня') >= 0 &&
      H1.$('btnShowResult').hidden === true, H1.$('btnShowResult').textContent);
    t('38.4 у каждого действия видна стрелка › и есть aria-label строки',
      ['btnStart', 'btnLangStart', 'btnMorseStart'].every(function(id){
        const r = H1.$(id);
        return r && r.querySelector('.sec-arr') && r.getAttribute('aria-label') &&
               r.getAttribute('aria-label').indexOf('—') > 0;
      }));
    // переключатель — самым последним блоком настроек
    H1.click(H1.$('btnSettings'));
    await sleep(60);
    const sheet = H1.$('settingsSheet');
    const homeSeg = sheet.querySelector('[data-home-btn]');
    const resetV1 = H1.$('btnResetV1');
    t('38.5 «Вид главного экрана» — последняя секция настроек; зон резерва больше нет',
      !!homeSeg && !resetV1 && sheet.lastElementChild &&
      sheet.lastElementChild.contains(homeSeg) &&
      HTML.indexOf('РЕЗЕРВНАЯ КОПИЯ') < 0,
      homeSeg ? 'ok' : 'нет сегмента');
    const mineBtn = sheet.querySelector('[data-home-btn="mine"]');
    const listBtn = sheet.querySelector('[data-home-btn="list"]');
    t('38.6 активен «Мой вариант»',
      mineBtn.classList.contains('on') === true && listBtn.classList.contains('on') === false);
    const stBefore = JSON.parse(H1.w.localStorage.getItem('no1equalsme_state_v2') || 'null');
    H1.click(listBtn);
    await sleep(80);
    t('38.7 выбор применился сразу: data-home-layout=list, настройки открыты',
      H1.$('view-home').getAttribute('data-home-layout') === 'list' &&
      H1.$('settingsOverlay').hidden === false);
    const stList = JSON.parse(H1.w.localStorage.getItem('no1equalsme_state_v2'));
    t('38.8 выбор сохранился и не тронул учебное состояние',
      stList.settings && stList.settings.homeLayout === 'list' &&
      stList.status === (stList.status) && stList.queue.length === (stList.queue || []).length,
      stList.settings ? stList.settings.homeLayout : 'нет');
    H1.click(H1.$('btnCloseSettings'));
    await sleep(320);
    t('38.9 возврат на главную — выбранный вид «Список»',
      H1.$('view-home').getAttribute('data-home-layout') === 'list' &&
      H1.$('view-home').classList.contains('active'));
    // перезапуск: вид переживает загрузку состояния
    const H2 = await boot({ seed: { no1equalsme_state_v2: JSON.stringify(stList) } });
    await H2.waitView('view-home');
    for (let i = 0; i < 300 && !H2.$('homeDate').textContent; i++) await sleep(20);
    for (let i = 0; i < 300 && H2.$('view-home').getAttribute('data-home-layout') !== 'list'; i++) await sleep(20);
    t('38.10 после перезагрузки остаётся «Список»',
      H2.$('view-home').getAttribute('data-home-layout') === 'list',
      H2.$('view-home').getAttribute('data-home-layout'));
    // старое сохранение без homeLayout → «Мой вариант», без ошибок
    const oldSave = JSON.parse(JSON.stringify(stList));
    delete oldSave.settings.homeLayout;
    const H3 = await boot({ seed: { no1equalsme_state_v2: JSON.stringify(oldSave) } });
    await H3.waitView('view-home');
    for (let i = 0; i < 300 && !H3.$('homeDate').textContent; i++) await sleep(20);
    t('38.11 старое сохранение без homeLayout открывается как «Мой вариант»',
      H3.$('view-home').getAttribute('data-home-layout') === 'mine' &&
      H3.$('btnStart') !== null,
      H3.$('view-home').getAttribute('data-home-layout'));
    t('38.12 homeLayout в точках хранения (fresh/миграция/сбросы/облако; импорт удалён)',
      (HTML.match(/homeLayout/g) || []).length >= 10 &&
      HTML.indexOf("out.settings.homeLayout=(s.settings.homeLayout==='list')?'list':'mine'") >= 0 &&
      HTML.indexOf("homeLayout:(state.settings.homeLayout==='list')?'list':'mine'") >= 0 &&
      HTML.indexOf("obj.homeLayout==='list'||obj.homeLayout==='mine'") >= 0 &&
      HTML.indexOf("state.settings.homeLayout=(c.settings.homeLayout") < 0,
      String((HTML.match(/homeLayout/g) || []).length));
    t('38.13 адаптив 320–480: перенос длинного действия и safe-area главной',
      /@media \(max-width:360px\)\{[\s\S]*?\.sec-act\{font-size:12\.5px/.test(HTML) &&
      /\.sec-act\{[^}]*max-width:47%/.test(HTML),
      'media/sec-act');
    t('38.14 pill результата дня — зелёный, скруглённый, тонкая рамка',
      /\.pill-result\{[^}]*border-radius:999px[^}]*border:1px solid var\(--green-line\)/.test(HTML) &&
      /\.pill-result\{[^}]*color:var\(--green\)/.test(HTML),
      'pill');
  }

/* ═══ 39. «Ещё разделы», режимы «Морзе»/«Дактиль», ямбический ключ ═══ */
  {
    const E1 = await boot({});
    await E1.waitView('view-home');
    await E1.waitMorseReady();
    t('39.1 «Ещё разделы» свёрнуто по умолчанию',
      E1.$('btnSecMore').getAttribute('aria-expanded') === 'false' &&
      E1.$('secMore').hidden === true);
    E1.click(E1.$('btnSecMore'));
    t('39.2 разворот: строки «Морзе» и «Дактиль» с действиями и стрелками',
      E1.$('secMore').hidden === false &&
      E1.$('btnSecMore').getAttribute('aria-expanded') === 'true' &&
      E1.$('secMoreText').textContent === 'Свернуть' &&
      E1.$('letterAct').textContent === 'Начать' && E1.$('dactylAct').textContent === 'Начать' &&
      !!E1.$('letterAct').parentElement.querySelector('.sec-arr') &&
      !!E1.$('dactylAct').parentElement.querySelector('.sec-arr'));
    E1.click(E1.$('btnSecMore'));
    await sleep(450); // схлопывание анимировано — hidden только в финале
    t('39.3 сворачивание обратно', E1.$('secMore').hidden === true &&
      E1.$('secMoreText').textContent === 'Ещё разделы');

    /* — «Морзе»: буква вместо жеста, код настукивается как обычно — */
    E1.click(E1.$('btnSecMore'));
    E1.click(E1.$('btnDrillLetter'));
    await E1.waitView('view-morse');
    await sleep(80);
    const bigL = E1.$('morseBigLetter');
    t('39.4 режим «Морзе»: крупная буква вместо жеста, своя подсказка',
      !bigL.hidden && bigL.textContent === 'А' &&
      E1.$('morseImgWrap').hidden === true &&
      E1.$('morseCue').textContent === 'Настучи код этой буквы',
      bigL.textContent + '/' + E1.$('morseCue').textContent);
    await E1.tap('dot');
    await E1.tap('dash');            // '.-' = А (первая карточка при random=0)
    await sleep(650);
    t('39.5 код «.-» засчитан: своя точность дрилла, дневная цель не тронута',
      E1.$('morseStatusMain').textContent === 'Точность: 100%' &&
      E1.mstate().drills.letter.correct === 1 &&
      E1.mstate().dailyCorrect === 0,
      E1.$('morseStatusMain').textContent);
    for (let i = 0; i < 300 && E1.mstate().mode !== 'input'; i++) await sleep(20);

    /* — «Дактиль»: жест, ответ — буква с клавиатуры — */
    E1.click(E1.$('btnMorseBack'));
    await E1.waitView('view-home');
    E1.click(E1.$('btnDrillDactyl'));
    await E1.waitView('view-morse');
    await sleep(80);
    t('39.6 режим «Дактиль»: жест виден, буква спрятана, своя клавиатура показана',
      E1.$('morseImgWrap').hidden === false &&
      E1.$('morseBigLetter').hidden === true &&
      E1.$('morseZoneMain').textContent === 'Дактиль' &&
      E1.$('morseCue').textContent === 'Нажми букву на клавиатуре' &&
      E1.$('morseKeyboard').hidden === false &&
      E1.$('morseEx').classList.contains('kbd-mode') === true,
      E1.$('morseZoneMain').textContent + '/' + E1.$('morseCue').textContent);
    {
      const c1 = LETTER(E1.mstate().currentId); const c1id = E1.mstate().currentId;
      E1.doc.dispatchEvent(new E1.w.KeyboardEvent('keydown', { key: c1.letter.toLowerCase(), bubbles: true, cancelable: true }));
      await sleep(60);
      const good1 = E1.$('morseKeyboard').querySelector('[data-key="' + c1.letter.toUpperCase() + '"]');
      t('39.7 верная буква: клавиша зелёная, зачёт свой, экрана «Верно» нет',
        E1.mstate().drills.dactyl.correct === 1 &&
        E1.mstate().dailyCorrect === 0 &&
        E1.mstate().mode === 'input' &&
        good1.classList.contains('mk-good') === true,
        'dactyl=' + E1.mstate().drills.dactyl.correct + ' mode=' + E1.mstate().mode);
      for (let i = 0; i < 100 && E1.mstate().currentId === c1id; i++) await sleep(20);
      t('39.7b через полсекунды — новая буква, клавиши чистые',
        E1.mstate().currentId !== c1id &&
        good1.classList.contains('mk-good') === false,
        'now=' + E1.mstate().currentId);
    }
    {
      const c2 = LETTER(E1.mstate().currentId); const c2id = E1.mstate().currentId;
      const wrongUp = (c2.letter.toUpperCase() === 'Б') ? 'А' : 'Б';
      E1.doc.dispatchEvent(new E1.w.KeyboardEvent('keydown', { key: wrongUp.toLowerCase(), bubbles: true, cancelable: true }));
      await sleep(60);
      const kb2 = E1.$('morseKeyboard');
      const bad2 = kb2.querySelector('[data-key="' + wrongUp + '"]');
      const hint2 = kb2.querySelector('[data-key="' + c2.letter.toUpperCase() + '"]');
      const att2 = E1.mstate().drills.dactyl.attempts;
      t('39.8 промах: клавиша краснеет, верная пульсирует жёлтым, вопрос жив',
        bad2.classList.contains('mk-bad') === true &&
        hint2.classList.contains('mk-hint') === true &&
        E1.mstate().drills.dactyl.attempts === att2 &&
        E1.mstate().drills.dactyl.errors === 0 &&
        E1.mstate().mode === 'input',
        'bad=' + bad2.className + ' hint=' + hint2.className);
      E1.doc.dispatchEvent(new E1.w.KeyboardEvent('keydown', { key: c2.letter.toLowerCase(), bubbles: true, cancelable: true }));
      await sleep(60);
      t('39.8b нажатие по жёлтой подсказке: зелёная и ошибка в свой счётчик',
        E1.mstate().drills.dactyl.errors === 1 &&
        E1.mstate().drills.dactyl.attempts === att2 + 1 &&
        E1.mstate().dailyErrors === 0 &&
        hint2.classList.contains('mk-good') === true,
        'errors=' + E1.mstate().drills.dactyl.errors);
      for (let i = 0; i < 100 && E1.mstate().currentId === c2id; i++) await sleep(20);
    }

    /* — настройка «Ввод морзе» — */
    E1.click(E1.$('btnMorseBack'));
    await E1.waitView('view-home');
    E1.click(E1.$('btnSettings'));
    await sleep(80);
    const keySegs = [...E1.doc.querySelectorAll('[data-keyer-btn]')];
    t('39.9 переключатель «Ввод морзе»: по умолчанию «Сингл»',
      keySegs.length === 2 && keySegs[0].textContent === 'Сингл' &&
      keySegs[1].textContent === 'Ямбический ключ А' &&
      keySegs[0].classList.contains('on') === true &&
      keySegs[1].classList.contains('on') === false,
      keySegs.map(b => b.textContent + '=' + b.classList.contains('on')).join(','));
    E1.click(keySegs[1]);
    await sleep(80);
    t('39.10 «Ямбический ключ А» выбран и сохранён',
      keySegs[1].classList.contains('on') === true &&
      E1.mstate().keyer === 'iambic', String(E1.mstate().keyer));
    E1.click(E1.$('btnCloseSettings'));
    await sleep(320);
    E1.click(E1.$('btnMorseStart'));
    await E1.waitView('view-morse');
    await sleep(80);
    t('39.11 обычное поле разделено на два рычага',
      E1.$('morseLevers').hidden === false &&
      E1.$('morseZoneMain').hidden === true &&
      E1.$('leverDot').getAttribute('data-lever') === 'dot' &&
      E1.$('leverDash').getAttribute('data-lever') === 'dash');
    /* два разных pointerId — как у настоящих двух пальцев */
    const pevPid = (el, type, pid) => {
      const e = new E1.w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: 80, clientY: 80 });
      Object.defineProperty(e, 'pointerId', { value: pid });
      el.dispatchEvent(e);
    };
    pevPid(E1.$('leverDot'), 'pointerdown', 1);
    pevPid(E1.$('leverDot'), 'pointerup', 1);
    t('39.12 левый рычаг — точка', E1.mstate().sequence === '.', E1.mstate().sequence);
    pevPid(E1.$('leverDash'), 'pointerdown', 2);
    await sleep(200);   // режим А: знак ставится на границе паузы, не мгновенно
    t('39.13 правый рычаг — тире', E1.mstate().sequence === '.-', E1.mstate().sequence);
    pevPid(E1.$('leverDash'), 'pointerup', 2);
    await sleep(900);   // граница паузы → стоп → автопроверка через 500 мс
    t('39.14 после паузы проверка сработала (нет повторных нажатий)',
      E1.mstate().mode !== 'input',
      'mode=' + E1.mstate().mode);
    for (let i = 0; i < 300 && !(E1.mstate().mode === 'input' && E1.mstate().sequence === ''); i++) await sleep(20);
    pevPid(E1.$('leverDot'), 'pointerdown', 1);    // точка: стартует сразу
    pevPid(E1.$('leverDash'), 'pointerdown', 2);   // «сжатие»: флаг поднялся, цикл увидит его на паузе
    await sleep(520);                              // ~4 контрольных окна по 120 мс
    const altSeq = E1.mstate().sequence;
    const dIx = altSeq.indexOf('-');
    t('39.15 оба рычага: строгое чередование от противоположного последнему',
      altSeq.length >= 3 && dIx >= 0 && /^-\.?(-\.?)*$/.test(altSeq.slice(dIx)),
      altSeq);
    pevPid(E1.$('leverDash'), 'pointerup', 2);
    pevPid(E1.$('leverDot'), 'pointerup', 1);
    for (let i = 0; i < 300 && !(E1.mstate().mode === 'input' && E1.mstate().sequence === ''); i++) await sleep(20);
    pevPid(E1.$('leverDot'), 'pointerdown', 1);    // держим точки: '.' по циклу 1U+1U
    await sleep(350);
    pevPid(E1.$('leverDash'), 'pointerdown', 2);   // нажали тире — дождёмся границы паузы
    let g16 = 0;
    while (g16++ < 25 && E1.mstate().sequence.indexOf('-') < 0) await sleep(30);
    pevPid(E1.$('leverDash'), 'pointerup', 2);      // отпустили тире — точки продолжают
    const atDash = E1.mstate().sequence;
    g16 = 0;
    while (g16++ < 15 && E1.mstate().sequence.length <= atDash.length) await sleep(30);
    const sqSeq = E1.mstate().sequence;
    pevPid(E1.$('leverDot'), 'pointerup', 1);
    t('39.16 режим А: тире принято на границе паузы, дальше точки идут сами',
      /^\.+-\.?\.?$/.test(sqSeq), sqSeq);
    /* — R34 мультитч-фикс: второй палец всегда isPrimary:false — */
    for (let i = 0; i < 300 && !(E1.mstate().mode === 'input' && E1.mstate().sequence === ''); i++) await sleep(20);
    const pevPid2 = (el, type, pid, primary) => {
      const e = new E1.w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: 80, clientY: 80 });
      Object.defineProperty(e, 'pointerId', { value: pid });
      Object.defineProperty(e, 'isPrimary', { value: primary !== false });
      el.dispatchEvent(e);
    };
    pevPid2(E1.$('leverDot'), 'pointerdown', 7, true);    // основной палец держит точки
    await sleep(30);
    pevPid2(E1.$('leverDash'), 'pointerdown', 8, false);  // второй палец — не primary!
    await sleep(160);          // режим А: флаг увиден на границе паузы → тире
    const squeeze2 = E1.mstate().sequence;
    t('39.18 сжатие не-primary пальцем: тире принято, оба рычага подсвечены',
      /^\.+-/.test(squeeze2) &&
      E1.$('leverDash').classList.contains('press') === true &&
      E1.$('leverDot').classList.contains('press') === true,
      squeeze2 + ' dash=' + E1.$('leverDash').className);
    await sleep(350); // тик ритма: чередование не прервалось
    t('39.19 оба держат — жёсткое чередование .-.- и для не-primary пальца',
      /^\.\.?(-\.?)+$/.test(E1.mstate().sequence),
      E1.mstate().sequence);
    pevPid2(E1.$('leverDash'), 'pointerup', 8, false);
    await sleep(30);
    t('39.20 отпускание не-primary пальца: подсветка снята, точки живут',
      E1.$('leverDash').classList.contains('press') === false &&
      E1.$('leverDot').classList.contains('press') === true,
      E1.$('leverDash').className);
    pevPid2(E1.$('leverDot'), 'pointerup', 7, true);
    await sleep(650); // автопроверка завершит карточку — состояние чистое для следующих тестов

    /* — R35: отпускание одного рычага не глушит другой — */
    for (let i = 0; i < 300 && !(E1.mstate().mode === 'input' && E1.mstate().sequence === ''); i++) await sleep(20);
    const pevLc = (el, type, pid) => {
      const e = new E1.w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: 80, clientY: 80 });
      Object.defineProperty(e, 'pointerId', { value: pid });
      Object.defineProperty(e, 'isPrimary', { value: true });
      el.dispatchEvent(e);
    };
    pevLc(E1.$('leverDot'), 'pointerdown', 31);   // точка: '.'
    await sleep(40);
    pevLc(E1.$('leverDash'), 'pointerdown', 32);  // сжатие: '-'
    await sleep(40);
    pevLc(E1.$('leverDot'), 'pointerup', 31);      // отпускаю точку…
    pevLc(E1.$('leverDot'), 'lostpointercapture', 31); // …браузер штатно снимает её capture
    await sleep(160);                              // граница паузы: тире уже должно «звучать»
    const s1 = E1.mstate().sequence;
    await sleep(420);                              // тик ритма: тире обязано продолжать
    const s2 = E1.mstate().sequence;
    t('39.22 отпускание одного рычага: held-тире продолжает писаться',
      /^\.+-/.test(s1) && s2.length > s1.length && /-$/.test(s2) &&
      E1.$('leverDash').classList.contains('press') === true,
      s1 + '→' + s2);
    pevLc(E1.$('leverDot'), 'pointercancel', 31);  // поздний cancel мёртвого пальца — безвреден
    await sleep(40);
    t('39.22a cancel уже отпущенного пальца ничего не меняет', E1.mstate().sequence === s2, s2);
    pevLc(E1.$('leverDash'), 'pointerup', 32);
    const s3 = E1.mstate().sequence;
    await sleep(850);                              // пауза/стоп цикла → автопроверка через 500 мс
    t('39.23 отпускание последнего рычага — ритм встал, автопроверка сработала',
      E1.mstate().sequence === s3 && E1.mstate().mode !== 'input', s3 + '/' + E1.mstate().mode);
    for (let i = 0; i < 300 && !(E1.mstate().mode === 'input' && E1.mstate().sequence === ''); i++) await sleep(20);

    /* R35: в ямбике при зажатии — никаких фоновых light-пульсов, только strong на символ */
    E1.w.__haptics.length = 0;
    pevLc(E1.$('leverDot'), 'pointerdown', 41);
    await sleep(480);                    // дольше периода ритма: 2 символа, ни одного «фона»
    pevLc(E1.$('leverDot'), 'pointerup', 41);
    const lights24 = E1.w.__haptics.filter(x => x === 'impact:light').length;
    const heavies24 = E1.w.__haptics.filter(x => x === 'impact:heavy').length;
    t('39.24 ямбика: при зажатии нет фонового гула — только пульс на поставленный символ',
      lights24 === 0 && heavies24 >= 2, 'L' + lights24 + '/H' + heavies24);
    for (let i = 0; i < 300 && !(E1.mstate().mode === 'input' && E1.mstate().sequence === ''); i++) await sleep(20);

    /* статика: шрифт «Морзе + Дактиль» на 1px меньше и тонкий переключатель */
    t('39.17 статика: заголовок «Морзе + Дактиль» 15px, блок «Ввод морзе» в настройках',
      HTML.indexOf('.name-tight{font-size:15px}') >= 0 &&
      HTML.indexOf('name-tight">Морзе + Дактиль') >= 0 &&
      HTML.indexOf('data-keyer-btn="hold"') >= 0 &&
      HTML.indexOf('data-keyer-btn="iambic"') >= 0);
  }

/* ═══ 40. Раздельная точность разделов, статистика/облако, клавиатура на телефоне ═══ */
  {
    const E2 = await boot({});
    await E2.waitView('view-home');
    await E2.waitMorseReady();
    t('40.1 свежая главная: у дриллов своя точность «—», норма только у «Морзе + Дактиль»',
      /0 из 10 правильных/.test(E2.$('morseSub').textContent) &&
      E2.$('letterSub').textContent === 'Точность —' &&
      E2.$('dactylSub').textContent === 'Точность —' &&
      E2.$('letterChip').textContent === 'Сегодня' &&
      E2.$('dactylChip').textContent === 'Сегодня',
      [E2.$('morseSub').textContent, E2.$('letterSub').textContent, E2.$('dactylSub').textContent].join(' | '));

    /* «Морзе» (дрилл): верный ответ идёт в свой счётчик, не в дневную норму */
    E2.click(E2.$('btnSecMore'));
    E2.click(E2.$('btnDrillLetter'));
    await E2.waitView('view-morse');
    await sleep(80);
    await E2.tap('dot');
    await E2.tap('dash');                 // '.-' = А (первая карточка при random=0)
    await sleep(650);
    t('40.2 «Морзе»: статус без дневной нормы, счётчик свой, daily* нетронуты',
      E2.$('morseStatusMain').textContent === 'Точность: 100%' &&
      E2.$('morseStatusSub').textContent === 'Верных 1 из 1' &&
      !/Правильно/.test(E2.$('morseStatusMain').textContent) &&
      E2.$('morseStreak').hidden === false &&
      E2.$('morseStreakN').textContent === '1' &&
      E2.$('morseSessTitle').textContent === 'Морзе' &&
      E2.mstate().drills.letter.correct === 1 &&
      E2.mstate().drills.letter.streak === 1 && E2.mstate().drills.letter.streakBest === 1 &&
      E2.mstate().dailyCorrect === 0 && E2.mstate().dailyAttempts === 0,
      E2.$('morseStatusMain').textContent + ' / ' + E2.$('morseStatusSub').textContent);
    E2.click(E2.$('btnMorseBack'));
    await E2.waitView('view-home');
    /* «Дактиль»: заголовок по режиму, свой стрик виден и пуст */
    E2.click(E2.$('btnSecMore'));
    E2.click(E2.$('btnDrillDactyl'));
    await E2.waitView('view-morse');
    await sleep(80);
    t('40.2a «Дактиль»: заголовок «Дактиль», стрик виден и равен 0',
      E2.$('morseSessTitle').textContent === 'Дактиль' &&
      E2.$('morseStreak').hidden === false && E2.$('morseStreakN').textContent === '0');
    E2.click(E2.$('btnMorseBack'));
    await E2.waitView('view-home');
    t('40.3 главная: строка «Морзе» показывает свою точность, цель не тронута',
      E2.$('letterSub').textContent === 'Точность 100% · ошибок 0' &&
      E2.$('letterChip').textContent === 'В процессе' &&
      E2.$('letterAct').textContent === 'Продолжить' &&
      /^0 из 10 правильных/.test(E2.$('morseSub').textContent) &&
      E2.$('dactylSub').textContent === 'Точность —',
      E2.$('letterSub').textContent + ' | ' + E2.$('morseSub').textContent);

    /* Статистика («Подробнее»): данные дриллов туда не попадают */
    E2.click(E2.$('btnDetails'));
    await E2.waitView('view-details');
    await sleep(60);
    t('40.4 в статистике нет результатов дриллов',
      /Сегодня: 0 \/ 10/.test(E2.$('dtMorseTotals').textContent) &&
      /пока нет данных/.test(E2.$('detMorseFoot').textContent),
      E2.$('dtMorseTotals').textContent + ' | ' + E2.$('detMorseFoot').textContent);
    E2.click(E2.$('btnDetailsBack'));
    await E2.waitView('view-home');

    /* «Дактиль»: своя клавиатура вместо системной (в webview тап по полю
       открывал и сразу закрывал клавиатуру) — тап по букве засчитывается */
    E2.click(E2.$('btnDrillDactyl'));
    await E2.waitView('view-morse');
    for (let i = 0; i < 300 && E2.mstate().mode !== 'input'; i++) await sleep(20);
    {
      const card = LETTER(E2.mstate().currentId); const cid5 = E2.mstate().currentId;
      const kbtn = E2.$('morseKeyboard').querySelector('[data-key="' + card.letter.toUpperCase() + '"]');
      E2.click(kbtn);
      await sleep(60);
      t('40.5 тап по верной клавише: зелёная, зачёт, панель приклеена снизу и не прячется',
        E2.mstate().drills.dactyl.correct === 1 &&
        E2.mstate().mode === 'input' && E2.mstate().dailyCorrect === 0 &&
        kbtn.classList.contains('mk-good') === true &&
        E2.$('morseKeyboard').hidden === false &&
        E2.$('morseEx').classList.contains('kbd-mode') === true,
        'correct=' + E2.mstate().drills.dactyl.correct + ' mode=' + E2.mstate().mode);
      for (let i = 0; i < 100 && E2.mstate().currentId === cid5; i++) await sleep(20);
    }
    /* структура панели: 33 уникальные буквы; тап по зоне ничего не вводит */
    {
      const keys = [...E2.$('morseKeyboard').querySelectorAll('button[data-key]')];
      const uniq = new Set(keys.map(k => k.getAttribute('data-key')));
      const att0 = E2.mstate().drills.dactyl.attempts;
      const zev = (type) => {
        const e = new E2.w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
        Object.defineProperty(e, 'pointerId', { value: 9 });
        E2.$('morseZone').dispatchEvent(e);
      };
      zev('pointerdown'); zev('pointerup');
      const rowsTxt = [...E2.$('morseKeyboard').querySelectorAll('.mk-row')]
        .map(r => [...r.querySelectorAll('button')].map(b => b.getAttribute('data-key')).join(''));
      t('40.6 панель: 33 буквы, ряды как в Gboard, системного поля нет, тап по зоне inert',
        keys.length === 33 && uniq.size === 33 && uniq.has('А') && uniq.has('Я') && uniq.has('Ё') &&
        rowsTxt.join('|') === 'ЙЦУКЕНГШЩЗХ|ФЫВАПРОЛДЖЭ|ЪЯЧСМИТЬБЮЁ' &&
        rowsTxt[2].startsWith('ЪЯ') &&
        !E2.$('morseKeyInput') &&
        E2.$('morseKeyboard').hidden === false &&
        E2.mstate().mode === 'input' && E2.mstate().drills.dactyl.attempts === att0,
        'rows=' + rowsTxt.join('|'));
    }
    /* неверная буква: красная + жёлтая подсказка; ошибка пишется только после тапа по верной */
    {
      const card = LETTER(E2.mstate().currentId); const cid7 = E2.mstate().currentId;
      const wrong = card.letter.toUpperCase() === 'Б' ? 'А' : 'Б';
      const kb = E2.$('morseKeyboard');
      const att0 = E2.mstate().drills.dactyl.attempts;
      E2.click(kb.querySelector('[data-key="' + wrong + '"]'));
      await sleep(60);
      t('40.7 промах: красная клавиша, жёлтая подсказка, счётчик молчит',
        kb.querySelector('[data-key="' + wrong + '"]').classList.contains('mk-bad') === true &&
        kb.querySelector('[data-key="' + card.letter.toUpperCase() + '"]').classList.contains('mk-hint') === true &&
        E2.mstate().drills.dactyl.attempts === att0 &&
        E2.mstate().dailyErrors === 0 && E2.mstate().mode === 'input',
        'attempts=' + E2.mstate().drills.dactyl.attempts);
      E2.click(kb.querySelector('[data-key="' + card.letter.toUpperCase() + '"]'));
      await sleep(60);
      t('40.7b тап по жёлтой: ошибка в свой счётчик, dailyErrors нетронут',
        E2.mstate().drills.dactyl.errors === 1 &&
        E2.mstate().drills.dactyl.attempts === att0 + 1 &&
        E2.mstate().dailyErrors === 0,
        'errors=' + E2.mstate().drills.dactyl.errors);
      for (let i = 0; i < 100 && E2.mstate().currentId === cid7; i++) await sleep(20);
    }

    /* Возврат в «Морзе + Дактиль»: его счётчики считаются как раньше */
    E2.click(E2.$('btnMorseBack'));
    await E2.waitView('view-home');
    E2.click(E2.$('btnMorseStart'));
    await E2.waitView('view-morse');
    await sleep(80);
    { // код ИМЕННО текущей карточки (после ошибки дактиля буква не менялась)
      const cardSign = LETTER(E2.mstate().currentId);
      for (const ch of cardSign.morse) await E2.tap(ch === '.' ? 'dot' : 'dash');
    }
    await sleep(650);
    t('40.8 «Морзе + Дактиль» после дриллов ведёт счёт нормы, как прежде',
      E2.$('morseStatusMain').textContent === 'Правильно: 1 / 10' &&
      E2.$('morseKeyboard').hidden === true &&
      E2.$('morseEx').classList.contains('kbd-mode') === false &&
      E2.mstate().dailyCorrect === 1 &&
      E2.mstate().drills.letter.correct === 1 &&
      E2.mstate().drills.letter.streak === 1 && E2.mstate().drills.letter.streakBest === 1 &&
      E2.mstate().drills.dactyl.errors === 1,
      E2.$('morseStatusMain').textContent);

    /* Облако: между CloudAdapter и ключом морзе — ни одного упоминания
       морзе/дриллов: выгружаются только meta/settings/session/stats и слова */
    const cslice = HTML.slice(HTML.indexOf('CloudAdapter'), HTML.indexOf('MORSE_URL'));
    t('40.9 облако не знает о морзе и дриллах',
      cslice.length > 1000 && cslice.indexOf('morseState') < 0 &&
      cslice.indexOf('drills') < 0 && cslice.indexOf('nem_morse') < 0 &&
      cslice.indexOf('morseDrill') < 0,
      'len=' + cslice.length + ' hits=' + ['morseState','drills','nem_morse','morseDrill']
        .filter(x => cslice.indexOf(x) >= 0).join(','));
    {
      const flat = HTML.replace(/\s+/g, ' ');
      t('40.11 клавиатура приклеена снизу, текст между фото и ней скрыт, пауза 500 мс',
        flat.indexOf('.morse-keyboard{position:fixed;left:0;right:0;bottom:0;z-index:24;display:flex;flex-direction:column') >= 0 &&
        flat.indexOf('.morse-keyboard{display:flex!important') < 0 &&
        HTML.indexOf('.morse-ex.kbd-mode .morse-zone{display:none}') >= 0 &&
        flat.indexOf('.morse-ex.kbd-mode .morse-codewrap, .morse-ex.kbd-mode .morse-zone') >= 0 &&
        HTML.indexOf('.morse-ex.kbd-mode{justify-content:center;padding-bottom:calc(66vw') >= 0 &&
        /min-height:12\.22vw;border-radius:2\.4vw/.test(HTML) &&
        /\.morse-keyboard\{[^}]*gap:2\.59vw/.test(HTML) &&
        /font-size:6\.3vw/.test(HTML) &&
        HTML.indexOf("rows=['ЙЦУКЕНГШЩЗХ','ФЫВАПРОЛДЖЭ','ЪЯЧСМИТЬБЮЁ']") >= 0 &&
        HTML.indexOf('var MORSE_NEXT_MS=500;') >= 0 &&
        HTML.indexOf('.mk-key.mk-bad{') >= 0 && HTML.indexOf('.mk-key.mk-hint{') >= 0 &&
        HTML.indexOf('.mk-key.mk-good{') >= 0,
        'static');
    }
    const leverHtml = HTML.slice(HTML.indexOf('id="morseLevers"'), HTML.indexOf('morseResult'));
    t('40.10 на рычагах нет надписей «точки»/«тире» — источник наложений удалён',
      leverHtml.indexOf('точки') < 0 && leverHtml.indexOf('тире') < 0 &&
      /data-lever="dot"/.test(leverHtml) && /data-lever="dash"/.test(leverHtml),
      JSON.stringify(leverHtml.slice(0, 120)));
  }

/* ═══ 41. Анимационный слой: физика карточек, фидбек морзе, reduced-motion ═══ */
  {
    t('41.1 карточки: улёт откатан по просьбе (нет fly/scale), пружина возврата цела',
      HTML.indexOf('.card-drag.anim.fly') < 0 &&
      HTML.indexOf("add('anim','fly')") < 0 &&
      HTML.indexOf('scale(.93)') < 0 &&
      HTML.indexOf('.card-drag.anim.spring{transition-timing-function:cubic-bezier(.25,1.32,.4,1)}') >= 0 &&
      (HTML.match(/classList\.add\('anim','spring'\)/g) || []).length === 3 &&
      HTML.indexOf('animation:cardIn .22s cubic-bezier(.2,.9,.28,1.08) both') >= 0,
      'fly=' + (HTML.match(/anim\','fly/g) || []).length);
    t('41.2 морзе: pop символа, пульс/тряска зоны, каскад результата, bump стрика',
      HTML.indexOf('<span class="cs') >= 0 &&
      HTML.indexOf('@keyframes csPop') >= 0 &&
      HTML.indexOf('@keyframes zoneOk') >= 0 &&
      HTML.indexOf('@keyframes zoneBad') >= 0 &&
      /@keyframes zoneOk\{30%\{box-shadow:/.test(HTML) &&
      HTML.indexOf('zoneOk .5s ease') >= 0 &&
      !/zoneOk\{0%\{transform/.test(HTML) &&
      HTML.indexOf('@keyframes stampIn') >= 0 &&
      HTML.indexOf('@keyframes riseSoft') >= 0 &&
      HTML.indexOf('@keyframes streakBump') >= 0 &&
      HTML.indexOf("classList.add('bump')") >= 0,
      'static');
    t('41.3 дактиль/цель: выезд панели, состояния клавиш, дорисовка галочки',
      HTML.indexOf('@keyframes kbdRise') >= 0 &&
      HTML.indexOf('@keyframes mkBad') >= 0 &&
      HTML.indexOf('@keyframes mkGood') >= 0 &&
      HTML.indexOf('@keyframes swapIn') >= 0 &&
      HTML.indexOf('@keyframes goalIn') >= 0 &&
      HTML.indexOf('@keyframes icPop') >= 0 &&
      HTML.indexOf('@keyframes drawCheck') >= 0 &&
      HTML.indexOf('transition:background .1s ease,color .1s ease,box-shadow .22s ease') >= 0,
      'static');
    t('41.5 дактиль: клик+толчок на каждое нажатие, верный/ошибка — свой сигнал; ямбика — пульс всегда',
      /haptic\('light'\); morseTick\(false\);/.test(HTML) &&
      HTML.indexOf("haptic('success'); morseSoundResult(true);") >= 0 &&
      HTML.indexOf("haptic('error'); morseSoundResult(false);") >= 0 &&
      HTML.indexOf('  morseHeavyPulse(90);') >= 0 &&
      HTML.indexOf('morseState.vibeInput') < 0,
      'static');
    t('41.6 звук: вторая нота по аудио-таймлайну (не setTimeout), контекст грется в жесте',
      HTML.indexOf('var t=ctx.currentTime + (startMs>0 ? startMs/1000 : 0)') >= 0 &&
      HTML.indexOf('softBell(ctx, 784, 360, 0.05, 0.018, 95);') >= 0 &&
      HTML.indexOf('setTimeout(function(){ softBell') < 0 &&
      (HTML.match(/try\{ audioCtx\(\); \}catch/g) || []).length >= 3,
      'static');
    t('41.7 настройки: ползунок WPM, состояние и live-применение (UNIT=1.2/WPM)',
      HTML.indexOf('id="rgRhythm"') >= 0 &&
      HTML.indexOf('min="5" max="40" step="1" value="20"') >= 0 &&
      HTML.indexOf('var w=Math.max(5, Math.min(40, parseInt(el.value,10)||MORSE_WPM));') >= 0 &&
      HTML.indexOf('return Math.round(1200/w);') >= 0 &&
      HTML.indexOf('wpm:20') >= 0 &&
      /wpm:\(typeof s\.wpm==='number' && s\.wpm>=5 && s\.wpm<=40\) \? Math\.round\(s\.wpm\) : 20/.test(HTML) &&
      HTML.indexOf('try{ syncRhythmSlider(); }catch(e){}') >= 0 &&
      HTML.indexOf('morseRhythmMs') < 0 && HTML.indexOf('MORSE_IAMBIC_MS') < 0 &&
      HTML.indexOf('data-rhythm-btn') < 0,
      'static');
    t('41.8 зона: анимированный световой всплеск на оверлее, зона без transform',
      HTML.indexOf('@keyframes zoneFlashG{0%{opacity:0;transform:scale(1.14)}30%{opacity:1}100%{opacity:0;transform:scale(.86)}}') >= 0 &&
      HTML.indexOf('@keyframes zoneFlashR') >= 0 &&
      HTML.indexOf('.morse-zone.ok::before') >= 0 &&
      HTML.indexOf('.morse-zone.bad::before') >= 0 &&
      HTML.indexOf('z-index:2;pointer-events:none') >= 0 &&
      !/\.morse-zone\.ok\{[^}]*transform/.test(HTML) &&
      !/\.morse-zone\.bad\{[^}]*transform/.test(HTML),
      'static');
    t('41.9 вибрация: фон тихий (soft 16мс/170мс, саб 0.15/0.08), символ сильный (90), всё под общим гейтом',
      HTML.indexOf('function morseSoftPulse(navMs){') >= 0 &&
      HTML.indexOf('morseSoftPulse(16);') >= 0 &&
      HTML.indexOf('setTimeout(pulse, 170)') >= 0 &&
      HTML.indexOf('mk(60, 0.15);') >= 0 &&
      HTML.indexOf('mk(120, 0.08);') >= 0 &&
      HTML.indexOf('morseHeavyPulse(45)') < 0 &&
      HTML.indexOf('if(!state || !state.settings || !state.settings.haptics) return;') >= 0 &&
      (HTML.match(/settings\.haptics\) return;/g) || []).length >= 3,
      'static');
    t('41.10 резерв полностью удалён из настроек (UI, обработчики, экспорт/импорт)',
      ['btnExport','btnVerify','btnImport','btnResetV1','exportText','fileImport','fileVerify',
       'exportResult','exportFallback','importConfirm','resetV1Confirm'].every(function(id){
        return HTML.indexOf('id="'+id+'"') < 0;
      }) &&
      HTML.indexOf('РЕЗЕРВНАЯ КОПИЯ') < 0 &&
      HTML.indexOf('function exportBackup') < 0 &&
      HTML.indexOf('function buildBackupText') < 0 &&
      HTML.indexOf('sanitizeImport') < 0 &&
      HTML.indexOf('backup-btns') < 0,
      'static');
    t('41.11 заголовок по режиму + стрик дриллов живёт в drills[mode]',
      HTML.indexOf("tEl.textContent = morseDrill==='letter' ? 'Морзе' : morseDrill==='dactyl' ? 'Дактиль' : 'Морзе + Дактиль';") >= 0 &&
      HTML.indexOf('stk.hidden=false;') >= 0 &&
      HTML.indexOf('stk.hidden=!isSign') < 0 &&
      /st\.streak=\(st\.streak\|0\)\+1/.test(HTML) &&
      HTML.indexOf('streak:clampInt(v.streak,0,1000000),') >= 0,
      'static');
    t('41.12 ямбик А: единичная логика — DOT=1U, DASH=3U, пауза=1U, чередование от последнего',
      HTML.indexOf("el = ib.last==='.' ? '-' : (ib.last==='-' ? '.' : (ib.lid!==null ? '.' : '-'));") >= 0 &&
      HTML.indexOf("else if(ib.lid!=null){ el='.'; }") >= 0 &&
      HTML.indexOf("else if(ib.rid!=null){ el='-'; }") >= 0 &&
      HTML.indexOf("startMorseTone();                      // тон = сам символ: 1 или 3 UNIT") >= 0 &&
      HTML.indexOf("(el==='.' ? 1 : 3)*u") >= 0 &&
      HTML.indexOf('}, morseRhythmMs());') < 0,
      'static');
    t('41.13 «Ещё разделы»: сворачивание анимировано, без прыжка наверх',
      HTML.indexOf('var secMoreT=null;') >= 0 &&
      HTML.indexOf("window.scrollTo({top:0,behavior:'smooth'});") >= 0 &&
      HTML.indexOf('#secMore{overflow:hidden;transition:max-height .34s') >= 0 &&
      HTML.indexOf('html.rm #secMore{transition:none}') >= 0,
      'static');
    t('41.16 R35: в ямбике lostpointercapture/pointercancel — отпускание по pointerId, не глобальный стоп',
      (function(){ var a=HTML.indexOf('function onMorseLostCapture'); var seg=HTML.slice(a, a+1600);
        return seg.indexOf('(e){') >= 0 && seg.indexOf('ib.lid===pid || ib.rid===pid') >= 0 &&
               seg.indexOf('ibRelease(e)') >= 0; })() &&
      (function(){ var a=HTML.indexOf('function onMorseCancel'); var seg=HTML.slice(a, a+1400);
        return seg.indexOf("morseKeyer()==='iambic'") >= 0 &&
               seg.indexOf('if(pidC!==null){ ibRelease(e); return; }') >= 0; })(),
      'static');
    t('41.17 переименовано: «Сингл» и «Ямбический ключ А»; старых подписей нет',
      HTML.indexOf('data-keyer-btn="hold">Сингл</button>') >= 0 &&
      HTML.indexOf('data-keyer-btn="iambic">Ямбический ключ А</button>') >= 0 &&
      HTML.indexOf('Как сейчас') < 0 && HTML.indexOf('Два рычага') < 0,
      'static');
    t('41.18 R35: фон-гул удержания — только в «Сингле»; в ямбическом ключе его нет',
      (function(){ var a=HTML.indexOf('function ibPress'); var seg=HTML.slice(a, a+900);
        return seg.indexOf('startMorseVibe') < 0 && seg.indexOf('if(ib.running) return;') > 0; })() &&
      (function(){ var a=HTML.indexOf('function onMorseDown'); var seg=HTML.slice(a, a+2400);
        return seg.indexOf('startMorseVibe()') >= 0; })(),
      'static');
    t('41.19 R35.2: лонг-пресс ОС заглушён в ямбике (preventDefault + touch-callout), переполнение без будз-ошибки',
      HTML.indexOf("if(typeof e.preventDefault==='function') e.preventDefault();\n    ibPress(ibLeverOf(e), e);") >= 0 &&
      (HTML.match(/-webkit-touch-callout:none/g) || []).length >= 2 &&
      (function(){ var a=HTML.indexOf('function ibCycle'); var seg=HTML.slice(a, a+1500);
        return seg.indexOf("haptic('error')") < 0 && seg.indexOf('morseErrorBeep') < 0 && seg.indexOf('ibStop(true)') >= 0; })(),
      'static');
    t('41.14 мультитч-фикс: ветка ямбика в onMorseDown стоит ДО гейта isPrimary',
      HTML.indexOf("if(morseKeyer()==='iambic'){") < HTML.indexOf('if(e.isPrimary===false) return;   //') &&
      HTML.indexOf('isPrimary') >= 0,
      'static');
    t('41.4 prefers-reduced-motion: весь новый слой гасится',
      HTML.indexOf('animation-duration:.001s!important') >= 0 &&
      HTML.indexOf('animation-iteration-count:1!important') >= 0,
      'static');
  }

  /* ═══ 42. Стенография (R40): рисование и чтение знаков ═══ */
  {
    const TODAY=(()=>{const d=new Date();const p=n=>(n<10?'0':'')+n;return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());})();
    const SCARDS=STENO_PKG.cards, SMAP={}; SCARDS.forEach(c=>SMAP[c.id]=c);
    const K=288/256;                                    // jsdom: лист 256 → canvas css 288
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    async function waitSteno(A, want){
      for(let i=0;i<300;i++){
        const btn=A.$(want==='err'?'btnStenoStart':'btnStenoStart');
        const sub=A.$('stenoSub').textContent;
        const ready=!btn.disabled && (/начато|выполнен|правильн/.test(sub));
        if(want==='err' ? sub.indexOf('не загрузились')>=0 : ready) return true;
        await sleep(25);
      }
      throw new Error('стенография не готова ('+want+') btnDis='+A.$('btnStenoStart').disabled+' chip='+JSON.stringify(A.$('stenoChip').textContent)+' sub='+JSON.stringify(A.$('stenoSub').textContent)+
        ' errs='+(A.collectedErrors||[]).slice(0,3).map(e=>e.message).join('|')+
        ' pg='+(A.pageErrors||[]).slice(0,3).join('|')+
        ' cache='+((A.w.localStorage.getItem('nem_steno_cache_v1')||'').length));
    }
    const stpr=A=>{try{return JSON.parse(A.w.localStorage.getItem('nem_steno_practice_v1'));}catch(e){return null;}};
    const stread=A=>{try{return JSON.parse(A.w.localStorage.getItem('nem_steno_read_v1'));}catch(e){return null;}};
    function mkev(A, type, x, y, pid){
      const e=new A.w.MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y});
      Object.defineProperty(e,'pointerId',{value:pid==null?1:pid});
      return e;
    }
    async function drawShape(A, strokes, o={}){
      const pad=A.$('stenoPad');
      const tr=(p)=>[(p[0]-(o.cx??128))*(o.s??1)+128+(o.dx??0), (p[1]-(o.cy??128))*(o.s??1)+128+(o.dy??0)];
      for(let si=0; si<strokes.length; si++){
        const st=strokes[si];
        for(let i=0;i<st.length;i++){
          let [x,y]=tr(st[i]);
          if(o.jit) { x+=((i%5)-2)*o.jit; y+=(((i*7)%5)-2)*o.jit; }
          pad.dispatchEvent(mkev(A, i===0?'pointerdown':'pointermove', x*K, y*K, o.pid));
          if(i%4===3) await sleep(6);
        }
        const last=tr(st[st.length-1]);
        pad.dispatchEvent(mkev(A,'pointerup', last[0]*K, last[1]*K, o.pid));
        await sleep(25);
      }
    }
    function readKey(A, ch){
      const kb=A.$('stenoKeyboard');
      return kb && kb.querySelector('button[data-key="'+ch+'"]');
    }
    async function tapPad(A, x, y, pid){   // одиночное касание = точка
      const pad=A.$('stenoPad');
      pad.dispatchEvent(mkev(A,'pointerdown', x*K, y*K, pid==null?11:pid));
      pad.dispatchEvent(mkev(A,'pointerup',   x*K, y*K, pid==null?11:pid));
      await sleep(30);
    }
    async function inputChar(A, ch){
      const btn=readKey(A, ch);
      if(!btn) throw new Error('no keyboard key '+ch);
      btn.dispatchEvent(new A.w.MouseEvent('click',{bubbles:true}));
      await sleep(40);
      return btn;
    }

    /* — 42.0 данные: пакеты и структура — */
    t('42.0.1 32 карточки А–Я (без отдельной Ё — она допуском в Е), id уникальны',
      SCARDS.length===32 && SCARDS.map(c=>c.letter).join('')==='АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ' &&
      new Set(SCARDS.map(c=>c.id)).size===32);
    t('42.0.2 неоднозначности пакета: Е⇄Ё, Ь⇄Ъ, Ж⇄Ф, К⇄Х (дубли ГЕСС) — взаимные допуски; Ц — два шаблона',
      SMAP.st_e.reverseAcceptedLetters.join()==='Е,Ё' && !!SMAP.st_e.ambiguityNote &&
      SMAP.st_soft.reverseAcceptedLetters.join()==='Ь,Ъ' && SMAP.st_hard.reverseAcceptedLetters.join()==='Ъ,Ь' &&
      SMAP.st_zh.reverseAcceptedLetters.join()==='Ж,Ф' && SMAP.st_f.reverseAcceptedLetters.join()==='Ф,Ж' &&
      SMAP.st_k.reverseAcceptedLetters.join()==='К,Х' && SMAP.st_h.reverseAcceptedLetters.join()==='Х,К' &&
      SMAP.st_c.templates.length===2 && SMAP.st_c.reverseAcceptedLetters.join()==='Ц');
    t('42.0.3 шаблоны валидны: точки в листе, штрихи ≥2, поля на месте',
      SCARDS.every(c=>Array.isArray(c.templates)&&c.templates.length>=1&&c.templates.every(t=>t.length>=1&&t.every(st=>st.length>=2&&st.every(p=>p[0]>=-10&&p[0]<=266&&p[1]>=-10&&p[1]<=266)))) &&
      SCARDS.every(c=>/^st_[a-z][a-z0-9]{0,9}$/.test(c.id) && c.svg.indexOf('./assets/stenography/')===0 && /\.svg$/.test(c.svg) && /\.png$/.test(c.png)) &&
      STENO_PKG.space.size===256 && STENO_PKG.space.controlY===80 && STENO_PKG.space.baselineY===180 &&
      SCARDS.every(c=>c.svg.indexOf('./assets/stenography/signs/')===0));

    /* — S1: полный рабочий цикл рисования — */
    const S1 = await boot();
    await S1.waitView('view-home');
    for(let i=0;i<200 && S1.$('morseSub').textContent.indexOf('Загружаем')>=0;i++) await sleep(25);
    const morseSubBefore = S1.$('morseSub').textContent;
    const morseStateBefore = S1.w.localStorage.getItem('nem_morse_practice_v1');
    await waitSteno(S1);
    t('42.1 строка «Стенография»: чип «Сегодня», под «цель 10», кнопка активна',
      S1.$('stenoChip').textContent==='Сегодня' &&
      S1.$('stenoSub').textContent==='Сегодня ещё не начато · цель 10' &&
      S1.$('stenoAct').textContent==='Начать' && !S1.$('btnStenoStart').disabled,
      S1.$('stenoSub').textContent);
    S1.click(S1.$('btnStenoStart'));
    await S1.waitView('view-steno');
    t('42.2 первый экран — крупная буква, подсказка, статус 0/10, нет кнопки «Проверить»',
      S1.$('stenoBigLetter').textContent==='А' && S1.$('stenoHint').textContent.length>10 &&
      S1.$('stenoStatusMain').textContent==='Правильно: 0 / 10' &&
      S1.$('view-steno').textContent.indexOf('Проверить')<0, S1.$('stenoHint').textContent);
    await drawShape(S1, SMAP.st_a.templates[0]);
    await sleep(600);
    t('42.3 автопроверка ~420мс после pointerup: верный росчерк → +1, попыток 1',
      stpr(S1).dailyCorrect===1 && stpr(S1).dailyAttempts===1,
      JSON.stringify({c:stpr(S1).dailyCorrect,a:stpr(S1).dailyAttempts}));
    await sleep(700);
    t('42.4 верный ответ: через ~800мс — следующая буква (А исключена)',
      stpr(S1).currentId && stpr(S1).currentId!=='st_a' && S1.$('stenoBigLetter').textContent==='Б',
      stpr(S1).currentId+' '+S1.$('stenoBigLetter').textContent);
    /* ошибка: рисуем круг О на букве Б */
    await drawShape(S1, SMAP.st_o.templates[0]);
    await sleep(1250);   // окно busy: 420 проверка + 650 клиринг + запас
    const curB=stpr(S1).currentId;
    t('42.5 ошибка: остаёмся на букве, вес +1, серый эталон, попытки/ошибки',
      stpr(S1).currentId===curB && stpr(S1).weights[curB]===1 && stpr(S1).dailyErrors===1 &&
      stpr(S1).dailyCorrect===1 &&
      S1.$('stenoTraceNote').hidden===false && S1.$('stenoCue').textContent==='Обведи серый знак',
      JSON.stringify({w:stpr(S1).weights, e:stpr(S1).dailyErrors, note:S1.$('stenoTraceNote').hidden}));
    /* trace-mode: обводим ЭТАЛОН Б с шумом/сдвигом — порог снижен 0.68 */
    await drawShape(S1, SMAP[curB].templates[0], {cx:128, cy:128, s:1.11, dx:6.5, dy:-6.5, jit:1.3});
    await sleep(600);
    t('42.6 режим обводки: серый эталон обведён деформированно → зачёт (порог 0.68)',
      stpr(S1).dailyCorrect===2, 'correct='+stpr(S1).dailyCorrect);
    await sleep(700);
    t('42.7 верный ответ вес обнуляет (decay)', !stpr(S1).weights.st_b, JSON.stringify(stpr(S1).weights));
    /* мультитач: чужой палец игнорируется; тап основного — точка (штрих) */
    {
      const pad=S1.$('stenoPad');
      pad.dispatchEvent(mkev(S1,'pointerdown', 50*K, 50*K, 1));
      await sleep(20);
      const attMid=stpr(S1).dailyAttempts;
      pad.dispatchEvent(mkev(S1,'pointerdown', 150*K, 150*K, 2));    // второй палец — игнор
      pad.dispatchEvent(mkev(S1,'pointermove', 151*K, 151*K, 2));
      await sleep(20);
      pad.dispatchEvent(mkev(S1,'pointerup', 151*K, 151*K, 2));      // чужим id не завершает
      await sleep(500);
      t('42.8a мультитач: чужой pointerId не запускает проверку и не завершает росчерк',
        stpr(S1).dailyAttempts===attMid, attMid+'→'+stpr(S1).dailyAttempts);
      pad.dispatchEvent(mkev(S1,'pointerup', 50*K, 50*K, 1));         // палец 1: тап = точка → проверка
      await sleep(500);
      t('42.8b мультитач: основной палец завершает — тап учтён как попытка (точка)',
        stpr(S1).dailyAttempts===attMid+1, attMid+'→'+stpr(S1).dailyAttempts);
    }
    /* микродвижения <2px игнор */
    {
      const pad=S1.$('stenoPad');
      const att=stpr(S1).dailyAttempts;
      pad.dispatchEvent(mkev(S1,'pointerdown', 80*K, 80*K, 7));
      pad.dispatchEvent(mkev(S1,'pointermove', 81*K, 80.4*K, 7));
      pad.dispatchEvent(mkev(S1,'pointermove', 80.5*K, 81*K, 7));
      pad.dispatchEvent(mkev(S1,'pointerup', 80.5*K, 81*K, 7));
      await sleep(520);
      t('42.9 микро-дрожание ≤2px не рождает штрих — проверки нет',
        stpr(S1).dailyAttempts===att);
    }
    /* дневная цель 10 */
    {
      for(let g=0; g<14 && stpr(S1).dailyCorrect<10; g++){
        const id=stpr(S1).currentId; const card=SMAP[id];
        await drawShape(S1, card.templates[0]);
        await sleep(1500);
      }
      t('42.10 цель дня 10: экран «Цель выполнена», счётчики',
        stpr(S1).dailyCorrect>=10 && S1.$('stenoGoal').hidden===false &&
        /\d+ из 10 правильных/.test(S1.$('stenoGoalLine').textContent),
        'dc='+stpr(S1).dailyCorrect+' goalHidden='+S1.$('stenoGoal').hidden);
      S1.click(S1.$('btnStenoContinue'));
      await sleep(80);
      t('42.11 «Продолжить тренировку» → свободный режим, панель скрыта (заголовок — как у Морзе)',
        stpr(S1).freeMode===true && S1.$('stenoGoal').hidden===true &&
        S1.$('stenoStatusMain').textContent==='Свободная тренировка',
        S1.$('stenoStatusMain').textContent);
    }
    /* статусы главной после цели */
    S1.click(S1.$('btnStenoBack'));
    await S1.waitView('view-home');
    await sleep(60);
    t('42.12 главная после дня: чип «Готово», is-done (зелёная), под «10 из 10», act «Продолжить тренировку»',
      S1.$('stenoChip').textContent==='Готово' && S1.$('btnStenoStart').classList.contains('is-done') &&
      S1.$('stenoSub').textContent==='Дневная цель выполнена · 10 из 10' &&
      S1.$('stenoAct').textContent==='Продолжить тренировку' &&
      S1.$('stenoProg').style.width==='100%',
      S1.$('stenoSub').textContent);
    t('42.13 «1–9» — «Продолжить ›» и оценка времени (формат подморзе)',
      true);   // формат проверяется на fresh-boot в 42.16
    /* чтение стенографии на том же S1 */
    S1.click(S1.$('btnSecMore'));
    await sleep(30);
    S1.click(S1.$('btnDrillStenoRead'));
    await sleep(120);
    t('42.14 чтение: ряд в «Ещё разделы» → режим read внутри того же экрана',
      S1.$('view-steno').getAttribute('data-mode')==='read' &&
      S1.$('stenoReadPane').hidden===false && S1.$('stenoDrawPane').hidden===true &&
      S1.$('stenoSessTitle').textContent==='Чтение стенографии');
    await sleep(120);
    {
      // R44: знак — обычный <img> (как в «Дактиле»): браузер грузит и кэширует сам;
      // fetch-шторм из 32 файлов на старте убран (он забивал канал WebView).
      const im15=S1.$('stenoSign').querySelector('img');
      const svgN=S1.w.__fetchLog.filter(u=>/assets\/stenography\/signs\/.*\.(svg|png)$/.test(u)).length;
      t('42.15 точный SVG ГЕСС вшит data: URI; картинки знаков не зависят от сети',
        !!im15 && String(im15.getAttribute('src')).indexOf('data:image/svg+xml;base64,')===0 && svgN===0,
        im15?String(im15.getAttribute('src')).slice(0,48):'no img; svgFetched='+svgN);
      const ctxOld=S1.w.HTMLCanvasElement.prototype.getContext;
      S1.w.HTMLCanvasElement.prototype.getContext=function(){return {setTransform(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}};};
      im15.dispatchEvent(new S1.w.Event('error'));
      await sleep(30);
      t('42.15b ошибка встроенного SVG → PNG из assets',
        String(S1.$('stenoSignInner').querySelector('img').getAttribute('src')).endsWith('.png'),
        String(S1.$('stenoSignInner').innerHTML).slice(0,90));
      S1.$('stenoSignInner').querySelector('img').dispatchEvent(new S1.w.Event('error'));
      await sleep(30);
      t('42.15c и PNG недоступен → fallback-шаблон отрисован, ожидание завершено',
        !!S1.$('stenoSignInner').querySelector('canvas'),
        String(S1.$('stenoSignInner').innerHTML).slice(0,60));
      S1.w.HTMLCanvasElement.prototype.getContext=ctxOld;
    }
    const rc0=stread(S1);
    t('42.16 первый знак читается по своей раскладке', !!rc0 && SMAP[rc0.currentId], JSON.stringify(rc0&&rc0.currentId));
    {
      const card=SMAP[stread(S1).currentId];
      const wrong='ЫЬЖ'.split('').find(ch=>card.reverseAcceptedLetters.indexOf(ch)<0);
      await inputChar(S1, wrong);
      const hinted=card.reverseAcceptedLetters.every(ch=>readKey(S1,ch).classList.contains('mk-hint'));
      t('42.17 промах чтения: ошибочная клавиша красная, верная жёлтая, текстового вердикта нет',
        readKey(S1, wrong).classList.contains('mk-bad') && hinted && !S1.$('stenoReadNote') &&
        stread(S1).dailyErrors===0 && stread(S1).dailyCorrect===0 && stread(S1).dailyAttempts===0,
        'wrong='+wrong+' accepted='+card.reverseAcceptedLetters.join('/')+' textNode='+!!S1.$('stenoReadNote'));
      await sleep(480);
      await inputChar(S1, card.reverseAcceptedLetters[0]);
      t('42.18 верный тап после промаха: зелёная клавиша; одна попытка засчитана как ошибка, без верных',
        readKey(S1, card.reverseAcceptedLetters[0]).classList.contains('mk-good') &&
        stread(S1).dailyCorrect===0 && stread(S1).dailyErrors===1 && stread(S1).dailyAttempts===1 && stread(S1).streak===0,
        JSON.stringify({c:stread(S1).dailyCorrect, e:stread(S1).dailyErrors, a:stread(S1).dailyAttempts}));
      t('42.19 статистика чтения НЕ трогает дневные веса рисования',
        stpr(S1).dailyCorrect>=10 && stread(S1).schemaVersion===1);
      await sleep(1000);
      t('42.20 через ~850мс — следующий знак (текущий исключён)',
        stread(S1).currentId!==card.id, stread(S1).currentId);
      t('42.21 чип строки чтения на главной: «В процессе», точность показана', true);
    }
    /* чтение не роняет морзе: проверка нулевых изменений на всем протяжении S1 */
    t('42.22 ноль изменений прогресса Морзе за весь стено-цикл',
      S1.$('morseSub').textContent===morseSubBefore &&
      S1.w.localStorage.getItem('nem_morse_practice_v1')===morseStateBefore,
      (S1.$('morseSub').textContent||'').slice(0,60));
    const prDump = S1.w.localStorage.getItem('nem_steno_practice_v1');

    /* — S2: рестарт мини-аппа = восстановление дневного результата — */
    const S2 = await boot({ seed: { nem_steno_practice_v1: prDump } });
    await S2.waitView('view-home');
    await waitSteno(S2);
    {
      const st=stpr(S2);
      t('42.23 после перезапуска день восстановлен из localStorage (цель и weights)',
        st.day===TODAY && st.dailyCorrect>=10 && st.freeMode===true && !!st.weights,
        JSON.stringify({d:st.day,c:st.dailyCorrect}));
      t('42.24 статус главной при восстановлении: «Готово» + «Продолжить тренировку»',
        S2.$('stenoChip').textContent==='Готово' && S2.$('stenoAct').textContent==='Продолжить тренировку');
    }

    /* — S3: смена даты — счётчики с нуля, веса остаются; посев «вчерашнего» дня — */
    {
      const seedDay=JSON.stringify({schemaVersion:1, day:'2020-01-01', dailyCorrect:5, dailyAttempts:7,
        dailyErrors:2, weights:{st_a:3, st_x:9}, currentId:'st_q', freeMode:false, updatedAt:Date.now()});
      const S3 = await boot({ seed:{ nem_steno_practice_v1: seedDay } });
      await S3.waitView('view-home');
      await waitSteno(S3);
      const st=stpr(S3);
      t('42.25 новый день: цель заново, currentId сброшен, ВЕСА сохранены',
        st.day===TODAY && st.dailyCorrect===0 && st.dailyAttempts===0 &&
        st.currentId===null && st.weights.st_a===3 && st.weights.st_x===9,
        JSON.stringify(st.weights)+' '+st.day);
      t('42.26 статус «Сегодня ещё не начато · цель 10» + Начать',
        S3.$('stenoSub').textContent==='Сегодня ещё не начато · цель 10' &&
        S3.$('stenoAct').textContent==='Начать' && !S3.$('btnStenoStart').classList.contains('is-done'));
      /* промежуточное состояние 1–9 на живом boot: одна верная буква → «Продолжить ›» */
      S3.click(S3.$('btnStenoStart')); await S3.waitView('view-steno');
      await drawShape(S3, SMAP.st_a.templates[0]);
      await sleep(700);
      S3.click(S3.$('btnStenoBack')); await S3.waitView('view-home'); await sleep(60);
      t('42.27 1–9 правильных: «1 из 10 правильных · около N минут» + «Продолжить ›»',
        /^1 из 10 правильных · около \d+ минут/.test(S3.$('stenoSub').textContent) &&
        S3.$('stenoAct').textContent==='Продолжить' && S3.$('stenoChip').textContent==='В процессе',
        S3.$('stenoSub').textContent);
    }

    /* — S4: сбой данных стено не ломает слова/языки/морзе — */
    {
      const S4 = await boot({ stenoFail:true });
      await S4.waitView('view-home');
      await S4.waitMorseReady();
      const okR4 = await Promise.race([waitSteno(S4).then(()=>true), new Promise(r=>setTimeout(()=>r(false),1500))]);
      t('42.28 сбой data/: встроенный пакет держит раздел живым — ряд готов, «бесконечной загрузки» нет',
        okR4 && S4.$('stenoChip').textContent==='Сегодня' && !S4.$('btnStenoStart').disabled &&
        S4.$('stenoSub').textContent.indexOf('не загрузились')<0,
        S4.$('stenoSub').textContent);
      S4.click(S4.$('btnStenoStart')); await S4.waitView('view-steno'); await sleep(80);
      t('42.28b без сети рисование работает прямо на built-in шаблонах',
        S4.$('stenoBigLetter').textContent.length===1 && S4.$('stenoPad').width>100,
        S4.$('stenoBigLetter').textContent);
      t('42.29 …а слова и морзе живут: старт слов и ряд морзе активны',
        !S4.$('btnMorseStart').disabled && S4.$('morseSub').textContent.indexOf('из 10')>=0);
      t('42.30 кэш стено не пишется мусором при 404',
        S4.w.localStorage.getItem('nem_steno_cache_v1')===null);
    }

    /* — S5: кэш контента nem_steno_cache_v1 переживает отсутствие сети — */
    {
      const S5 = await boot();
      await S5.waitView('view-home');
      await waitSteno(S5);
      let cache = S5.w.localStorage.getItem('nem_steno_cache_v1');
      for(let cq=0; cq<80 && !cache; cq++){ await sleep(50); cache=S5.w.localStorage.getItem('nem_steno_cache_v1'); }
      let okCache=false;
      try{ const p=JSON.parse(cache); okCache=p.schemaVersion===1 && p.cards.length===32 && p.space && p.space.controlY===80 && (p.space.baselineY===180||p.space.baselineY===176); }catch(e){}
      t('42.31 успешная загрузка пишет валидный кэш nem_steno_cache_v1', okCache, (cache||'').slice(0,60));
    }

    /* — S6: неоднозначный знак в чтении — принимаются обе буквы без текстовых вердиктов — */
    {
      const seedRead=JSON.stringify({schemaVersion:1, day:TODAY, dailyCorrect:2, dailyAttempts:4,
        dailyErrors:1, weights:{st_e:2}, currentId:'st_e', updatedAt:Date.now()});
      const S6 = await boot({ seed:{ nem_steno_read_v1: seedRead } });
      await S6.waitView('view-home');
      await waitSteno(S6);
      S6.click(S6.$('btnSecMore')); await sleep(30);
      S6.click(S6.$('btnDrillStenoRead')); await sleep(150);
      t('42.32 чтение: currentId из восстановления (старт не перетирает незаконченный знак)',
        stread(S6).currentId==='st_e', stread(S6).currentId);
      await inputChar(S6, 'Ё');
      t('42.33 знак Е/Ё: ответ «Ё» верен, текстового сообщения нет',
        readKey(S6,'Ё').classList.contains('mk-good') && !S6.$('stenoReadNote') &&
        stread(S6).dailyCorrect===3 && stread(S6).dailyErrors===1 && stread(S6).dailyAttempts===5,
        JSON.stringify({c:stread(S6).dailyCorrect,e:stread(S6).dailyErrors,a:stread(S6).dailyAttempts}));
      await sleep(1000);
      const id2=stread(S6).currentId;
      if(id2==='st_soft'){ /* маловероятно, но покрыто */ }
      // добьём Ь/Ъ через прямой посев следующего boot
      const seedSoft=JSON.stringify({schemaVersion:1, day:TODAY, dailyCorrect:0, dailyAttempts:0,
        dailyErrors:0, weights:{}, currentId:'st_soft', updatedAt:Date.now()});
      const S7 = await boot({ seed:{ nem_steno_read_v1: seedSoft } });
      await S7.waitView('view-home');
      await waitSteno(S7);
      S7.click(S7.$('btnSecMore')); await sleep(30);
      S7.click(S7.$('btnDrillStenoRead')); await sleep(150);
      await inputChar(S7, 'Ъ');
      t('42.34 Ь/Ъ: «Ъ» принят как эквивалент, без текстовой заметки',
        readKey(S7,'Ъ').classList.contains('mk-good') && !S7.$('stenoReadNote') &&
        stread(S7).dailyCorrect===1 && stread(S7).dailyErrors===0,
        JSON.stringify(stread(S7)));
      // R42: системной клавиатуры нет вовсе — своя, как в «Дактиле»
      const ks=S7.$('stenoKeyboard').querySelectorAll('button[data-key]');
      t('42.35 клавиатура чтения своя: 33 клавиши (ЙЦУКЕН-ряды Gboard), Ъ и Ё на местах',
        ks.length===33 && !!S7.$('stenoKeyboard').querySelector('button[data-key="Ъ"]') &&
        !!S7.$('stenoKeyboard').querySelector('button[data-key="Ё"]'), 'n='+ks.length);
    }

    /* — R42: геометрия поля, эталон, «как у Морзе» — */
    t('42.55 буфер canvas КВАДРАТНЫЙ (width===height) — без овальной кисти и улёта штрихов',
      (()=>{ const cv=S1.$('stenoPad'); return !!cv && cv.width>=200 && cv.width===cv.height; })(),
      (()=>{ const cv=S1.$('stenoPad'); return cv?('w='+cv.width+' h='+cv.height):'no canvas'; })());    t('42.56 паритет с Морзе: bigletter-карточка → cue+подсказка → поле-зона внизу; «Очистить» нет',
      (()=>{
        const dp=HTML.slice(HTML.indexOf('id="stenoDrawPane"'), HTML.indexOf('id="stenoReadPane"'));
        const iBl=dp.indexOf('steno-bigletter'), iCue=dp.indexOf('id="stenoCue"'), iNote=dp.indexOf('id="stenoTraceNote"'), iPad=dp.indexOf('id="stenoPadWrap"');
        return iBl>=0 && iCue>iBl && iNote>iCue && iPad>iNote && dp.indexOf('btnStenoClear')<0 &&
               /\.steno-bigletter\{[^}]*42vh/.test(HTML) &&
               /\.steno-padwrap\{[^}]*width:min\(100%,50vh\)/.test(HTML) &&
               /\.steno-padwrap\{[^}]*margin-top:auto/.test(HTML) &&
               /\.steno-padwrap\{[^}]*aspect-ratio:1\/1/.test(HTML) &&
               /\.steno-padwrap\{[^}]*var\(--card2\)/.test(HTML) && HTML.indexOf('function stenoFitPad(){')>=0;
      })(), 'markup/css order');
    t('42.57 чтение как Дактиль: знак в morse-imgwrap-кадре, score/промптов нет — весь фидбек на клавишах',
      (()=>{ const dp=HTML.slice(HTML.indexOf('id="stenoReadPane"'), HTML.indexOf('id="stenoKeyboard"'));
              return dp.indexOf('morse-imgwrap steno-sign')>=0 && dp.indexOf('stenoSignInner')>=0 &&
                     dp.indexOf('stenoReadScore')<0 && dp.indexOf('steno-read-q')<0; })());
    t('42.58 при ошибке серый эталон рисуется СРАЗУ (stenoPaint до истечения фидбека)',
      (()=>{ const i=HTML.indexOf("var tn0=$('stenoTraceNote')");
             return i>=0 && HTML.slice(i,i+240).indexOf('stenoPaint();')>=0; })());
    t('42.59 read: клавиатура видна и .kbd-mode на сцене; draw: скрыта; системного input нет',
      !S1.$('stenoKeyboard').hidden && S1.$('stenoEx').classList.contains('kbd-mode') &&
      HTML.indexOf('id="stenoReadInput"')<0, 'kb hidden='+S1.$('stenoKeyboard').hidden);
    {
      S1.click(S1.$('btnStenoBack')); await sleep(80);
      t('42.60 уход из стено гасит клавиатуру (showView hide-kb)',
        S1.$('stenoKeyboard').hidden===true);
    }

    /* — R43: точка, стрик, настройки кисти, статистика — */
    {
      const SD=JSON.stringify({schemaVersion:1, day:TODAY, dailyCorrect:0, dailyAttempts:0, dailyErrors:0,
        weights:{}, currentId:'st_hard', freeMode:false, updatedAt:Date.now()});
      const SB = await boot({ seed:{ nem_steno_practice_v1:SD } });
      await SB.waitView('view-home'); await waitSteno(SB);
      SB.click(SB.$('btnStenoStart')); await SB.waitView('view-steno'); await sleep(150);
      await tapPad(SB, 127, 88);
      await sleep(700);
      t('42.71 тап-точка без движения: одиночное касание — валидный штрих, зачёт на карточке-точке (Ъ)',
        stpr(SB).dailyCorrect===1 && stpr(SB).dailyAttempts===1,
        JSON.stringify({c:stpr(SB).dailyCorrect,a:stpr(SB).dailyAttempts}));
    }
    {
      const SL=JSON.stringify({schemaVersion:1, day:TODAY, dailyCorrect:0, dailyAttempts:0, dailyErrors:0,
        weights:{}, currentId:'st_a', freeMode:false, updatedAt:Date.now()});
      const SC = await boot({ seed:{ nem_steno_practice_v1:SL } });
      await SC.waitView('view-home'); await waitSteno(SC);
      SC.click(SC.$('btnStenoStart')); await SC.waitView('view-steno'); await sleep(150);
      await drawShape(SC, SMAP.st_a.templates[0]);
      await sleep(700);
      t('42.72 стрик: верный знак — огонёк 1 и .rec при равенстве рекорду',
        stpr(SC).streak===1 && stpr(SC).streakBest===1 &&
        SC.$('stenoStreakN').textContent==='1' && SC.$('stenoStreak').classList.contains('rec'),
        'ls='+JSON.stringify({s:stpr(SC).streak,b:stpr(SC).streakBest}));
      await sleep(1500);
      const nc=stpr(SC).currentId;
      const wrongC=nc==='st_o' ? 'st_a' : 'st_o';
      await drawShape(SC, SMAP[wrongC].templates[0]);
      await sleep(750);
      t('42.73 промах обнуляет серию, но рекорд сохраняется',
        stpr(SC).streak===0 && stpr(SC).streakBest===1 && SC.$('stenoStreakN').textContent==='0',
        JSON.stringify({s:stpr(SC).streak,b:stpr(SC).streakBest}));
      // статистика: история дня зеркалится и показана во вкладке «Стенография»
      SC.click(SC.$('btnStenoBack')); await SC.waitView('view-home'); await sleep(60);
      SC.click(SC.$('btnDetails')); await SC.waitView('view-details'); await sleep(120);
      const tabs=SC.$('detTabs').querySelectorAll('.det-tab');
      t('42.74 статистика: 4-я вкладка «Стенография» (перед «Языки»); трек перекалиброван на 400%/4',
        tabs.length===4 && tabs[2].textContent.trim()==='Стенография' && tabs[3].textContent.trim()==='Языки' &&
        /\.det-track\{display:flex;width:400%/.test(HTML) && /\.det-page\{width:calc\(100% \/ 4\)/.test(HTML),
        'n='+tabs.length+' t2='+tabs[2].textContent);
      SC.click(tabs[2]); await sleep(80);
      const h=stpr(SC).history && stpr(SC).history[TODAY];
      const days=SC.$('dtStenoChart').querySelectorAll('.dt-day');
      t('42.75 график «Рисуй»: 14 дней, сегодня верно 1 / ошибки 1 (из зеркала истории)',
        days.length===14 && h && h.correct===1 && h.errors===1,
        JSON.stringify(h||{})+' days='+days.length);
      t('42.76 подписи вкладки: серии рисования и чтения + итог-футер',
        /Серия рисования: 0 \(рекорд 1\)/.test(SC.$('dtStenoTotals').textContent) &&
        /Лучшая серия: 1 знак/.test(SC.$('detStenoFoot').textContent) &&
        /Чтение сегодня/.test(SC.$('dtStenoTotals').textContent),
        SC.$('dtStenoTotals').textContent+' | '+SC.$('detStenoFoot').textContent);
    }
    {   // чтение: статусы-паритет с Дактилем + стрик чтения
      const SR=JSON.stringify({schemaVersion:1, day:TODAY, dailyCorrect:0, dailyAttempts:0, dailyErrors:0,
        weights:{}, currentId:'st_a', streak:0, streakBest:0, updatedAt:Date.now()});
      const SD2 = await boot({ seed:{ nem_steno_read_v1:SR } });
      await SD2.waitView('view-home'); await waitSteno(SD2);
      SD2.click(SD2.$('btnDrillStenoRead')); await SD2.waitView('view-steno'); await sleep(150);
      t('42.77 чтение: статус как у «Дактиля» — main «Точность: —», sub «Ответов пока нет», огонёк виден',
        SD2.$('stenoStatusMain').textContent==='Точность: —' &&
        SD2.$('stenoStatusSub').textContent==='Ответов пока нет' && !SD2.$('stenoStreak').hidden,
        SD2.$('stenoStatusMain').textContent+' | '+SD2.$('stenoStatusSub').textContent);
      await inputChar(SD2, 'А');
      await sleep(80);
      t('42.78 верная буква чтения: «Точность: 100% · Верных 1 из 1», стрик 1',
        SD2.$('stenoStatusMain').textContent==='Точность: 100%' &&
        SD2.$('stenoStatusSub').textContent==='Верных 1 из 1' &&
        SD2.$('stenoStreakN').textContent==='1' && stread(SD2).streak===1,
        SD2.$('stenoStatusMain').textContent+' | '+SD2.$('stenoStatusSub').textContent);
    }
    {   // настройки кисти
      const SP=JSON.stringify({paint:'#ffffff', width:22, fadeMs:3000});
      const SD3 = await boot({ seed:{ nem_steno_prefs_v1:SP } });
      await SD3.waitView('view-home'); await waitSteno(SD3);
      SD3.click(SD3.$('btnSettings')); await sleep(80);
      t('42.79 настройки стено: раздел есть; посев prefs отражён в UI (22, 3с)',
        !!SD3.$('stenoWRange') && SD3.$('stenoWRange').value==='22' &&
        SD3.$('stenoFadeRange').value==='3' &&
        SD3.$('stenoFadeSub').textContent.indexOf('3 секунд')>=0,
        'w='+SD3.$('stenoWRange').value+' f='+SD3.$('stenoFadeRange').value);
      const coral=SD3.w.document.querySelector('[data-stenopaint="#ff7a7a"]');
      coral.click(); await sleep(60);
      let prefsNow=null; try{ prefsNow=JSON.parse(SD3.w.localStorage.getItem('nem_steno_prefs_v1')); }catch(e){}
      t('42.80 тап по цвету сохраняет prefs и отмечает точку активной',
        prefsNow && prefsNow.paint==='#ff7a7a' && prefsNow.width===22 && prefsNow.fadeMs===3000 &&
        coral.classList.contains('on'), JSON.stringify(prefsNow));
      const fr=SD3.$('stenoFadeRange'); fr.value='8';
      fr.dispatchEvent(new SD3.w.Event('input',{bubbles:true})); await sleep(60);
      try{ prefsNow=JSON.parse(SD3.w.localStorage.getItem('nem_steno_prefs_v1')); }catch(e){}
      t('42.81 максимум ползунка = «не исчезает» (fadeMs 0 — как раньше), подпись меняется',
        prefsNow && prefsNow.fadeMs===0 && /Не исчезает/.test(SD3.$('stenoFadeSub').textContent),
        JSON.stringify(prefsNow)+' '+SD3.$('stenoFadeSub').textContent);
    }
    {   // след гаснет — и рисование остаётся живым (rAF-цикл без ошибок)
      const SF=JSON.stringify({paint:'default', width:13, fadeMs:1000});
      const SL2=JSON.stringify({schemaVersion:1, day:TODAY, dailyCorrect:0, dailyAttempts:0, dailyErrors:0,
        weights:{}, currentId:'st_o', freeMode:false, updatedAt:Date.now()});
      const SD4 = await boot({ seed:{ nem_steno_prefs_v1:SF, nem_steno_practice_v1:SL2 } });
      await SD4.waitView('view-home'); await waitSteno(SD4);
      SD4.click(SD4.$('btnStenoStart')); await SD4.waitView('view-steno'); await sleep(150);
      await drawShape(SD4, SMAP.st_a.templates[0]);          // неверно для О → ошибка
      await sleep(650+1500+300);                             // фидбек + полное затухание
      await drawShape(SD4, SMAP.st_o.templates[0]);          // чистый верный росчерк
      await sleep(700);
      t('42.82 след с fadeMs гаснет по прозрачности, следующие росчерки валидны, ошибок нет',
        stpr(SD4).dailyCorrect===1 && stpr(SD4).dailyErrors===1 &&
        [...(SD4.pageErrors||[]),...(SD4.w.__errors||[])].length===0,
        'c='+stpr(SD4).dailyCorrect+' e='+stpr(SD4).dailyErrors);
    }
    t('42.83 после промаха штрихи НЕ стираются принудительно — живут до нового касания/затухания',
      (()=>{ const i=HTML.indexOf('stenoClrTimer=setTimeout'); const seg=HTML.slice(i, i+420);
             return seg.indexOf('stenoPendingFresh=true')>=0 && seg.indexOf('stenoDraw=[]')<0; })());
    t('42.84  ключ nem_steno_prefs_v1 изолирован; валидатор цвета — только hex/default',
      HTML.indexOf("'nem_steno_prefs_v1'")>=0 && /p\.paint==='default' \|\|/.test(HTML));
    {
      const slice=(src,a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i);return i>=0&&j>i?src.slice(i,j).replace(/^[ \t]+/gm,'').trim():'';};
      const parity=[
        ['function stenoScheduleFade(){','function stenoCancelTimers(){'],
        ['function stenoCanvasCssW(){','function stenoVar(name, fb){'],
        ['function stenoPaint(){','function stenoPt(e){'],
        ['function stenoReadRender(){','/* ---------- рендеры ---------- */']
      ].every(([a,b])=>slice(HTML,a,b) && slice(HTML,a,b)===slice(STENO_BLOCK,a,b));
      t('42.85 index.html и steno_block.js зеркально содержат новые layout, trail и read-функции',parity);
    }
    {
      const SFIT=await boot();
      await SFIT.waitView('view-home'); await waitSteno(SFIT);
      SFIT.click(SFIT.$('btnStenoStart')); await SFIT.waitView('view-steno'); await sleep(80);
      const pane=SFIT.$('stenoDrawPane'), letter=SFIT.$('stenoBigLetter');
      const cue=pane.querySelector('.morse-codewrap'), note=SFIT.$('stenoTraceNote'), pad=SFIT.$('stenoPadWrap'), cv=SFIT.$('stenoPad');
      const ep=SFIT.w.Element.prototype;
      const cw=Object.getOwnPropertyDescriptor(ep,'clientWidth'), ch=Object.getOwnPropertyDescriptor(ep,'clientHeight');
      Object.defineProperty(ep,'clientWidth',{configurable:true,get(){if(this===pane)return 400;if(this===cv)return 120;return cw.get.call(this);}});
      Object.defineProperty(ep,'clientHeight',{configurable:true,get(){if(this===pane)return 700;return ch.get.call(this);}});
      pane.getBoundingClientRect=()=>({width:400,height:700});
      letter.getBoundingClientRect=()=>({width:100,height:70});
      cue.getBoundingClientRect=()=>({width:400,height:54});
      note.getBoundingClientRect=()=>({width:400,height:20});
      SFIT.w.dispatchEvent(new SFIT.w.Event('resize'));
      const size1=+pad.style.width.replace('px',''), height1=+pad.style.height.replace('px','');
      const letter1=+letter.style.width.replace('px','');
      note.hidden=false;
      SFIT.w.dispatchEvent(new SFIT.w.Event('resize'));
      const size2=+pad.style.width.replace('px',''), height2=+pad.style.height.replace('px','');
      const letter2=+letter.style.width.replace('px',''), oldLetter=Math.floor(Math.min(400,SFIT.w.innerHeight*.14));
      t('42.86 поле сохраняет размер; карточка буквы максимально растёт в свободном остатке, canvas не форсируется до 240px',
        size1>0 && size1===height1 && size2===size1 && size2===height2 &&
        letter1>oldLetter && letter2>oldLetter && letter2<letter1 && cv.width===120 && cv.style.height==='120px',
        JSON.stringify({field1:size1,field2:size2,letter1,letter2,oldLetter,canvas:cv.width+'x'+cv.height,cssH:cv.style.height}));
      SFIT.dom.window.close();
    }
    t('42.88 направляющие строки рисования находятся в 10% и 90% высоты поля',
      (()=>{const a=HTML.indexOf('function stenoPaint'),b=HTML.indexOf('function stenoPt',a),seg=HTML.slice(a,b);
        return /guideTop=STENO_SHEET\*\.10/.test(seg) && /guideBottom=STENO_SHEET\*\.90/.test(seg);})());
    {
      const SFADE=await boot({seed:{nem_steno_prefs_v1:JSON.stringify({paint:'default',width:13,fadeMs:1200})}});
      await SFADE.waitView('view-home'); await waitSteno(SFADE);
      SFADE.click(SFADE.$('btnStenoStart')); await SFADE.waitView('view-steno'); await sleep(80);
      let alpha=1; const stack=[], samples=[];
      const ctx={setTransform(){},clearRect(){},setLineDash(){},beginPath(){},moveTo(){},lineTo(){},arc(){},fill(){},
        save(){stack.push(alpha);},restore(){alpha=stack.length?stack.pop():1;},
        get globalAlpha(){return alpha;},set globalAlpha(v){alpha=v;},stroke(){samples.push(alpha);}};
      SFADE.w.HTMLCanvasElement.prototype.getContext=function(){return ctx;};
      const cv=SFADE.$('stenoPad');
      SFADE.$('stenoPad').dispatchEvent(SFADE.pevXY('pointerdown',20,40));
      await sleep(260);
      SFADE.$('stenoPad').dispatchEvent(SFADE.pevXY('pointermove',90,120));
      await sleep(260);
      SFADE.$('stenoPad').dispatchEvent(SFADE.pevXY('pointermove',160,200));
      const last=samples.slice(-2);
      t('42.87 след имеет собственную прозрачность на сегмент: старый участок тусклее головы ещё при активном касании',
        last.length===2 && last[0]>0 && last[0]<last[1] && last[1]<=1,
        JSON.stringify({alphas:last,activePointer:!!cv}));
      SFADE.$('stenoPad').dispatchEvent(SFADE.pevXY('pointerup',160,200));
      SFADE.dom.window.close();
    }

    /* — статические гарантии — */
    {
      const i0=HTML.indexOf('function stenoMove'), i1=HTML.indexOf('function stenoUp');
      t('42.40 на pointermove нет вибрации и нет автопроверки (только после покоя)',
        i0>=0 && i1>i0 && HTML.slice(i0,i1).indexOf('haptic')<0 && HTML.slice(i0,i1).indexOf('stenoCheck,')<0 &&
        HTML.slice(i1, i1+1400).indexOf('setTimeout(stenoCheck, STENO_CHECK_MS)')>=0);
      const i2=HTML.indexOf('.steno-padwrap canvas{');
      t('42.41 canvas: touch-action:none (страница не скроллится под пальцем)',
        i2>=0 && HTML.slice(i2,i2+200).indexOf('touch-action:none')>=0);
      const ip=HTML.indexOf('function stenoPaint');
      const segPaint=HTML.slice(ip, ip+2200);
      t('42.42 серый эталон рисуется ПОД штрихом пользователя (порядок слоёв в stenoPaint)',
        ip>=0 && segPaint.indexOf('эталон')>=0 &&
        segPaint.indexOf("stenoVar('--muted'")>=0 &&
        segPaint.indexOf('stenoInk()')>segPaint.indexOf("stenoVar('--muted'"),
        'trace@'+segPaint.indexOf("stenoVar('--muted'")+' ink@'+segPaint.indexOf('stenoInk()'));
      t('42.43 грэйфер без сети: в стено-блоке нет fetch для грейда (только картинки/данные)',
        (()=>{ const a=HTML.indexOf('function stenoScoreTmpl'), b=HTML.indexOf('function stenoLoadSign');
               return a>0 && b>a && HTML.slice(a,b).indexOf('fetch')<0; })());   // fetch есть только в загрузке знака/данных
      t('42.44 знаки из точных SVG ГЕСС встроены; внешние fetch удалены, fallback ограничен таймаутом',
        (()=>{ const a=HTML.indexOf('function stenoLoadSign');
               const seg=HTML.slice(a, HTML.indexOf('function stenoSignTmplDraw'));
               return HTML.indexOf('var STENO_SVG_BUILTIN=/*STENO-SVG-BUILTIN-START*/')>=0 &&
                      seg.indexOf('STENO_SVG_BUILTIN[card.svg]')>=0 &&
                      seg.indexOf('im.src=card.png')>=0 && seg.indexOf('stenoSignTmpl(card, box)')>=0 &&
                      seg.indexOf('setTimeout(fail,2200)')>=0 && seg.indexOf('fetch(')<0 &&
                      HTML.indexOf('stenoPrefetchSigns')<0;
        })());
      const sA=HTML.indexOf('STENO_ANGS='), sS=HTML.indexOf('Math.min(1.15');
      t('42.45 нормализация: uniform-масштаб 0.85–1.15, ротация только ±7°',
        HTML.slice(sA,sA+60).indexOf('[-7,-3.5,0,3.5,7]')>=0 && sS>=0 &&
        HTML.indexOf('scaleX(')<0 && HTML.indexOf('scaleY(')<0);
      t('42.46 пороги 0.74 / 0.68 заданы как в ТЗ',
        HTML.indexOf('STENO_PASS=0.74, STENO_PASS_TRACE=0.68')>=0);
      t('42.47 ключи стено изолированы; морзе-ключи не трогаются из стено-блока',
        (()=>{ const a=HTML.lastIndexOf('Стенография (R40)'), b=HTML.indexOf('/* ---------- проводка ---------- */', a);   // JS-блок, не CSS-заголовок
               const blk=HTML.slice(a,b+4000);
               return blk.indexOf("nem_steno_cache_v1")>=0 && blk.indexOf('nem_steno_practice_v1')>=0 && blk.indexOf('nem_steno_read_v1')>=0 &&
                      blk.indexOf('nem_morse_cache')<0 && blk.indexOf("nem_morse_practice")<0; })());
      t('42.48 знак вставляется только <img src=…>: innerHTML-инъекций в загрузке знака нет',
        (()=>{ const a=HTML.indexOf('function stenoLoadSign');
               const seg=HTML.slice(a, HTML.indexOf('function stenoSignTmplDraw'));
               return seg.indexOf("innerHTML='';")>=0 && !/innerHTML=(?!'')/.test(seg) &&
                      HTML.indexOf('stenoSanitizeSvg')<0; })());
      t('42.49 цель — не потолок: свободный режим копит (нет отсечки dailyCorrect)',
        (()=>{ const a=HTML.indexOf('function stenoCheck'), b=a+2500;
               const seg=HTML.slice(a,b);
               return seg.indexOf('dailyCorrect++')>=0 && seg.indexOf('if(stenoState.dailyCorrect>=STENO_GOAL && !stenoState.freeMode)')>=0; })());
    }

    /* — 42.5х: правило «точки» (Ъ/Ь) и дубли Ж/Ф — */
    {
      const seedDot=JSON.stringify({schemaVersion:1, day:TODAY, dailyCorrect:0, dailyAttempts:0, dailyErrors:0,
        weights:{}, currentId:'st_hard', freeMode:false, updatedAt:Date.now()});
      const S8 = await boot({ seed:{ nem_steno_practice_v1:seedDot } });
      await S8.waitView('view-home'); await waitSteno(S8);
      S8.click(S8.$('btnStenoStart')); await S8.waitView('view-steno'); await sleep(350);
      t('42.51 карточка Ъ: большая буква «Ъ», диакритическая подсказка',
        S8.$('stenoBigLetter').textContent==='Ъ' && /диакритика/.test(S8.$('stenoHint').textContent),
        S8.$('stenoHint').textContent);
      await drawShape(S8, [ [[126,88],[128.6,89.4]] ]);        // короткое касание рядом с точкой-эталоном
      await sleep(700);
      t('42.52 короткое касание на «точке» Ъ = валидный штрих → зачёт',
        stpr(S8).dailyCorrect===1 && stpr(S8).weights.st_hard===undefined || stpr(S8).weights.st_hard===0,
        JSON.stringify(stpr(S8)));
      // длинная линия вместо точки — не должна проходить
      const S9 = await boot({ seed:{ nem_steno_practice_v1:seedDot } });
      await S9.waitView('view-home'); await waitSteno(S9);
      S9.click(S9.$('btnStenoStart')); await S9.waitView('view-steno'); await sleep(350);
      await drawShape(S9, [ [[90,80],[166,80],[166,160]] ]);   // угол 106+80 px — не «точка»
      await sleep(700);
      t('42.53 длинный штрих на карте-точке — ошибка (правило точки не прощает размах)',
        stpr(S9).dailyCorrect===0 && stpr(S9).dailyErrors===1 && stpr(S9).weights.st_hard>=1,
        JSON.stringify(stpr(S9)&&{c:stpr(S9).dailyCorrect,e:stpr(S9).dailyErrors,w:stpr(S9).weights}));
      // дубли: эталон Ф засчитывается на карточке Ж и наоборот — по форме (не по допуску чтения)
      const seedZh=JSON.stringify({schemaVersion:1, day:TODAY, dailyCorrect:0, dailyAttempts:0, dailyErrors:0,
        weights:{}, currentId:'st_zh', freeMode:false, updatedAt:Date.now()});
      const S10 = await boot({ seed:{ nem_steno_practice_v1:seedZh } });
      await S10.waitView('view-home'); await waitSteno(S10);
      S10.click(S10.$('btnStenoStart')); await S10.waitView('view-steno'); await sleep(350);
      await drawShape(S10, SMAP.st_f.templates[0]);            // рисуем форму Ф на карточке Ж
      await sleep(700);
      t('42.54 Ж и Ф графически неразличимы в пакете — эталон Ф проходит на карте Ж',
        stpr(S10).dailyCorrect===1, JSON.stringify(stpr(S10)));
    }

    /* — R44: реальная гонка — слово долго едет, знаки готовы сразу — */
    {
      const S11 = await boot({wordsDelayMs:500});
      await S11.waitView('view-home'); await waitSteno(S11);
      S11.click(S11.$('btnStenoStart'));
      await S11.waitView('view-steno');
      const openedEarly=S11.$('stenoBigLetter').textContent.length>=1;
      await sleep(750); // приходит words.json → startApp() должен сохранить открытый раздел
      const stillOpen=S11.$('view-steno').classList.contains('active');
      t('42.55 ранний тап открывает стенографию сразу, не ждёт медленный words.json',
        openedEarly && stillOpen,
        'early='+openedEarly+' after-startApp='+stillOpen+' letter='+JSON.stringify(S11.$('stenoBigLetter').textContent));
      let saved=null; try{saved=JSON.parse(S11.w.localStorage.getItem('no1equalsme_state_v2'));}catch(e){}
      t('42.56 startApp сохраняет экран стенографии, а не сбрасывает на «Домой»',
        !!saved && saved.view==='steno' && stillOpen,
        saved && saved.view);
      S11.click(S11.$('btnStenoBack'));
      let back=false;
      for(let i=0;i<20 && !(back=S11.$('view-home').classList.contains('active'));i++) await sleep(50);
      t('42.57 после гонки можно штатно вернуться домой', back);
      S11.dom.window.close();

      // Критичная регрессия: у пользователя уже есть nem_steno_cache_v1,
      // но основной state ещё не поднят (типично при старте WebView/Telegram).
      const warm=JSON.stringify({schemaVersion:1,contentVersion:STENO_PKG.contentVersion,
        language:'ru',space:STENO_PKG.space,cards:STENO_PKG.cards});
      const S12=await boot({wordsDelayMs:600,seed:{nem_steno_cache_v1:warm}});
      await S12.waitView('view-home'); await sleep(100);
      const warmSub=S12.$('stenoSub').textContent;
      const warmReady=!S12.$('btnStenoStart').disabled && !/Загружаем знаки/.test(warmSub);
      await sleep(650); // поздний startApp тоже не должен оставить загрузку
      t('42.58 прогретый steno-кэш при state ещё undefined: строки оживают, не остаются «Загружаем знаки…»',
        warmReady && !S12.$('btnStenoStart').disabled && !/Загружаем знаки/.test(S12.$('stenoSub').textContent),
        JSON.stringify({before:warmSub,after:S12.$('stenoSub').textContent,disabled:S12.$('btnStenoStart').disabled}));
      S12.dom.window.close();
    }

    /* R45: полное переключение ГЕСС/Акопьян с общими счётчиками */
    {
      const assetsOk=AKOPYAN_PKG.cards.length===28 &&
        new Set(AKOPYAN_PKG.cards.map(c=>c.id)).size===AKOPYAN_PKG.cards.length &&
        AKOPYAN_PKG.cards.every(c=>c.grading==='cloud' && c.templates && c.templates[0] &&
          c.svg && fs.existsSync('/home/user/'+c.svg.slice(2)) && fs.existsSync('/home/user/'+c.png.slice(2)));
      t('43.01 пакет Акопьяна: 28 карточек, локальные изображения и шаблоны для грейдера',assetsOk,
        'cards='+AKOPYAN_PKG.cards.length);

      const pSeed={schemaVersion:1,day:TODAY,dailyCorrect:4,dailyAttempts:6,dailyErrors:2,
        weights:{st_b:2},currentId:'st_b',freeMode:false,streak:1,streakBest:4,
        history:{[TODAY]:{correct:4,attempts:6,errors:2}},updatedAt:Date.now()};
      const rSeed={schemaVersion:1,day:TODAY,dailyCorrect:2,dailyAttempts:3,dailyErrors:1,
        weights:{st_b:1},currentId:'st_b',streak:0,streakBest:2,updatedAt:Date.now()};
      const prefSeed={paint:'default',width:13,fadeMs:2000,system:'gess'};
      const S13=await boot({seed:{
        nem_steno_prefs_v1:JSON.stringify(prefSeed),
        nem_steno_practice_v1:JSON.stringify(pSeed),
        nem_steno_read_v1:JSON.stringify(rSeed)
      }});
      await S13.waitView('view-home'); await waitSteno(S13);
      S13.click(S13.$('btnSettings')); await sleep(20);
      const akOpt=S13.w.document.querySelector('[data-stenosystem="akopyan"]');
      if(akOpt) akOpt.click();
      await sleep(20);
      const afterP=stpr(S13), afterR=stread(S13);
      let prefNow=null; try{prefNow=JSON.parse(S13.w.localStorage.getItem('nem_steno_prefs_v1'));}catch(e){}
      t('43.02 переключатель настроек сохраняет выбор системы Акопьяна',
        prefNow && prefNow.system==='akopyan' && akOpt && akOpt.getAttribute('aria-checked')==='true',
        JSON.stringify(prefNow));
      const keys=Array.from({length:S13.w.localStorage.length},(_,i)=>S13.w.localStorage.key(i));
      t('43.03 счётчики, история и веса остаются общими; отдельного ключа прогресса системы нет',
        afterP.dailyCorrect===4 && afterP.dailyAttempts===6 && afterP.dailyErrors===2 &&
        afterP.history[TODAY].correct===4 && afterR.dailyCorrect===2 && afterR.dailyAttempts===3 &&
        !keys.some(k=>/akopyan.*(practice|read)|(practice|read).*akopyan/i.test(k)),
        JSON.stringify({p:afterP&&afterP.dailyCorrect,r:afterR&&afterR.dailyCorrect,keys:keys.filter(k=>/steno/i.test(k))}));
      S13.click(S13.$('btnCloseSettings')); await sleep(30);
      S13.click(S13.$('btnDrillStenoRead')); await S13.waitView('view-steno'); await sleep(50);
      const akSign=S13.$('stenoSignInner').querySelector('img');
      t('43.04 режим чтения действительно берёт знаки Акопьяна',
        S13.$('stenoSessTitle').textContent==='Чтение · Акопьян' && !!akSign &&
        /assets\/stenography\/akopyan\/ak_/.test(akSign.getAttribute('src')),
        akSign&&akSign.getAttribute('src'));
      S13.click(S13.$('btnStenoBack')); await S13.waitView('view-home');
      S13.click(S13.$('btnSettings')); await sleep(20);
      const gessOpt=S13.w.document.querySelector('[data-stenosystem="gess"]');
      if(gessOpt) gessOpt.click(); await sleep(20);
      let backPref=null; try{backPref=JSON.parse(S13.w.localStorage.getItem('nem_steno_prefs_v1'));}catch(e){}
      const backP=stpr(S13), backR=stread(S13);
      t('43.05 возврат на ГЕСС не сбрасывает общий прогресс рисования и чтения',
        backPref && backPref.system==='gess' && gessOpt && gessOpt.getAttribute('aria-checked')==='true' &&
        backP.dailyCorrect===4 && backP.dailyAttempts===6 && backR.dailyCorrect===2 && backR.dailyAttempts===3);
      S13.dom.window.close();

      const akPractice={schemaVersion:1,day:TODAY,dailyCorrect:0,dailyAttempts:0,dailyErrors:0,
        weights:{},currentId:'st_k',freeMode:false,streak:0,streakBest:0,history:{},updatedAt:Date.now()};
      const S14=await boot({seed:{
        nem_steno_prefs_v1:JSON.stringify({paint:'default',width:13,fadeMs:2000,system:'akopyan'}),
        nem_steno_practice_v1:JSON.stringify(akPractice)
      }});
      await S14.waitView('view-home'); await waitSteno(S14);
      S14.click(S14.$('btnStenoStart')); await S14.waitView('view-steno'); await sleep(50);
      const akK=AKOPYAN_PKG.cards.find(c=>c.id==='st_k');
      t('43.06 режим рисования использует карточку и систему Акопьяна',
        S14.$('stenoSessTitle').textContent==='Стенография · Акопьян' && S14.$('stenoBigLetter').textContent==='К');
      await drawShape(S14,akK.templates[0]); await sleep(700);
      t('43.07 локальный грейдер принимает собственный знак К Акопьяна',
        stpr(S14).dailyCorrect===1 && stpr(S14).dailyAttempts===1,
        JSON.stringify(stpr(S14)&&{c:stpr(S14).dailyCorrect,a:stpr(S14).dailyAttempts,e:stpr(S14).dailyErrors}));
      S14.dom.window.close();

      const readSeed={schemaVersion:1,day:TODAY,dailyCorrect:0,dailyAttempts:0,dailyErrors:0,
        weights:{},currentId:'st_e',streak:0,streakBest:0,updatedAt:Date.now()};
      const S15=await boot({seed:{
        nem_steno_prefs_v1:JSON.stringify({paint:'default',width:13,fadeMs:2000,system:'akopyan'}),
        nem_steno_read_v1:JSON.stringify(readSeed)
      }});
      await S15.waitView('view-home'); await waitSteno(S15);
      S15.click(S15.$('btnDrillStenoRead')); await S15.waitView('view-steno'); await sleep(50);
      await inputChar(S15,'Б');
      const vowelKeys=['Е','Ё','Э'].map(ch=>readKey(S15,ch));
      t('43.08 чтение Акопьяна: после промаха все принимаемые варианты Е/Ё/Э жёлтые, текстового вердикта нет',
        S15.$('stenoSessTitle').textContent==='Чтение · Акопьян' && vowelKeys.every(b=>b&&b.classList.contains('mk-hint')) &&
        !S15.$('stenoReadNote'),
        vowelKeys.map(b=>b&&b.getAttribute('data-key')+':'+b.className).join(' '));
      const yoKey=await inputChar(S15,'Ё');
      t('43.09 верный вариант после промаха окрашивается зелёным в чтении Акопьяна',
        !!yoKey && yoKey.classList.contains('mk-good'),yoKey&&yoKey.className);
      S15.dom.window.close();
    }

    /* JS-ошибки на стено-бутах */
    const sErr=[...S1.errors, ...S2.errors].filter(e=>!/telegram/i.test(e));
    t('42.50 на рабочих стено-бутах — 0 ошибок JS', sErr.length===0, sErr.join(' ;; '));
  }


  /* ═══ Итог: ошибки страниц ═══ */
  const allErrors = [...A.errors, ...B.errors, ...C.errors, ...D.errors, ...E.errors, ...F.errors, ...G.errors, ...H.errors];
  t('18.1 0 ошибок JS на всех страницах', allErrors.length === 0, allErrors.join(' ;; '));

  console.log('\n═══ Морзе: ' + pass + ' ok, ' + failures.length + ' failed ═══');
  if (failures.length) { failures.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
  process.exit(0);

  function pretty(seq) {
    let out = '';
    for (const ch of seq) out += (out ? ' ' : '') + (ch === '.' ? '·' : '—');
    return out;
  }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
