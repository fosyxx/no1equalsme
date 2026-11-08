/* Открытое через полночь приложение: новый план, сохранение прежних ответов. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
function source(name) {
  const start = html.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name);
  return html.slice(start, html.indexOf('\n}', start) + 2);
}
const today = '2026-11-09';
const ctx = vm.createContext({
  Date, MAX_DAILY:15, CARDS:[{id:'answered'},{id:'pending'},{id:'new'}],
  CARD_MAP:{answered:{id:'answered'},pending:{id:'pending'},new:{id:'new'}},
  effDate:() => today, shuffle:a => a, save(){},
  addDaysStr:() => '2026-11-10', lock:false, drag:null, detailsOpen:false,
  goHome(){ctx.state.view='home';},
  elBtnStart:{addEventListener:(_event, fn) => {ctx.startClick=fn;}},
  startPracticeSession(){throw new Error('Yesterday must not start practice');},
  startNewSession(){ctx.started=true;ctx.state.status='active';},
  showView:view => {ctx.state.view=view;}
});
for (const name of ['defaultProg','cardProg','initNewWord','takeNewWords',
  'buildDayPlan','ensureDay','answer','continueFromDefinition']) vm.runInContext(source(name), ctx);
function seed(status='active') {
  ctx.state={status,view:'session',practice:false,practiceBackup:null,
    sessionDate:'2026-11-08',dayPlanDate:'2026-11-08',
    dayQueue:['answered','pending'],queue:['pending'],
    sessionResults:{answered:{done:true}},sessionTotal:2,cardScreen:'question',
    cards:{answered:{status:'learning',currentStep:4,nextReviewDate:'2026-11-20',updatedAt:123},
      pending:{status:'learning',currentStep:2,nextReviewDate:'2026-11-08',updatedAt:50}}};
}
seed();
const answered = JSON.stringify(ctx.state.cards.answered);
ctx.answer(true);
assert.equal(ctx.state.view,'home');
assert.equal(ctx.state.dayPlanDate,today);
assert.equal(ctx.state.status,'idle');
assert.equal(JSON.stringify(ctx.state.cards.answered),answered,'Previous answer is preserved');
assert.equal(ctx.state.cards.pending.currentStep,2,'An old open card is not answered for yesterday');
assert.equal(ctx.state.dayQueue.includes('pending'),true,'Unfinished review stays due');
assert.equal(ctx.state.dayQueue.includes('new'),true);
const dayQueue=JSON.stringify(ctx.state.dayQueue);
ctx.ensureDay();
assert.equal(JSON.stringify(ctx.state.dayQueue),dayQueue,'Returning home cannot rebuild same-day plan');

seed('completed');
const start=html.indexOf("elBtnStart.addEventListener('click', function(){");
vm.runInContext(html.slice(start,html.indexOf('\n});',start)+4),ctx);
ctx.startClick();
assert.equal(ctx.started,true,'New day starts normal session, not yesterday practice');
assert.equal(ctx.state.dayPlanDate,today);
assert.equal(ctx.state.view,'session');

seed(); ctx.state.cardScreen='definition';
ctx.continueFromDefinition(1);
assert.equal(ctx.state.view,'home');
assert.equal(ctx.state.dayPlanDate,today);
assert.equal(JSON.stringify(ctx.state.cards.answered),answered);
console.log('Daily rollover: fresh plan, preserved answers, overdue card and completed-day start passed.');
