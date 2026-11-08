/* Standalone regression checks for the actual embedded shorthand references. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const block = fs.readFileSync(path.join(__dirname, 'steno/steno_block.js'), 'utf8');
assert.ok(html.includes(block), 'standalone shorthand block matches the application');
const context = vm.createContext({ Math, Date, Float64Array });
function runRange(start, end) {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from);
  assert.ok(from >= 0 && to > from, start);
  vm.runInContext(html.slice(from, to), context);
}
runRange('var STENO_SHEET=', 'var stenoContent=');
runRange('function stenoResample', '/* ---------- поле рисования ---------- */');
runRange('function stenoCurveTo', 'function stenoPt');
runRange('function stenoPt', 'function stenoFeedback');

function packageFromMarker(prefix) {
  return JSON.parse(html.split('/*' + prefix + '-BUILTIN-START*/')[1]
    .split('/*' + prefix + '-BUILTIN-END*/')[0]);
}
for (const [prefix, filenames] of [
  ['STENO', ['data/stenography.json', 'stenography.json']],
  ['STENO-AKOPYAN', ['data/stenography-akopyan.json']]
]) {
  for (const filename of filenames) {
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(__dirname, filename), 'utf8')),
      packageFromMarker(prefix), filename + ' must match the offline references');
  }
}
function renderedStrokes(template) {
  return template.map(stroke => {
    let last = stroke[0];
    const points = [last];
    context.stenoCurveTo({
      bezierCurveTo(x1, y1, x2, y2, x3, y3) {
        const start = last;
        for (let i = 1; i <= 8; i++) {
          const t = i / 8, q = 1 - t;
          points.push([
            q*q*q*start[0] + 3*q*q*t*x1 + 3*q*t*t*x2 + t*t*t*x3,
            q*q*q*start[1] + 3*q*q*t*y1 + 3*q*t*t*y2 + t*t*t*y3
          ]);
        }
        last = [x3, y3];
      }
    }, stroke);
    return points;
  });
}
function svgStrokes(filename) {
  const svg = fs.readFileSync(path.join(__dirname, filename), 'utf8');
  const strokes = [];
  for (const match of svg.matchAll(/<path\b[^>]*>/g)) {
    if (/stroke-opacity=/.test(match[0])) continue; // guide lines are not part of the sign
    const d = match[0].match(/\bd="([^"]+)"/)[1];
    const tokens = d.match(/[A-Za-z]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/g);
    let i = 0, points;
    while (i < tokens.length) {
      const cmd = tokens[i++];
      if (cmd === 'M') {
        points = [[+tokens[i++], +tokens[i++]]]; strokes.push(points);
      } else if (cmd === 'L') {
        points.push([+tokens[i++], +tokens[i++]]);
      } else if (cmd === 'C') {
        const p = points[points.length - 1];
        const x1 = +tokens[i++], y1 = +tokens[i++], x2 = +tokens[i++], y2 = +tokens[i++];
        const x3 = +tokens[i++], y3 = +tokens[i++];
        for (let j = 1; j <= 12; j++) {
          const t = j / 12, q = 1 - t;
          points.push([
            q*q*q*p[0] + 3*q*q*t*x1 + 3*q*t*t*x2 + t*t*t*x3,
            q*q*q*p[1] + 3*q*q*t*y1 + 3*q*t*t*y2 + t*t*t*y3
          ]);
        }
      } else {
        assert.fail('unsupported sign path command ' + cmd);
      }
    }
  }
  for (const match of svg.matchAll(/<circle\b[^>]*\bcx="([\d.]+)"[^>]*\bcy="([\d.]+)"[^>]*>/g)) {
    strokes.push([[+match[1], +match[2]]]);
  }
  return strokes;
}
let references = 0;
for (const prefix of ['STENO', 'STENO-AKOPYAN']) {
  const pkg = packageFromMarker(prefix);
  for (const card of pkg.cards) {
    for (const template of card.templates) {
      for (const [label, strokes] of [
        ['template', template], ['displayed curve', renderedStrokes(template)]
      ]) {
        const score = context.stenoGrade(strokes, card);
        assert.ok(score >= .74, prefix + ' ' + card.letter + ' ' + label + ': ' + score);
      }
      references++;
    }
    const svgScore = context.stenoGrade(svgStrokes(card.svg), card);
    assert.ok(svgScore >= .74, prefix + ' ' + card.letter + ' SVG reference: ' + svgScore);
  }
}
const ak = packageFromMarker('STENO-AKOPYAN');
const longLine = ak.cards.find(card => card.id === 'st_u');
const shortLine = ak.cards.find(card => card.id === 'st_e');
assert.ok(context.stenoGrade(shortLine.templates[0], longLine) < .74,
  'a short vowel must not pass as the long vowel');
assert.ok(context.stenoGrade([[[20, 20], [230, 230], [20, 230], [230, 20]]], longLine) < .74,
  'an unrelated scribble must not pass');

// Observe the lines actually painted on canvas for both shorthand systems.
let moves = [], lines = [];
const paintContext = {
  setTransform() {}, clearRect() {}, save() {}, restore() {}, setLineDash() {},
  beginPath() {}, stroke() {}, moveTo(x, y) { moves.push([x, y]); },
  lineTo(x, y) { lines.push([x, y]); }
};
Object.assign(context, {
  stenoSizePad: () => ({ cv: { width: 256 }, ctx: paintContext }),
  stenoVar: (_name, fallback) => fallback, stenoInk: () => '#fff',
  STENO_MAP: {}, stenoState: null, stenoTrace: false, stenoDraw: [], stenoPointAt: [],
  stenoPrefs: { width: 13, fadeMs: 0 }, stenoBusySince: 0
});
for (const pkg of [packageFromMarker('STENO'), ak]) {
  moves = []; lines = [];
  context.STENO_CY = pkg.space.controlY;
  context.STENO_BY = pkg.space.baselineY;
  context.stenoPaint();
  assert.deepEqual(moves, [[14, pkg.space.controlY], [14, pkg.space.baselineY]]);
  assert.deepEqual(lines, [[242, pkg.space.controlY], [242, pkg.space.baselineY]]);
}

// Exercise browser input: a quick stroke can end without a pointermove event.
let scheduled = [];
const canvas = { clientWidth: 256, getBoundingClientRect: () => ({ left: 0, top: 0, width: 256, height: 256 }) };
Object.assign(context, {
  $: () => canvas, stenoCanvasCssW: () => 256, stenoPaint() {}, stenoScheduleFade() {},
  stenoBusy: false, stenoMode: 'draw', stenoContent: { ready: true }, stenoPid: null,
  stenoCheckTimer: null, stenoPendingFresh: false, STENO_CHECK_MS: 420,
  stenoCheck() {}, setTimeout(fn, ms) { scheduled.push({ fn, ms }); return scheduled.length; },
  clearTimeout() {}
});
function event(type, x, y) {
  return { type, pointerId: 3, button: 0, clientX: x, clientY: y, currentTarget: canvas, preventDefault() {} };
}
context.stenoDown(event('pointerdown', 40, 80));
context.stenoUp(event('pointerup', 160, 180));
assert.deepEqual(Array.from(context.stenoDraw[0], point => Array.from(point)), [[40, 80], [160, 180]],
  'pointerup preserves the final stroke coordinate');
assert.equal(scheduled.length, 1);
assert.equal(scheduled[0].ms, 420);
context.stenoDraw = []; context.stenoPointAt = []; scheduled = [];
context.stenoDown(event('pointerdown', 40, 80));
context.stenoCancelStroke(event('pointercancel', 50, 90));
assert.equal(context.stenoDraw.length, 0, 'cancelled gesture is discarded');
assert.equal(context.stenoPointAt.length, 0);
assert.equal(scheduled.length, 0, 'cancelled gesture does not schedule grading');
assert.equal(context.stenoPid, null);
console.log('Shorthand: ' + references + ' references and displayed curves pass; guides, input and rejection checks pass.');
