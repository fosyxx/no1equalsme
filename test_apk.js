/* Проверка APK: сайт запускается ровно из собранных в архив файлов,
   демо-словарь проходит валидацию сайта, а статистика переживает перезапуск.
   Сетевых запросов нет — fetch эмулирует shouldInterceptRequest из MainActivity. */
const fs = require('fs');
const { execSync } = require('child_process');
const { JSDOM, VirtualConsole } = require('jsdom');

const tmp = '/tmp/apk-assets';
execSync('rm -rf ' + tmp + ' && mkdir -p ' + tmp + ' && cd ' + tmp + ' && unzip -qo /home/user/No1EqualsMe.apk');
const read = p => fs.readFileSync(tmp + '/' + p, 'utf8');
const HTML = read('assets/www/index.html');
const AKOPYAN_SOURCE = JSON.parse(fs.readFileSync('/home/user/data/stenography-akopyan.json','utf8'));
const FILES = {
  'data/words.json': read('assets/www/data/words.json'),
  'data/morse-signs.json': read('assets/www/data/morse-signs.json'),
  'data/languages.json': read('assets/www/data/languages.json'),
  'data/stenography.json': read('assets/www/data/stenography.json'),
};
// картинки жестов лежат отдельными файлами — проверим, что пути из JSON разрешаются
const SIGN_RE = /"image"\s*:\s*"([^"]+)"/g;
let sm, signPaths = [];
while ((sm = SIGN_RE.exec(FILES['data/morse-signs.json']))) signPaths.push(sm[1]);

let pass = 0; const failures = [];
function t(name, cond, extra) {
  if (cond) { pass++; console.log('✓ ' + name); }
  else { failures.push(name); console.log('✗ ' + name + (extra ? ' | got: ' + extra : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function makeBoot(fetchWordsFail) {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', e => { if (!/Not implemented/.test(e.message)) errors.push(e.message); });
  return function boot(seed) {
    return new Promise((resolve, reject) => {
      const dom = new JSDOM(HTML, {
        url: 'https://morse.local/index.html', runScripts: 'dangerously',
        pretendToBeVisual: true, virtualConsole: vc,
        beforeParse(w) {
          if (seed) Object.keys(seed).forEach(k => w.localStorage.setItem(k, seed[k]));
          w.__audioLog = [];
          const mkParam = () => ({ events: [], value: 0, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v) { this.value = v; }, exponentialRampToValueAtTime(v) { this.value = v; }, cancelScheduledValues() {} });
          w.AudioContext = class { constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; } resume() { return Promise.resolve(); } createOscillator() { return { frequency: mkParam(), connect() {}, start() {}, stop() {} }; } createGain() { return { gain: mkParam(), connect() {} }; } };
          w.Audio = function () { this.play = () => Promise.resolve(); this.pause = () => {}; this.load = () => {}; this.addEventListener = () => {}; Object.defineProperty(this, 'src', { set() {}, get() { return ''; } }); };
          try { Object.defineProperty(w.navigator, 'vibrate', { value: () => true }); } catch (e) {}
          // ——— эмуляция перехватчика MainActivity ———
          w.fetch = function (url) {
            const u = String(url).replace(/^https?:\/\/morse\.local\//, '').replace(/^\.\//, '');
            if (u.indexOf('words.json') >= 0) {
              if (fetchWordsFail) return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') });
              return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(FILES['data/words.json']) });
            }
            if (u.indexOf('morse-signs') >= 0) return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(FILES['data/morse-signs.json']) });
            if (u.indexOf('languages') >= 0) return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(FILES['data/languages.json']) });
            if (u.indexOf('stenography.json') >= 0) return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(FILES['data/stenography.json']) });
            if (/stenography\/.*\.(svg|png)$/.test(u)) {
              const p = u;
              if (!fs.existsSync(tmp + '/assets/www/' + p)) return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') });
              return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(fs.readFileSync(tmp + '/assets/www/' + p, 'utf8')) });
            }
            if (/signs\/.*\.png$/.test(u)) return Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve('png') });
            return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') });
          };
        }
      });
      dom.window.addEventListener('error', e => errors.push(String(e.message)));
      const w = dom.window;
      (async () => {
        for (let i = 0; i < 400 && !(w.document.getElementById('bootScreen') && w.document.getElementById('bootScreen').classList.contains('hide')); i++) await sleep(25);
        resolve({ dom, w, errors });
      })().catch(reject);
    });
  };
}

(async () => {
  const boot = makeBoot(false);

  /* 1. assets целы */
  const same = fs.readFileSync('/home/user/index.html').equals(fs.readFileSync(tmp + '/assets/www/index.html'));
  t('A.0 в APK побайтово тот же index.html, что в исходнике', same);
  t('A.1 каждый ./assets/signs/*.png из JSON лежит в архиве', signPaths.length > 0 && signPaths.every(p => fs.existsSync(tmp + '/assets/www/' + p.replace(/^\.\//, ''))), signPaths.length + ' paths');
  const wpkg = JSON.parse(FILES['data/words.json']);
  const validN = wpkg.cards.filter(c => c.word && (c.definitionShort || c.definitionFull)).length;
  t('A.2 словарь пользователя: 1500 карточек, валидатор сайта принимает все', wpkg.cards.length === 1500 && validN === 1500, wpkg.cards.length + '/' + validN);
  let signOk = false;
  try { execSync('/home/user/.sdk/bt/apksigner verify --verbose /home/user/No1EqualsMe.apk', { stdio: 'pipe' }); signOk = true; } catch (e) {}
  t('A.3 APK подписан и apksigner verify проходит', signOk);

  /* 1b. механизм онлайн-обновления на месте и безопасен при пустом адресе */
  const java = fs.readFileSync('/home/user/android/app/src/local/trainer/morse/MainActivity.java', 'utf8');
  const rp = java.indexOf('private WebResourceResponse respond(WebResourceRequest');
  const rb = java.indexOf('private WebResourceResponse bytes(', rp);
  const respondBody = rp >= 0 && rb > rp ? java.slice(rp, rb) : '';
  t('A.10 рендер-путь только локальный: в respond нет ни единого сетевого вызова',
    rp >= 0 && respondBody.length > 100 && respondBody.indexOf('Http') < 0 &&
    respondBody.indexOf('URLConnection') < 0 && java.includes('private void startUpdateThread'), 'static');
  t('A.14 медиа-ответы: Content-Length + Accept-Ranges + 206 (аудио играет)',
    java.includes('"Content-Length"') && java.includes('"Accept-Ranges", "bytes"') &&
    java.includes('"Content-Range"') && java.includes('code = 206'), 'static');
  t('A.15 кэш только валидированный (JSON с cards, PNG/MP3 по сигнатуре) и чистится версии-смены',
    java.includes('jsonLooksValid') && java.includes('pngValid') && java.includes('audioValid') &&
    java.includes('ensureCacheValid') && java.includes('appVersion'), 'static');
  t('A.10b кулдаун сети: после сбоя 2 минуты тишины, без блокировок UI',
    java.includes('NET_COOLDOWN_MS') && java.includes('netBlockedUntil'), 'static');
  t('A.11 конфиг app-update.json вшит: remote = репозиторий no1equalsme',
    fs.existsSync(tmp + '/assets/app-update.json') &&
    JSON.parse(fs.readFileSync(tmp + '/assets/app-update.json', 'utf8')).remote === 'https://raw.githubusercontent.com/fosyxx/no1equalsme/main' &&
    java.includes('remoteBase.isEmpty()'), 'cfg');

  const crypto = require('crypto');
  const md5 = b => crypto.createHash('md5').update(b).digest('hex');
  const aReal = md5(fs.readFileSync('/home/user/android/vendor/signs/a.png'));
  const aApk = md5(fs.readFileSync(tmp + '/assets/www/assets/signs/a.png'));
  t('A.12 в APK реальные фото жестов из no1equalsme/assets/signs, не заглушки', aReal === aApk, aReal + ' vs ' + aApk);

  const langPkg2 = JSON.parse(FILES['data/languages.json']);
  const audioPaths = [...new Set(langPkg2.cards.map(c => c.audio))];
  const audioOk = audioPaths.every(p => fs.existsSync(tmp + '/assets/www/' + p.replace(/^\.\//, '')));
  t('A.13 все mp3 из languages.json вшиты (озвучка работает офлайн)', audioPaths.length === 500 && audioOk, audioPaths.length + ' refs');

  /* 1b. стенография: файл + 62 графики в архиве; MainActivity тянет и валидирует */
  const stenoPkg = JSON.parse(FILES['data/stenography.json']);
  const stenoFilesOk = stenoPkg.cards.every(c =>
    fs.existsSync(tmp + '/assets/www/' + c.svg.replace(/^\.\//, '')) &&
    fs.existsSync(tmp + '/assets/www/' + c.png.replace(/^\.\//, '')));
  t('A.16 stenography.json вшит; для каждой карточки svg И png лежат в архиве',
    stenoPkg.cards.length === 32 && stenoFilesOk, stenoPkg.cards.length + ' карточек');
  t('A.17 stenography.json из APK проходит сайт-валидатор по структуре (32 буквы ГЕСС, space 80/180, шаблоны)',
    stenoPkg.cards.map(c => c.letter).join('') === 'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ' &&
    stenoPkg.space && stenoPkg.space.size === 256 && stenoPkg.space.controlY === 80 && stenoPkg.space.baselineY === 180 &&
    stenoPkg.cards.every(c => Array.isArray(c.templates) && c.templates.length >= 1 && c.templates.every(t0 => t0.every(s0 => s0.length >= 2))));
  {   // данные и точные картинки ГЕСС самодостаточны в index.html
    const a=HTML.indexOf('=/*STENO-BUILTIN-START*/'), b=HTML.indexOf('/*STENO-BUILTIN-END*/');
    let bi=null; try{ bi=JSON.parse(HTML.slice(a+1+23, b)); }catch(e){}
    t('A.20 STENO_BUILTIN встроен в index.html и равен data/stenography.json',
      !!bi && JSON.stringify(bi)===JSON.stringify(stenoPkg), 'a='+a+' b='+b);
    const sm='=/*STENO-SVG-BUILTIN-START*/', sa=HTML.indexOf(sm), sb=HTML.indexOf('/*STENO-SVG-BUILTIN-END*/',sa);
    let sv=null; try{ sv=JSON.parse(HTML.slice(sa+sm.length,sb)); }catch(e){}
    const svgExact=!!sv && stenoPkg.cards.every(c=>{
      try{ const expected=fs.readFileSync(tmp+'/assets/www/'+c.svg.replace(/^\.\//,''));
           return Buffer.from(sv[c.svg].split(',')[1],'base64').equals(expected); }catch(e){ return false; }
    });
    t('A.22 в index.html встроены оригинальные SVG ГЕСС (побайтово совпадают с APK assets)',
      svgExact, 'svgCount='+(sv?Object.keys(sv).length:0)+' cards='+stenoPkg.cards.length);
  }
  {
    const sm='=/*STENO-AKOPYAN-BUILTIN-START*/', a=HTML.indexOf(sm), b=HTML.indexOf('/*STENO-AKOPYAN-BUILTIN-END*/',a);
    let ak=null; try{ ak=JSON.parse(HTML.slice(a+sm.length,b)); }catch(e){}
    const graphics=!!ak && ak.cards.length===AKOPYAN_SOURCE.cards.length && ak.cards.every(c=>
      c.svg && fs.existsSync(tmp+'/assets/www/'+c.svg.replace(/^\.\//,'')) &&
      c.png && fs.existsSync(tmp+'/assets/www/'+c.png.replace(/^\.\//,'')));
    t('A.24 карточки Акопьяна встроены в index.html, а все знаки есть в APK офлайн',
      !!ak && JSON.stringify(ak)===JSON.stringify(AKOPYAN_SOURCE) && graphics,
      'cards='+(ak?ak.cards.length:0)+' graphics='+graphics);
  }
  t('A.18 MainActivity обновляет стено: pullInto stenography.json + svg-валидатор + докачка svg/png',
    java.includes('pullInto("data/stenography.json"') && java.includes('svgValid') &&
    java.includes('pullMissingMedia("data/stenography.json", "cards", "svg"') &&
    java.includes('pullMissingMedia("data/stenography.json", "cards", "png"'), 'static');

  /* 2. первый запуск: boot-скрин скрывается, данные в localStorage */
  const { w: w1, errors: e1 } = await boot();
  await sleep(400);
  t('A.4 старт без Telegram-моста и без сети: boot-экран скрыт, ошибок нет',
    w1.document.getElementById('bootScreen').classList.contains('hide') && e1.length === 0, e1.slice(0, 2).join(' | '));
  await sleep(600);   // стено-контент в APK грузится с файлов архива
  t('A.19 строка «Стенография» живая: графика из архива, ряд разблокирован',
    !w1.document.getElementById('btnStenoStart').disabled &&
    /цель|начато|из 10|выполн/.test(w1.document.getElementById('stenoSub').textContent),
    JSON.stringify(w1.document.getElementById('stenoSub').textContent));
  {
    const akRead={schemaVersion:1,day:new Date().toISOString().slice(0,10),dailyCorrect:0,dailyAttempts:0,dailyErrors:0,
      weights:{},currentId:'st_e',streak:0,streakBest:0,updatedAt:Date.now()};
    const akApp=await boot({
      nem_steno_prefs_v1:JSON.stringify({paint:'default',width:13,fadeMs:2000,system:'akopyan'}),
      nem_steno_read_v1:JSON.stringify(akRead)
    });
    await sleep(250);
    akApp.w.document.getElementById('btnDrillStenoRead').click(); await sleep(80);
    const akImg=akApp.w.document.querySelector('#stenoSignInner img');
    const akSrc=akImg&&akImg.getAttribute('src');
    t('A.25 APK офлайн запускает чтение Акопьяна и показывает знак из локальных assets',
      akApp.w.document.getElementById('view-steno').getAttribute('data-mode')==='read' &&
      akApp.w.document.getElementById('stenoSessTitle').textContent==='Чтение · Акопьян' &&
      !!akSrc && akSrc.indexOf('assets/stenography/akopyan/')>=0 &&
      fs.existsSync(tmp+'/assets/www/'+akSrc.replace(/^\.\//,'')),akSrc);
    akApp.w.close();
  }
  { // регрессия старого пользователя: valid cache есть, app-state ещё не загружен
    const warm=await boot({'nem_steno_cache_v1':FILES['data/stenography.json']});
    await sleep(150);
    const sub=warm.w.document.getElementById('stenoSub').textContent;
    t('A.23 прогретый кэш знаков не ломает старт: кнопка активна и текст не висит на «Загружаем»',
      !warm.w.document.getElementById('btnStenoStart').disabled && !/Загружаем знаки/.test(sub), sub);
    warm.w.close();
  }
  const keys1 = Object.keys(w1.localStorage);
  const STATE_KEY = 'no1equalsme_state_v2';
  t('A.5 прогресс/настройки пишутся в localStorage под ключом сайта', keys1.indexOf(STATE_KEY) >= 0, keys1.join(','));
  const dictCacheKey = 'nem_content_cache_v1';
  t('A.6 словарь закеширован локально (копия переживёт потерю файла)', !!w1.localStorage.getItem(dictCacheKey) && JSON.parse(w1.localStorage.getItem(dictCacheKey)).cards.length >= 40, String((w1.localStorage.getItem(dictCacheKey) || '').length));

  /* 3. «ответили правильно» → точность обновилась и сохранилась */
  const snap0 = w1.localStorage.getItem(STATE_KEY);
  // реальное действие пользователя: старт сессии + ответ «знаю» на первой карточке
  const click = id => w1.document.getElementById(id).dispatchEvent(new w1.MouseEvent('click', { bubbles: true }));
  click('btnStart');
  await sleep(350);
  click('btnYes');
  await sleep(250);
  const snap1 = w1.localStorage.getItem(STATE_KEY);
  const s1 = JSON.parse(snap1 || '{}');
  const dailyN = Object.keys((s1.daily && s1.daily[w1.eval('todayKey ? todayKey() : today()')]) || {}).length;
  t('A.7 ответ карточки меняет статистику в state (daily/sessionResults)', snap0 !== snap1 && /sessionResults":\{"/.test(snap1 || ''), (snap1 || '').slice(snap1 ? snap1.indexOf('sessionResults') : 0, 0) + ' len ' + (snap1 || '').length);

  /* 4. перезапуск: сидиранее состояние → та же точность; словари fetch уже не нужен (404) */
  const seed = {};
  keys1.forEach(k => { seed[k] = w1.localStorage.getItem(k); });
  seed[STATE_KEY] = snap1;
  w1.close();
  const boot2 = makeBoot(true);            // слова теперь 404 — только локальная копия
  const { w: w2, errors: e2 } = await boot2(seed);
  await sleep(300);
  const back = JSON.parse(w2.localStorage.getItem(STATE_KEY));
  const sameDaily = JSON.stringify(back.daily) === JSON.stringify(s1.daily);
  const sameRes = JSON.stringify(back.sessionResults) === JSON.stringify(s1.sessionResults);
  t('A.8 после перезапуска точность и сессия сохранены', sameDaily && sameRes && (back.sessionResults || back.daily), 'd=' + sameDaily + ' r=' + sameRes);
  t('A.9 словари нет в сети (404) — сайт поднимается из локальной копии', w2.document.getElementById('bootScreen').classList.contains('hide') && e2.length === 0, e2.slice(0, 2).join(' | '));
  const src2 = (w2.document.getElementById('dictSourceText') || {}).textContent || '';
  const cnt2 = (w2.document.getElementById('dictCount') || {}).textContent || '';
  const cached = JSON.parse(w2.localStorage.getItem(dictCacheKey) || '{"cards":[]}');
  t('A.9a в словаре «Локальная копия», счётчик = 1500, кэшlocalStorage тоже 1500', /Локальная копия/.test(src2) && cnt2 === '1500' && cached.cards.length === 1500, src2 + ' | ' + cnt2 + ' | cache=' + cached.cards.length);
  w2.close();

  /* A.21: «бесконечная загрузка» на устройстве — тап по строке должен
     открывать раздел ДАЖЕ если startApp ещё не завершился (слова не подтянулись).
     Запуск без перехватчика вообще: fetch не определен, сеть мертва. */
  {
    const dom3 = new JSDOM(HTML, { url:'https://morse.local/index.html',
      runScripts:'dangerously', pretendToBeVisual:true });
    const w3 = dom3.window, d3 = w3.document, errs3 = [];
    w3.addEventListener('error', e => errs3.push(String(e.message)));
    const sleep2 = ms => new Promise(r => setTimeout(r, ms));
    let sub3 = '';
    for (let i = 0; i < 80; i++) { sub3 = (d3.getElementById('stenoSub') || {}).textContent || ''; if (sub3 && sub3.indexOf('Загружаем') < 0) break; await sleep2(50); }
    d3.getElementById('btnStenoStart').dispatchEvent(new w3.MouseEvent('click', { bubbles: true }));
    let opened3 = false;
    for (let i = 0; i < 60; i++) { if (d3.getElementById('view-steno').classList.contains('active')) { opened3 = true; break; } await sleep2(100); }
    t('A.21 APK без сети (fetch мертва): строка живая, тап ОТКРЫВАЕТ стено с крупной буквой',
      sub3.indexOf('цель') >= 0 && opened3 && (d3.getElementById('stenoBigLetter').textContent || '').length >= 1,
      'sub=' + JSON.stringify(sub3) + ' opened=' + opened3 + ' letter=' + JSON.stringify(d3.getElementById('stenoBigLetter').textContent) + ' errs=' + errs3.slice(0,2).join('|'));
    dom3.window.close();
  }

  console.log('═══ APK: ' + pass + ' ok, ' + failures.length + ' failed ═══');
  process.exit(failures.length ? 1 : 0);
})().catch(e => { console.log('FATAL ' + (e && e.stack || e)); process.exit(2); });
