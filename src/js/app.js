/**
 * Ligação entre o motor do jogo e a interface: eventos de mouse, toque e
 * teclado, HUD, diálogos, preferências e recordes.
 */

import {
  Cell,
  Status,
  chord,
  createGame,
  hiddenSafeCells,
  isOver,
  minesRemaining,
  normalizeConfig,
  reveal,
  toggleFlag,
} from './engine.js';
import { deduce } from './solver.js';
import { seedFromText } from './rng.js';
import { createBoardView } from './view.js';
import { createAudio } from './sound.js';
import {
  clearStats,
  getStats,
  loadSettings,
  loadStats,
  recordGame,
  saveSettings,
} from './storage.js';

/* --- Dificuldades --------------------------------------------------------- */

const PRESETS = {
  iniciante: { label: 'Iniciante', rows: 9, cols: 9, mines: 10 },
  intermediario: { label: 'Intermediário', rows: 16, cols: 16, mines: 40 },
  especialista: { label: 'Especialista', rows: 16, cols: 30, mines: 99 },
};

const THEME_ORDER = ['sistema', 'claro', 'escuro'];
const THEME_LABEL = { sistema: 'do sistema', claro: 'claro', escuro: 'escuro' };
const LONG_PRESS_MS = 420;
const MOVE_TOLERANCE = 12;

/* --- Atalhos de DOM ------------------------------------------------------- */

const $ = (selector) => document.querySelector(selector);

const el = {
  board: $('#board'),
  viewport: $('#board-viewport'),
  mineCounter: $('#mine-counter'),
  timer: $('#timer'),
  face: $('#btn-face'),
  faceIcon: $('#face-icon'),
  status: $('#status'),
  seedValue: $('#seed-value'),
  chips: [...document.querySelectorAll('.chip')],
  chipCustomMeta: $('#chip-custom-meta'),
  flagMode: $('#btn-flag-mode'),
  hint: $('#btn-hint'),
  zoomIn: $('#btn-zoom-in'),
  zoomOut: $('#btn-zoom-out'),
  zoomValue: $('#zoom-value'),
  result: $('#result'),
  resultEmoji: $('#result-emoji'),
  resultTitle: $('#result-title'),
  resultDetail: $('#result-detail'),
  resultRecord: $('#result-record'),
  playAgain: $('#btn-play-again'),
  sameSeed: $('#btn-same-seed'),
  dlgCustom: $('#dlg-custom'),
  formCustom: $('#form-custom'),
  customRows: $('#custom-rows'),
  customCols: $('#custom-cols'),
  customMines: $('#custom-mines'),
  customNote: $('#custom-note'),
  customError: $('#custom-error'),
  dlgStats: $('#dlg-stats'),
  statsBody: $('#stats-body'),
  clearStats: $('#btn-clear-stats'),
  dlgSettings: $('#dlg-settings'),
  dlgHelp: $('#dlg-help'),
  setNoGuess: $('#set-no-guess'),
  setSafeFirst: $('#set-safe-first'),
  setChord: $('#set-chord'),
  setQuestion: $('#set-question'),
  setSound: $('#set-sound'),
  setVibration: $('#set-vibration'),
  setSeed: $('#set-seed'),
  seedPlay: $('#btn-seed-play'),
  btnSound: $('#btn-sound'),
  btnTheme: $('#btn-theme'),
};

/* --- Estado --------------------------------------------------------------- */

const settings = loadSettings();
const audio = createAudio({ enabled: settings.sound });
const view = createBoardView(el.board);

/** @type {ReturnType<typeof createGame>} */
let game;
let timerId = 0;
let timerStart = 0;
let lastElapsed = 0;
let statusResetId = 0;

const press = {
  index: -1,
  pointerId: null,
  mode: 'none',
  x: 0,
  y: 0,
  longPressId: 0,
};

/* --- Configuração da partida --------------------------------------------- */

function currentConfig() {
  if (settings.difficulty === 'personalizado') {
    const { rows, cols, mines } = settings.custom;
    return { label: 'Personalizado', rows, cols, mines };
  }
  return PRESETS[settings.difficulty] || PRESETS.iniciante;
}

function statsKey() {
  const config = currentConfig();
  return settings.difficulty === 'personalizado'
    ? `custom:${config.rows}x${config.cols}:${config.mines}`
    : settings.difficulty;
}

function labelForStatsKey(key) {
  if (PRESETS[key]) return PRESETS[key].label;
  const match = /^custom:(\d+)x(\d+):(\d+)$/.exec(key);
  return match ? `Personalizado ${match[1]}×${match[2]} · ${match[3]}` : key;
}

/* --- Formatação ----------------------------------------------------------- */

function pad3(value) {
  const negative = value < 0;
  const digits = String(Math.min(999, Math.abs(Math.trunc(value)))).padStart(negative ? 2 : 3, '0');
  return negative ? `-${digits}` : digits;
}

function formatSeconds(seconds) {
  return `${seconds.toFixed(1).replace('.', ',')} s`;
}

function say(message, { transient = false } = {}) {
  el.status.textContent = message;
  clearTimeout(statusResetId);
  if (transient) {
    statusResetId = setTimeout(() => {
      if (el.status.textContent === message) el.status.textContent = defaultStatus();
    }, 4000);
  }
}

function defaultStatus() {
  if (game.status === Status.READY) return 'Clique em qualquer célula para começar.';
  if (game.status === Status.PLAYING) {
    return settings.flagMode ? 'Modo bandeira ligado — toque para marcar.' : '';
  }
  return '';
}

/* --- Ciclo de vida da partida -------------------------------------------- */

function startGame({ seed } = {}) {
  const config = currentConfig();
  stopTimer();
  hideResult();
  try {
    game = createGame({
      rows: config.rows,
      cols: config.cols,
      mines: config.mines,
      seed,
      noGuess: settings.noGuess,
      safeFirstClick: settings.safeFirstClick,
    });
  } catch (error) {
    say(error.message);
    settings.difficulty = 'iniciante';
    saveSettings(settings);
    game = createGame({ ...PRESETS.iniciante, noGuess: settings.noGuess });
  }
  view.mount(game);
  view.focusCell(Math.floor(game.total / 2), { focus: false });
  setFace('🙂');
  lastElapsed = 0;
  updateHud();
  updateChips();
  updateSeedDisplay();
  say(defaultStatus());
}

function restart({ sameSeed = false } = {}) {
  startGame({ seed: sameSeed ? game.seed : undefined });
}

function updateChips() {
  for (const chip of el.chips) {
    chip.setAttribute('aria-pressed', String(chip.dataset.difficulty === settings.difficulty));
  }
  const { rows, cols, mines } = settings.custom;
  el.chipCustomMeta.textContent = `${rows} × ${cols} · ${mines} minas`;
}

function updateSeedDisplay() {
  el.seedValue.textContent = String(game.seed);
  el.setSeed.value = String(game.seed);
  const params = new URLSearchParams({ dif: settings.difficulty, semente: String(game.seed) });
  if (settings.difficulty === 'personalizado') {
    params.set('l', String(game.rows));
    params.set('c', String(game.cols));
    params.set('m', String(game.mineCount));
  }
  try {
    history.replaceState(null, '', `#${params}`);
  } catch {
    /* file:// em alguns navegadores não permite replaceState */
  }
}

function updateHud() {
  const remaining = minesRemaining(game);
  el.mineCounter.textContent = pad3(remaining);
  el.mineCounter.classList.toggle('is-alarm', remaining < 0);
  el.timer.textContent = pad3(Math.floor(lastElapsed));
  el.hint.disabled = isOver(game);
  el.flagMode.setAttribute('aria-pressed', String(settings.flagMode));
}

function setFace(emoji) {
  el.faceIcon.textContent = emoji;
}

/* --- Cronômetro ----------------------------------------------------------- */

function startTimer() {
  timerStart = performance.now();
  lastElapsed = 0;
  clearInterval(timerId);
  timerId = setInterval(() => {
    lastElapsed = (performance.now() - timerStart) / 1000;
    el.timer.textContent = pad3(Math.floor(lastElapsed));
  }, 100);
}

function stopTimer() {
  clearInterval(timerId);
  timerId = 0;
}

/* --- Ações ---------------------------------------------------------------- */

function applyResult(result, { animate = false } = {}) {
  // O cronômetro começa junto com a primeira jogada que realmente abriu algo.
  const justStarted = !timerId && game.status === Status.PLAYING && result.changed.length > 0;
  view.paintMany(result.changed, { animate });

  if (result.invalid.length) {
    for (const index of result.invalid) view.flash(index, 'is-flash', 320);
    audio.invalid();
  }

  if (justStarted) {
    startTimer();
    if (game.noGuess && !game.guaranteedSolvable) {
      say('Não deu tempo de montar um tabuleiro 100% dedutível — esta partida pode exigir um palpite.', {
        transient: true,
      });
    } else {
      say(defaultStatus());
    }
  }

  updateHud();

  if (result.exploded >= 0) {
    finish(false);
  } else if (game.status === Status.WON) {
    finish(true);
  } else if (result.changed.length > 2) {
    audio.cascade(result.changed.length);
  } else if (result.changed.length > 0) {
    audio.reveal();
  }
}

function finish(won) {
  stopTimer();
  const seconds = Math.max(0, (game.finishedAt - game.startedAt) / 1000);
  lastElapsed = seconds;
  el.timer.textContent = pad3(Math.floor(seconds));
  updateHud();
  view.paintAll();
  setFace(won ? '😎' : '😵');

  const { entry, isRecord } = recordGame(statsKey(), { won, seconds });

  if (won) {
    audio.win();
    vibrate([18, 40, 18, 40, 40]);
    view.cheer();
    if (isRecord) audio.record();
  } else {
    audio.explode();
    vibrate([60, 40, 120]);
    view.shake();
  }

  showResult({ won, seconds, entry, isRecord });
}

function showResult({ won, seconds, entry, isRecord }) {
  const config = currentConfig();
  el.resultEmoji.textContent = won ? '🎉' : '💥';
  el.resultTitle.textContent = won ? 'Campo limpo!' : 'Boom!';
  const best = entry.bestTime === null ? null : formatSeconds(entry.bestTime);
  el.resultDetail.textContent = won
    ? `${config.label} em ${formatSeconds(seconds)}${best && !isRecord ? ` · melhor: ${best}` : ''}`
    : `${config.label} · ${formatSeconds(seconds)} até a mina${best ? ` · melhor: ${best}` : ''}`;
  el.resultRecord.hidden = !isRecord;
  el.result.hidden = false;
  el.playAgain.focus({ preventScroll: true });
  say(won ? 'Você venceu!' : 'Você pisou em uma mina.');
}

function hideResult() {
  el.result.hidden = true;
}

// Depois do fim da partida muita gente quer olhar o campo com calma: clicar fora
// do cartão (ou apertar Esc) esconde o aviso sem começar outra partida.
el.result.addEventListener('click', (event) => {
  if (event.target === el.result) {
    hideResult();
    say('Tabuleiro à mostra. R começa outra partida.', { transient: true });
  }
});

function vibrate(pattern) {
  if (!settings.vibration) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignorado */
  }
}

function revealAt(index) {
  if (isOver(game)) return;
  if (game.cells[index] === Cell.REVEALED) {
    if (settings.chordOnNumber) chordAt(index);
    return;
  }
  applyResult(reveal(game, index), { animate: true });
}

function flagAt(index) {
  if (isOver(game) || game.cells[index] === Cell.REVEALED) return;
  const before = game.cells[index];
  const result = toggleFlag(game, index, { allowQuestion: settings.questionMarks });
  if (!result.changed.length) return;
  view.paintMany(result.changed);
  updateHud();
  if (before === Cell.HIDDEN) {
    audio.flag();
    vibrate(12);
  } else {
    audio.unflag();
  }
}

function chordAt(index) {
  if (isOver(game)) return;
  applyResult(chord(game, index), { animate: true });
}

/* --- Dica ----------------------------------------------------------------- */

function playerView() {
  const revealed = new Uint8Array(game.total);
  const flagged = new Uint8Array(game.total);
  for (let i = 0; i < game.total; i++) {
    const state = game.cells[i];
    if (state === Cell.REVEALED) revealed[i] = 1;
    else if (state === Cell.FLAGGED) flagged[i] = 1;
  }
  return { revealed, flagged };
}

function giveHint() {
  if (isOver(game)) return;
  if (!game.placed) {
    say('Abra qualquer célula para começar — a primeira nunca tem mina.', { transient: true });
    return;
  }

  const { revealed, flagged } = playerView();
  const step = deduce({
    adjacent: game.adjacent,
    neighbors: game.neighbors,
    total: game.total,
    mineCount: game.mineCount,
    revealed,
    flagged,
  });

  // As deduções partem das bandeiras do jogador: se alguma estiver errada, o
  // resultado também estará. Conferimos com o tabuleiro real antes de apontar.
  const safe = step.safe.filter((i) => !game.mines[i] && game.cells[i] !== Cell.REVEALED);
  const mines = step.mines.filter((i) => game.mines[i] && game.cells[i] !== Cell.FLAGGED);

  if ((step.safe.length && !safe.length) || (step.mines.length && !mines.length)) {
    say('Alguma bandeira está no lugar errado — as deduções não fecham.', { transient: true });
    audio.invalid();
    return;
  }

  if (safe.length) {
    highlightHint(safe[0], 'Dá para provar que esta célula é segura.');
    return;
  }
  if (mines.length) {
    highlightHint(mines[0], 'Dá para provar que esta célula tem mina.');
    return;
  }

  const fallback = hiddenSafeCells(game);
  if (!fallback.length) return;
  const pick = fallback[Math.floor(Math.random() * fallback.length)];
  highlightHint(pick, 'Nada dá para deduzir agora — mas esta célula é segura.');
}

function highlightHint(index, message) {
  view.flash(index, 'is-hint', 1900);
  view.focusCell(index, { focus: false });
  view.cellAt(index)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  say(message, { transient: true });
}

/* --- Ponteiro (mouse, toque e caneta) ------------------------------------ */

function cellIndexFrom(event) {
  const cell = event.target instanceof Element ? event.target.closest('.cell') : null;
  return cell ? Number(cell.dataset.i) : -1;
}

function cancelPress() {
  clearTimeout(press.longPressId);
  press.longPressId = 0;
  press.index = -1;
  press.mode = 'none';
  press.pointerId = null;
  view.clearPressed();
  if (!isOver(game)) setFace('🙂');
}

el.board.addEventListener('pointerdown', (event) => {
  audio.unlock();
  const index = cellIndexFrom(event);
  if (index < 0 || isOver(game)) return;

  if (event.pointerType === 'mouse') {
    if (event.buttons === 3 || event.button === 1) {
      event.preventDefault();
      press.mode = 'chord';
    } else if (event.button === 2) {
      flagAt(index);
      press.mode = 'none';
      press.index = -1;
      return;
    } else if (event.button === 0) {
      press.mode = settings.flagMode ? 'flag' : 'reveal';
    } else {
      return;
    }
  } else {
    press.mode = settings.flagMode ? 'flag' : 'reveal';
    press.longPressId = setTimeout(() => {
      press.longPressId = 0;
      press.mode = 'none';
      view.clearPressed();
      if (settings.flagMode) revealAt(index);
      else flagAt(index);
      vibrate(18);
    }, LONG_PRESS_MS);
  }

  press.index = index;
  press.pointerId = event.pointerId;
  press.x = event.clientX;
  press.y = event.clientY;
  if (press.mode !== 'none') {
    setFace('😮');
    if (press.mode === 'chord') {
      view.setPressed(index, true);
      forEachChordTarget(index, (nb) => view.setPressed(nb, true));
    } else if (game.cells[index] !== Cell.REVEALED) {
      view.setPressed(index, true);
    }
  }
});

function forEachChordTarget(index, fn) {
  const base = index * 8;
  const count = game.neighbors.counts[index];
  for (let k = 0; k < count; k++) {
    const nb = game.neighbors.offsets[base + k];
    if (game.cells[nb] === Cell.HIDDEN || game.cells[nb] === Cell.QUESTION) fn(nb);
  }
}

el.board.addEventListener('pointermove', (event) => {
  if (press.index < 0 || event.pointerId !== press.pointerId) return;
  if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > MOVE_TOLERANCE) cancelPress();
});

el.board.addEventListener('pointerup', (event) => {
  if (press.index < 0 || event.pointerId !== press.pointerId) return;
  const index = press.index;
  const mode = press.mode;
  const overSameCell = cellIndexFrom(event) === index;
  cancelPress();
  if (!overSameCell || mode === 'none') return;

  if (mode === 'chord') chordAt(index);
  else if (mode === 'flag') flagAt(index);
  else revealAt(index);
});

// Mantém o "roving tabindex" alinhado com o que realmente tem foco: sem isso,
// clicar numa célula e depois usar as setas partiria de outro lugar.
el.board.addEventListener('focusin', (event) => {
  const index = cellIndexFrom(event);
  if (index >= 0) view.focusCell(index, { focus: false });
});

el.board.addEventListener('pointercancel', cancelPress);
el.board.addEventListener('pointerleave', cancelPress);
el.board.addEventListener('contextmenu', (event) => event.preventDefault());
el.board.addEventListener('auxclick', (event) => event.preventDefault());

/* --- Teclado -------------------------------------------------------------- */

el.board.addEventListener('keydown', (event) => {
  const index = view.focusIndex;
  const row = Math.floor(index / game.cols);
  const col = index % game.cols;
  let target = -1;

  switch (event.key) {
    case 'ArrowUp':
      target = row > 0 ? index - game.cols : index;
      break;
    case 'ArrowDown':
      target = row < game.rows - 1 ? index + game.cols : index;
      break;
    case 'ArrowLeft':
      target = col > 0 ? index - 1 : index;
      break;
    case 'ArrowRight':
      target = col < game.cols - 1 ? index + 1 : index;
      break;
    case 'Home':
      target = event.ctrlKey ? 0 : row * game.cols;
      break;
    case 'End':
      target = event.ctrlKey ? game.total - 1 : row * game.cols + (game.cols - 1);
      break;
    case 'PageUp':
      target = col;
      break;
    case 'PageDown':
      target = (game.rows - 1) * game.cols + col;
      break;
    case ' ':
    case 'Spacebar':
      event.preventDefault();
      revealAt(index);
      return;
    case 'Enter':
      event.preventDefault();
      if (game.cells[index] === Cell.REVEALED) chordAt(index);
      else revealAt(index);
      return;
    case 'f':
    case 'F':
      event.preventDefault();
      flagAt(index);
      return;
    default:
      return;
  }

  event.preventDefault();
  view.focusCell(target);
});

document.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const tag = event.target instanceof Element ? event.target.tagName : '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  const dialogOpen = [...document.querySelectorAll('dialog')].some((d) => d.open);

  if (event.key === 'Escape' && !el.result.hidden && !dialogOpen) {
    hideResult();
    return;
  }

  switch (event.key.toLowerCase()) {
    case 'r':
      if (dialogOpen) return;
      restart();
      break;
    case 'd':
      if (dialogOpen) return;
      giveHint();
      break;
    case 'b':
      if (dialogOpen) return;
      setFlagMode(!settings.flagMode);
      break;
    case 'm':
      toggleSound();
      break;
    case 't':
      cycleTheme();
      break;
    case 'h':
      if (dialogOpen) return;
      el.dlgHelp.showModal();
      break;
    case 'e':
      if (dialogOpen) return;
      openStats();
      break;
    case 'p':
      if (dialogOpen) return;
      openSettings();
      break;
    case '1':
    case '2':
    case '3':
    case '4': {
      if (dialogOpen) return;
      const chip = el.chips[Number(event.key) - 1];
      chip?.click();
      break;
    }
    default:
      return;
  }
  event.preventDefault();
});

/* --- Barra de ferramentas ------------------------------------------------- */

function setFlagMode(value) {
  settings.flagMode = value;
  saveSettings(settings);
  el.flagMode.setAttribute('aria-pressed', String(value));
  say(value ? 'Modo bandeira ligado — toque para marcar.' : defaultStatus(), { transient: !value });
}

function applyZoom() {
  document.documentElement.style.setProperty('--zoom', String(settings.zoom));
  el.zoomValue.textContent = `${Math.round(settings.zoom * 100)}%`;
  el.zoomOut.disabled = settings.zoom <= 0.6;
  el.zoomIn.disabled = settings.zoom >= 2;
}

function setZoom(value) {
  settings.zoom = Math.min(2, Math.max(0.6, Math.round(value * 10) / 10));
  saveSettings(settings);
  applyZoom();
}

el.flagMode.addEventListener('click', () => setFlagMode(!settings.flagMode));
el.hint.addEventListener('click', giveHint);
el.zoomIn.addEventListener('click', () => setZoom(settings.zoom + 0.1));
el.zoomOut.addEventListener('click', () => setZoom(settings.zoom - 0.1));
el.face.addEventListener('click', () => restart());
el.playAgain.addEventListener('click', () => restart());
el.sameSeed.addEventListener('click', () => restart({ sameSeed: true }));

el.seedValue.addEventListener('click', async () => {
  const link = `${location.href.split('#')[0]}#${new URLSearchParams({
    dif: settings.difficulty,
    semente: String(game.seed),
  })}`;
  try {
    await navigator.clipboard.writeText(link);
    say('Link com esta semente copiado.', { transient: true });
  } catch {
    say(`Semente: ${game.seed}`, { transient: true });
  }
});

/* --- Dificuldades --------------------------------------------------------- */

for (const chip of el.chips) {
  chip.addEventListener('click', () => {
    const key = chip.dataset.difficulty;
    if (key === 'personalizado') {
      openCustomDialog();
      return;
    }
    settings.difficulty = key;
    saveSettings(settings);
    startGame();
  });
}

/* --- Diálogo: tabuleiro personalizado ------------------------------------ */

function openCustomDialog() {
  el.customRows.value = String(settings.custom.rows);
  el.customCols.value = String(settings.custom.cols);
  el.customMines.value = String(settings.custom.mines);
  validateCustom();
  el.dlgCustom.showModal();
}

function validateCustom() {
  const rows = Number(el.customRows.value);
  const cols = Number(el.customCols.value);
  const max = Math.max(1, rows * cols - 1);
  el.customMines.max = String(max);
  el.customNote.textContent = Number.isFinite(max)
    ? `Máximo de ${max} minas para ${rows} × ${cols}.`
    : '';
  try {
    normalizeConfig({ rows, cols, mines: Number(el.customMines.value) });
    el.customError.textContent = '';
    el.formCustom.querySelector('#custom-submit').disabled = false;
    return true;
  } catch (error) {
    el.customError.textContent = error.message;
    el.formCustom.querySelector('#custom-submit').disabled = true;
    return false;
  }
}

for (const input of [el.customRows, el.customCols, el.customMines]) {
  input.addEventListener('input', validateCustom);
}

el.formCustom.addEventListener('submit', (event) => {
  if (!validateCustom()) {
    event.preventDefault();
    return;
  }
  settings.custom = {
    rows: Number(el.customRows.value),
    cols: Number(el.customCols.value),
    mines: Number(el.customMines.value),
  };
  settings.difficulty = 'personalizado';
  saveSettings(settings);
  startGame();
});

/* --- Diálogo: estatísticas ------------------------------------------------ */

function openStats() {
  const all = loadStats();
  const keys = [...Object.keys(PRESETS), ...Object.keys(all).filter((k) => k.startsWith('custom:'))];
  el.statsBody.textContent = '';

  let hasAny = false;
  for (const key of keys) {
    const entry = getStats(key);
    if (entry.played === 0 && !PRESETS[key]) continue;
    if (entry.played > 0) hasAny = true;
    const tr = document.createElement('tr');
    const rate = entry.played ? Math.round((entry.won / entry.played) * 100) : 0;
    const cells = [
      labelForStatsKey(key),
      String(entry.played),
      entry.played ? `${entry.won} (${rate}%)` : '—',
      entry.bestTime === null ? '—' : formatSeconds(entry.bestTime),
      `${entry.streak} / ${entry.bestStreak}`,
    ];
    cells.forEach((text, i) => {
      const cellEl = document.createElement(i === 0 ? 'th' : 'td');
      if (i === 0) cellEl.scope = 'row';
      cellEl.textContent = text;
      tr.append(cellEl);
    });
    el.statsBody.append(tr);
  }

  if (!hasAny) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.className = 'stats-empty';
    td.textContent = 'Nenhuma partida registrada ainda. Sequência = atual / melhor.';
    tr.append(td);
    el.statsBody.append(tr);
  }

  el.dlgStats.showModal();
}

el.clearStats.addEventListener('click', () => {
  clearStats();
  openStats();
  say('Estatísticas apagadas.', { transient: true });
});

/* --- Diálogo: configurações ---------------------------------------------- */

function openSettings() {
  el.setNoGuess.checked = settings.noGuess;
  el.setSafeFirst.checked = settings.safeFirstClick;
  el.setChord.checked = settings.chordOnNumber;
  el.setQuestion.checked = settings.questionMarks;
  el.setSound.checked = settings.sound;
  el.setVibration.checked = settings.vibration;
  el.setSeed.value = String(game.seed);
  const radio = el.dlgSettings.querySelector(`input[name="theme"][value="${settings.theme}"]`);
  if (radio) radio.checked = true;
  el.dlgSettings.showModal();
}

/** Opções que mudam a geração só valem na próxima partida — salvo se ela nem começou. */
function afterGenerationSettingChange() {
  if (game.status === Status.READY) startGame();
  else say('Vale a partir da próxima partida.', { transient: true });
}

el.setNoGuess.addEventListener('change', () => {
  settings.noGuess = el.setNoGuess.checked;
  saveSettings(settings);
  afterGenerationSettingChange();
});

el.setSafeFirst.addEventListener('change', () => {
  settings.safeFirstClick = el.setSafeFirst.checked;
  saveSettings(settings);
  afterGenerationSettingChange();
});

el.setChord.addEventListener('change', () => {
  settings.chordOnNumber = el.setChord.checked;
  saveSettings(settings);
});

el.setQuestion.addEventListener('change', () => {
  settings.questionMarks = el.setQuestion.checked;
  saveSettings(settings);
});

el.setSound.addEventListener('change', () => setSound(el.setSound.checked));
el.setVibration.addEventListener('change', () => {
  settings.vibration = el.setVibration.checked;
  saveSettings(settings);
});

el.dlgSettings.addEventListener('change', (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.name === 'theme') applyTheme(target.value);
});

el.seedPlay.addEventListener('click', () => {
  const value = el.setSeed.value.trim();
  if (!value) return;
  el.dlgSettings.close();
  startGame({ seed: seedFromText(value) });
  say(`Jogando a semente ${game.seed}.`, { transient: true });
});

for (const button of document.querySelectorAll('[data-close-dialog]')) {
  button.addEventListener('click', () => button.closest('dialog')?.close());
}

/* --- Tema e som ----------------------------------------------------------- */

function applyTheme(theme) {
  settings.theme = theme;
  saveSettings(settings);
  document.documentElement.dataset.theme = theme;
}

function cycleTheme() {
  const next = THEME_ORDER[(THEME_ORDER.indexOf(settings.theme) + 1) % THEME_ORDER.length];
  applyTheme(next);
  const radio = el.dlgSettings.querySelector(`input[name="theme"][value="${next}"]`);
  if (radio) radio.checked = true;
  say(`Tema ${THEME_LABEL[next]}.`, { transient: true });
}

function setSound(value) {
  settings.sound = value;
  saveSettings(settings);
  audio.setEnabled(value);
  el.btnSound.setAttribute('aria-pressed', String(value));
  el.setSound.checked = value;
  if (value) audio.reveal();
}

function toggleSound() {
  setSound(!settings.sound);
  say(settings.sound ? 'Som ligado.' : 'Som desligado.', { transient: true });
}

el.btnSound.addEventListener('click', toggleSound);
el.btnTheme.addEventListener('click', cycleTheme);
$('#btn-help').addEventListener('click', () => el.dlgHelp.showModal());
$('#btn-stats').addEventListener('click', openStats);
$('#btn-settings').addEventListener('click', openSettings);

/* --- Link compartilhado --------------------------------------------------- */

function readLink() {
  const params = new URLSearchParams(location.hash.slice(1));
  const dif = params.get('dif');
  const seedParam = params.get('semente');
  if (dif === 'personalizado') {
    const rows = Number(params.get('l'));
    const cols = Number(params.get('c'));
    const mines = Number(params.get('m'));
    try {
      settings.custom = normalizeConfig({ rows, cols, mines });
      settings.difficulty = 'personalizado';
    } catch {
      /* link inválido: ignora */
    }
  } else if (dif && PRESETS[dif]) {
    settings.difficulty = dif;
  }
  return seedParam ? seedFromText(seedParam) : undefined;
}

/* --- Início --------------------------------------------------------------- */

const linkSeed = readLink();
document.documentElement.dataset.theme = settings.theme;
el.btnSound.setAttribute('aria-pressed', String(settings.sound));
applyZoom();
startGame({ seed: linkSeed });

if (!settings.seenHelp) {
  settings.seenHelp = true;
  saveSettings(settings);
  setTimeout(() => el.dlgHelp.showModal(), 500);
}

// Ajuda o desenvolvimento e os testes de navegador sem expor nada sensível.
globalThis.campoMinado = {
  get game() {
    return game;
  },
  restart,
  startGame,
  settings,
};
