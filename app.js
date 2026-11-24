/*
 * Автономный MVP, воспроизводящий структуру упражнений, видимую на записи.
 * Запись начинается посреди комплекса и обрывается до конца.
 * Длительности ниже — ПРЕДВАРИТЕЛЬНЫЕ значения, не подтвержденные записью.
 * Отдельные этапы Rest сохранены в наблюдаемой последовательности.
 */
const ROUTINE = Object.freeze([
  { name: 'Trembling 2', action: 'Сократить', seconds: 30, rest: false },
  { name: 'Rest', action: 'Расслабить', seconds: 5, rest: true },
  { name: 'Holding', action: 'Сократить и удерживать', seconds: 10, rest: false },
  { name: 'Rest', action: 'Расслабить', seconds: 5, rest: true },
  { name: 'Back Clamp', action: 'Сократить', seconds: 30, rest: false },
  { name: 'Rest', action: 'Расслабить', seconds: 5, rest: true },
  { name: 'Starter', action: 'Сократить', seconds: 30, rest: false },
  { name: 'Rest', action: 'Расслабить', seconds: 5, rest: true },
  { name: 'Short Holding 2', action: 'Сократить и удерживать', seconds: 30, rest: false },
]);

const STORAGE_KEY = 'perso-appo-twice-daily-v1';
const SLOT_LABELS = { morning: 'УТРО', evening: 'ВЕЧЕР' };
const $ = (id) => document.getElementById(id);
const elements = {
  home: $('home-view'), workout: $('workout-view'), finish: $('finish-view'),
  today: $('today-label'), progress: $('day-progress'),
  ring: $('timer-ring'), track: $('timer-track'), number: $('countdown'),
  instruction: $('phase-instruction'), title: $('phase-title'), type: $('phase-type'),
  stepCount: $('step-count'), nextLabel: $('next-label'), slotCaption: $('slot-caption'),
  finishCaption: $('finish-slot-caption'), playPause: $('play-pause'),
  previous: $('previous-phase'), next: $('next-phase'),
};
function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function readHistory() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  } catch { return {}; }
}
let history = readHistory();
let currentSlot = null;
let index = 0;
let remaining = ROUTINE[0].seconds;
let running = false;
let targetTime = 0;
let tickId = null;
let lastKnownDay = dateKey();

function storeHistory() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history)); } catch { alert('Не удалось сохранить отметку в памяти устройства.'); } }
function todayStatus(slot) { return Boolean(history[dateKey()]?.[slot]); }
function refreshHome() {
  const today = new Date();
  lastKnownDay = dateKey(today);
  elements.today.textContent = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(today);
  const finished = Number(todayStatus('morning')) + Number(todayStatus('evening'));
  elements.progress.textContent = `${finished} / 2`;
  for (const slot of ['morning', 'evening']) {
    const done = todayStatus(slot);
    const status = $(`${slot}-status`);
    const button = $(`${slot}-btn`);
    status.textContent = done ? '✓ Выполнено' : 'Не выполнено';
    status.classList.toggle('done', done);
    button.innerHTML = done ? '✓ Выполнено' : 'Начать комплекс <span aria-hidden="true">→</span>';
    button.disabled = done;
  }
}
function switchView(view) {
  [elements.home, elements.workout, elements.finish].forEach(node => node.classList.add('hidden'));
  view.classList.remove('hidden');
}
function clearTimer() { if (tickId !== null) { clearInterval(tickId); tickId = null; } }
function pauseTimer() {
  if (!running) return;
  remaining = Math.max(0, Math.ceil((targetTime - Date.now()) / 1000));
  running = false;
  clearTimer();
  paint();
}
function resetStep(newIndex) {
  clearTimer();
  running = false;
  index = Math.min(Math.max(0, newIndex), ROUTINE.length - 1);
  remaining = ROUTINE[index].seconds;
  paint();
}
function paint() {
  const step = ROUTINE[index];
  elements.ring.classList.toggle('rest', step.rest);
  elements.number.textContent = String(remaining);
  elements.instruction.textContent = step.action;
  elements.title.textContent = step.name;
  elements.type.textContent = `${step.rest ? 'Отдых' : 'Упражнение'} · ${step.seconds} сек.`;
  elements.stepCount.textContent = `${index + 1} / ${ROUTINE.length}`;
  elements.slotCaption.textContent = SLOT_LABELS[currentSlot] || '';
  const next = ROUTINE[index + 1];
  elements.nextLabel.textContent = next ? `Далее: ${next.rest ? 'отдых' : next.name}` : 'Последний этап комплекса';
  elements.previous.disabled = index === 0;
  elements.next.disabled = index === ROUTINE.length - 1;
  elements.track.style.setProperty('--timer-progress', Math.round((1 - remaining / step.seconds) * 100));
  elements.playPause.textContent = running ? 'Ⅱ Пауза' : '▶ Продолжить';
  elements.playPause.className = `primary-button ${running ? 'running' : 'paused'}`;
}
function showFinish() {
  clearTimer();
  running = false;
  elements.finishCaption.textContent = `${SLOT_LABELS[currentSlot]} · КОМПЛЕКС ЗАВЕРШЁН`;
  switchView(elements.finish);
}
function runTick() {
  if (!running) return;
  // Не считаем время в фоне: PWA может быть приостановлено iOS.
  if (document.visibilityState !== 'visible') { pauseTimer(); return; }
  const restMs = targetTime - Date.now();
  if (restMs <= 0) {
    const overshoot = Math.max(0, -restMs);
    if (index === ROUTINE.length - 1) { showFinish(); return; }
    index += 1;
    remaining = ROUTINE[index].seconds;
    targetTime = Date.now() + Math.max(50, remaining * 1000 - overshoot);
  } else {
    remaining = Math.ceil(restMs / 1000);
  }
  paint();
}
function startTimer() {
  if (running) return;
  if (document.visibilityState !== 'visible') return;
  if (remaining <= 0) remaining = ROUTINE[index].seconds;
  targetTime = Date.now() + remaining * 1000;
  running = true;
  clearTimer();
  tickId = setInterval(runTick, 100);
  paint();
}
function begin(slot) {
  refreshHome();
  if (todayStatus(slot)) return;
  currentSlot = slot;
  resetStep(0);
  switchView(elements.workout);
  startTimer();
}
function backHome() { pauseTimer(); currentSlot = null; switchView(elements.home); refreshHome(); }
for (const slot of ['morning', 'evening']) {
  $(`${slot}-btn`).addEventListener('click', () => begin(slot));
}
$('close-workout').addEventListener('click', backHome);
elements.playPause.addEventListener('click', () => running ? pauseTimer() : startTimer());
elements.previous.addEventListener('click', () => resetStep(index - 1));
elements.next.addEventListener('click', () => resetStep(index + 1));
$('confirm-done').addEventListener('click', () => {
  const day = dateKey();
  if (!history[day]) history[day] = {};
  history[day][currentSlot] = true;
  storeHistory();
  currentSlot = null;
  refreshHome();
  switchView(elements.home);
});
$('redo-workout').addEventListener('click', () => { resetStep(0); switchView(elements.workout); startTimer(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') pauseTimer();
  else { if (lastKnownDay !== dateKey()) backHome(); else refreshHome(); }
});
window.addEventListener('focus', () => { if (lastKnownDay !== dateKey()) backHome(); else refreshHome(); });
window.addEventListener('pageshow', () => { if (lastKnownDay !== dateKey()) backHome(); else refreshHome(); });
refreshHome();
switchView(elements.home);
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}